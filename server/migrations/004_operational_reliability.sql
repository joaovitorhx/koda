-- Upgrade for existing installations: overlapping alerts and offline reconciliation.
BEGIN;
CREATE TABLE IF NOT EXISTS public.mobile_telemetry_conflicts (
  client_id uuid PRIMARY KEY,
  driver_id integer NOT NULL REFERENCES public.users(id),
  trip_id integer NOT NULL REFERENCES public.entregas(id),
  reason text NOT NULL CHECK (reason IN ('outside_trip','trip_not_started','payload_conflict')),
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mobile_telemetry_conflicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mobile_telemetry_conflicts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.mobile_telemetry_conflicts TO service_role;

CREATE OR REPLACE FUNCTION public.koda_mobile_alerts(p_driver integer, p_trip integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.aberto_at DESC), '[]'::jsonb)
 FROM jsonb_array_elements(koda_mobile_trips(p_driver,p_trip)) t
 JOIN carga_alertas a ON a.id_carga=coalesce((t->>'carga_id_mobile')::integer,(t->'caminhao'->>'id_carga')::integer)
 WHERE (t->>'data_saida') IS NOT NULL
 AND a.aberto_at <= coalesce((t->>'data_entrega')::timestamp,CASE WHEN t->>'status'='cancelada' THEN (t->>'updated_at')::timestamp END,timezone('utc',now()))
 AND coalesce(a.resolvido_at,CASE WHEN a.status='aberto' THEN 'infinity'::timestamp ELSE a.updated_at END) >= (t->>'data_saida')::timestamp;
$$;
REVOKE ALL ON FUNCTION public.koda_mobile_alerts(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.koda_mobile_alerts(integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.koda_mobile_telemetry(p_driver integer,p_readings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r jsonb; e public.entregas; t public.caminhao; cargo_id integer;
 accepted jsonb:='[]'; rejected jsonb:='[]'; stamp timestamp; reason text;
 existing public.carga_telemetria_auditoria; conflict public.mobile_telemetry_conflicts;
BEGIN
 PERFORM 1 FROM users WHERE id=p_driver AND role='driver' AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Motorista sem acesso' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_readings)<>'array' OR jsonb_array_length(p_readings) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Lote inválido' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_readings) ORDER BY (value->>'tripId')::integer,(value->>'timestamp')::timestamptz LOOP
   SELECT t0.* INTO t FROM caminhao t0 JOIN entregas e0 ON e0.id_caminhao=t0.id WHERE e0.id=(r->>'tripId')::integer FOR UPDATE OF t0;
   SELECT * INTO e FROM entregas WHERE id=(r->>'tripId')::integer FOR UPDATE;
   IF e.id IS NULL OR coalesce(e.motorista_id_mobile,t.id_usuario) IS DISTINCT FROM p_driver THEN RAISE EXCEPTION 'Viagem indisponível' USING ERRCODE='42501'; END IF;
   stamp:=timezone('utc',(r->>'timestamp')::timestamptz);
   IF (r->>'id') IS NULL OR stamp IS NULL OR stamp>timezone('utc',now())+interval '1 minute'
      OR (r->>'temperature') IS NULL OR (r->>'temperature')::numeric NOT BETWEEN -100 AND 100
      OR ((r->>'latitude') IS NOT NULL AND (r->>'latitude')::numeric NOT BETWEEN -90 AND 90)
      OR ((r->>'longitude') IS NOT NULL AND (r->>'longitude')::numeric NOT BETWEEN -180 AND 180)
   THEN RAISE EXCEPTION 'Leitura inválida' USING ERRCODE='22023'; END IF;
   SELECT * INTO conflict FROM mobile_telemetry_conflicts WHERE client_id=(r->>'id')::uuid;
   IF conflict.client_id IS NOT NULL THEN
     IF conflict.driver_id<>p_driver OR conflict.trip_id<>e.id OR conflict.payload<>r THEN RAISE EXCEPTION 'Identificador reutilizado com dados diferentes' USING ERRCODE='22023'; END IF;
     rejected:=rejected||jsonb_build_array(jsonb_build_object('id',r->>'id','reason',conflict.reason));CONTINUE;
   END IF;
   reason:=NULL;
   SELECT * INTO existing FROM carga_telemetria_auditoria WHERE client_id_mobile=(r->>'id')::uuid;
   IF existing.id IS NOT NULL THEN
     IF existing.id_entrega_mobile IS DISTINCT FROM e.id OR existing.temperatura IS DISTINCT FROM round((r->>'temperature')::numeric,2)
       OR existing.created_at IS DISTINCT FROM stamp OR existing.latitude IS DISTINCT FROM round((r->>'latitude')::numeric,6)
       OR existing.longitude IS DISTINCT FROM round((r->>'longitude')::numeric,6)
     THEN RAISE EXCEPTION 'Identificador reutilizado com dados diferentes' USING ERRCODE='22023'; END IF;
     accepted:=accepted||jsonb_build_array(r->>'id');CONTINUE;
   END IF;
   IF e.data_saida IS NULL OR e.status='pendente' THEN reason:='trip_not_started';
   ELSIF stamp<e.data_saida-interval '1 minute'
     OR (e.data_entrega IS NOT NULL AND stamp>e.data_entrega)
     OR (e.status='cancelada' AND stamp>e.updated_at)
     OR (e.status='entregue' AND e.data_entrega IS NULL)
   THEN reason:='outside_trip'; END IF;
   IF reason IS NOT NULL THEN
     INSERT INTO mobile_telemetry_conflicts(client_id,driver_id,trip_id,reason,payload) VALUES((r->>'id')::uuid,p_driver,e.id,reason,r);
     rejected:=rejected||jsonb_build_array(jsonb_build_object('id',r->>'id','reason',reason));CONTINUE;
   END IF;
   cargo_id:=coalesce(e.carga_id_mobile,t.id_carga);
   IF cargo_id IS NULL THEN RAISE EXCEPTION 'Carga não informada' USING ERRCODE='P0001'; END IF;
   PERFORM 1 FROM carga WHERE id=cargo_id FOR UPDATE;
   INSERT INTO carga_telemetria_auditoria(id_carga,id_entrega_mobile,client_id_mobile,temperatura,latitude,longitude,created_at)
   VALUES(cargo_id,e.id,(r->>'id')::uuid,(r->>'temperature')::numeric,(r->>'latitude')::numeric,(r->>'longitude')::numeric,stamp);
   -- Completed trips receive their late audit rows, without moving a reused cargo.
   IF e.status IN ('em_transito','no_armazem') AND NOT EXISTS(SELECT 1 FROM carga_telemetria_auditoria WHERE id_carga=cargo_id AND created_at>stamp) THEN
     UPDATE carga SET temperatura_atual=(r->>'temperature')::numeric,latitude=coalesce((r->>'latitude')::numeric,latitude),longitude=coalesce((r->>'longitude')::numeric,longitude),updated_at=timezone('utc',now()) WHERE id=cargo_id;
   END IF;
   accepted:=accepted||jsonb_build_array(r->>'id');
 END LOOP;
 RETURN jsonb_build_object('acceptedIds',accepted,'rejected',rejected);
END;
$$;
REVOKE ALL ON FUNCTION public.koda_mobile_telemetry(integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.koda_mobile_telemetry(integer,jsonb) TO service_role;
COMMIT;
