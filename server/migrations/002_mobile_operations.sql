-- Apply once to the SAME database used by koda-web / koda-server.
-- Existing schema.sql + migration 003_carga_alertas.sql are prerequisites.
BEGIN;
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS motorista_id_mobile integer REFERENCES public.users(id);
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS carga_id_mobile integer REFERENCES public.carga(id);
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS sensor_id_mobile text;
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS snapshot_mobile jsonb;
ALTER TABLE public.carga_telemetria_auditoria ADD COLUMN IF NOT EXISTS id_entrega_mobile integer REFERENCES public.entregas(id);
ALTER TABLE public.carga_telemetria_auditoria ADD COLUMN IF NOT EXISTS client_id_mobile uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mobile_reading_client ON public.carga_telemetria_auditoria(client_id_mobile);
CREATE INDEX IF NOT EXISTS idx_mobile_trip_readings ON public.carga_telemetria_auditoria(id_entrega_mobile, created_at);

-- Every RPC is invoker-rights and executable ONLY by the server role.
-- p_driver comes from /users/profile, never from a client-provided driver ID.
CREATE OR REPLACE FUNCTION public.koda_mobile_trips(p_driver integer, p_trip integer DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(row ORDER BY (row->>'id')::integer DESC), '[]'::jsonb) FROM (
 SELECT to_jsonb(e) || jsonb_build_object(
   'caminhao', coalesce(e.snapshot_mobile->'caminhao', to_jsonb(t)),
   'carga', coalesce(e.snapshot_mobile->'carga', to_jsonb(c)) || jsonb_build_object('temperatura_atual', c.temperatura_atual, 'latitude', c.latitude, 'longitude', c.longitude),
   'cliente', coalesce(e.snapshot_mobile->'cliente', to_jsonb(cl)),
   'centro', coalesce(e.snapshot_mobile->'centro', to_jsonb(ce))
 ) AS row
 FROM public.entregas e JOIN public.caminhao t ON t.id = e.id_caminhao
 LEFT JOIN public.carga c ON c.id = coalesce(e.carga_id_mobile, t.id_carga)
 JOIN public.clientes cl ON cl.id = e.id_cliente
 LEFT JOIN public.centro_logistica ce ON ce.id = t.id_centro_logistica
 WHERE coalesce(e.motorista_id_mobile, t.id_usuario) = p_driver
 AND (p_trip IS NULL OR e.id = p_trip)
 AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_driver AND u.role = 'driver' AND u.is_active)
 ) x;
$$;

CREATE OR REPLACE FUNCTION public.koda_mobile_start(p_driver integer, p_trip integer, p_sensor text DEFAULT NULL, p_position jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE e public.entregas; t public.caminhao; c public.carga; cl public.clientes; ce public.centro_logistica;
BEGIN
 PERFORM 1 FROM users WHERE id=p_driver AND role='driver' AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Motorista sem acesso' USING ERRCODE='42501'; END IF;
 -- Lock the vehicle before the trip consistently across start/finish/telemetry.
 SELECT t0.* INTO t FROM caminhao t0 JOIN entregas e0 ON e0.id_caminhao=t0.id WHERE e0.id=p_trip FOR UPDATE OF t0;
 SELECT * INTO e FROM entregas WHERE id=p_trip FOR UPDATE;
 IF e.id IS NULL OR coalesce(e.motorista_id_mobile,t.id_usuario) <> p_driver THEN RAISE EXCEPTION 'Viagem indisponível' USING ERRCODE='42501'; END IF;
 IF e.status IN ('em_transito','no_armazem') THEN RETURN jsonb_build_object('id', e.id, 'status', e.status); END IF;
 IF e.status <> 'pendente' OR t.status NOT IN ('disponivel','em_espera') THEN RAISE EXCEPTION 'Viagem ou veículo não disponível para início' USING ERRCODE='P0001'; END IF;
 IF EXISTS (SELECT 1 FROM entregas e2 JOIN caminhao t2 ON t2.id=e2.id_caminhao WHERE e2.id<>e.id AND e2.status IN ('em_transito','no_armazem') AND (e2.id_caminhao=t.id OR coalesce(e2.motorista_id_mobile,t2.id_usuario)=p_driver)) THEN RAISE EXCEPTION 'Conclua a viagem ativa antes de iniciar outra' USING ERRCODE='P0001'; END IF;
 SELECT * INTO c FROM carga WHERE id=t.id_carga FOR UPDATE;
 SELECT * INTO cl FROM clientes WHERE id=e.id_cliente;
 SELECT * INTO ce FROM centro_logistica WHERE id=t.id_centro_logistica;
 IF c.id IS NULL OR c.temperatura_minima > c.temperatura_maxima OR NOT cl.is_ativo THEN RAISE EXCEPTION 'Revise a carga e o destinatário com a central' USING ERRCODE='P0001'; END IF;
 IF p_position IS NOT NULL AND ((p_position->>'latitude')::numeric NOT BETWEEN -90 AND 90 OR (p_position->>'longitude')::numeric NOT BETWEEN -180 AND 180) THEN RAISE EXCEPTION 'Posição inválida' USING ERRCODE='22023'; END IF;
 UPDATE entregas SET status='em_transito', data_saida=timezone('utc',now()), updated_at=timezone('utc',now()), motorista_id_mobile=p_driver, carga_id_mobile=c.id, sensor_id_mobile=p_sensor,
 snapshot_mobile=jsonb_build_object('caminhao',to_jsonb(t),'carga',to_jsonb(c),'cliente',to_jsonb(cl),'centro',to_jsonb(ce),'start_position',p_position) WHERE id=p_trip;
 IF p_position IS NOT NULL THEN UPDATE carga SET latitude=coalesce((p_position->>'latitude')::numeric,latitude),longitude=coalesce((p_position->>'longitude')::numeric,longitude),updated_at=timezone('utc',now()) WHERE id=c.id; END IF;
 UPDATE caminhao SET status='em_rota', updated_at=timezone('utc',now()) WHERE id=t.id;
 RETURN jsonb_build_object('id',p_trip,'status','em_transito');
END;
$$;

CREATE OR REPLACE FUNCTION public.koda_mobile_sensor(p_driver integer, p_trip integer, p_sensor text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE e public.entregas;
BEGIN
 SELECT e0.* INTO e FROM entregas e0 JOIN caminhao t ON t.id=e0.id_caminhao
 WHERE e0.id=p_trip AND coalesce(e0.motorista_id_mobile,t.id_usuario)=p_driver FOR UPDATE OF e0;
 IF e.id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE id=p_driver AND role='driver' AND is_active) THEN RAISE EXCEPTION 'Viagem indisponível' USING ERRCODE='42501'; END IF;
 IF e.status NOT IN ('pendente','em_transito','no_armazem') THEN RAISE EXCEPTION 'Viagem encerrada' USING ERRCODE='P0001'; END IF;
 IF length(p_sensor) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Sensor inválido' USING ERRCODE='22023'; END IF;
 UPDATE entregas SET sensor_id_mobile=p_sensor,updated_at=timezone('utc',now()) WHERE id=e.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.koda_mobile_telemetry(p_driver integer, p_readings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r jsonb; e public.entregas; t public.caminhao; cargo_id integer; accepted jsonb := '[]'; stamp timestamp; existing public.carga_telemetria_auditoria;
BEGIN
 PERFORM 1 FROM users WHERE id=p_driver AND role='driver' AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Motorista sem acesso' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_readings)<>'array' OR jsonb_array_length(p_readings) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Lote inválido' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_readings) ORDER BY (value->>'tripId')::integer,(value->>'timestamp')::timestamptz LOOP
   SELECT t0.* INTO t FROM caminhao t0 JOIN entregas e0 ON e0.id_caminhao=t0.id WHERE e0.id=(r->>'tripId')::integer FOR UPDATE OF t0;
   SELECT * INTO e FROM entregas WHERE id=(r->>'tripId')::integer FOR UPDATE;
   IF e.id IS NULL OR coalesce(e.motorista_id_mobile,t.id_usuario)<>p_driver THEN RAISE EXCEPTION 'Viagem indisponível' USING ERRCODE='42501'; END IF;
   SELECT * INTO existing FROM carga_telemetria_auditoria WHERE client_id_mobile=(r->>'id')::uuid;
   IF existing.id IS NOT NULL THEN
     IF existing.id_entrega_mobile IS DISTINCT FROM e.id
       OR existing.temperatura IS DISTINCT FROM round((r->>'temperature')::numeric,2)
       OR existing.created_at IS DISTINCT FROM timezone('utc',(r->>'timestamp')::timestamptz)
       OR existing.latitude IS DISTINCT FROM round((r->>'latitude')::numeric,6)
       OR existing.longitude IS DISTINCT FROM round((r->>'longitude')::numeric,6) THEN RAISE EXCEPTION 'Identificador reutilizado com dados diferentes' USING ERRCODE='22023'; END IF;
     accepted:=accepted || jsonb_build_array(r->>'id'); CONTINUE;
   END IF;
   IF e.status NOT IN ('em_transito','no_armazem') THEN RAISE EXCEPTION 'Viagem não está ativa' USING ERRCODE='P0001'; END IF;
   cargo_id:=coalesce(e.carga_id_mobile,t.id_carga);
   IF cargo_id IS NULL THEN RAISE EXCEPTION 'Carga não informada' USING ERRCODE='P0001'; END IF;
   PERFORM 1 FROM carga WHERE id=cargo_id FOR UPDATE;
   stamp:=timezone('utc',(r->>'timestamp')::timestamptz);
   IF stamp IS NULL OR stamp > timezone('utc',now())+interval '1 minute' OR stamp < e.data_saida-interval '1 minute'
      OR (r->>'temperature') IS NULL OR (r->>'temperature')::numeric NOT BETWEEN -100 AND 100
      OR ((r->>'latitude') IS NOT NULL AND (r->>'latitude')::numeric NOT BETWEEN -90 AND 90)
      OR ((r->>'longitude') IS NOT NULL AND (r->>'longitude')::numeric NOT BETWEEN -180 AND 180)
   THEN RAISE EXCEPTION 'Leitura inválida' USING ERRCODE='22023'; END IF;
   INSERT INTO carga_telemetria_auditoria(id_carga,id_entrega_mobile,client_id_mobile,temperatura,latitude,longitude,created_at)
   VALUES(cargo_id,e.id,(r->>'id')::uuid,(r->>'temperature')::numeric,(r->>'latitude')::numeric,(r->>'longitude')::numeric,stamp);
   -- Preserve the latest known temperature/GPS when an older offline packet arrives.
   IF NOT EXISTS(SELECT 1 FROM carga_telemetria_auditoria WHERE id_carga=cargo_id AND created_at>stamp) THEN
     UPDATE carga SET temperatura_atual=(r->>'temperature')::numeric,latitude=coalesce((r->>'latitude')::numeric,latitude),longitude=coalesce((r->>'longitude')::numeric,longitude),updated_at=timezone('utc',now()) WHERE id=cargo_id;
   END IF;
   accepted:=accepted || jsonb_build_array(r->>'id');
 END LOOP;
 RETURN jsonb_build_object('acceptedIds',accepted);
END;
$$;

CREATE OR REPLACE FUNCTION public.koda_mobile_finish(p_driver integer, p_trip integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE e public.entregas; t public.caminhao; c public.carga; cl public.clientes; ce public.centro_logistica;
BEGIN
 PERFORM 1 FROM users WHERE id=p_driver AND role='driver' AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Motorista sem acesso' USING ERRCODE='42501'; END IF;
 SELECT t0.* INTO t FROM caminhao t0 JOIN entregas e0 ON e0.id_caminhao=t0.id WHERE e0.id=p_trip FOR UPDATE OF t0;
 SELECT * INTO e FROM entregas WHERE id=p_trip FOR UPDATE;
 IF e.id IS NULL OR coalesce(e.motorista_id_mobile,t.id_usuario)<>p_driver THEN RAISE EXCEPTION 'Viagem indisponível' USING ERRCODE='42501'; END IF;
 IF e.status='entregue' THEN RETURN jsonb_build_object('id',e.id,'status',e.status); END IF;
 IF e.status NOT IN ('em_transito','no_armazem') THEN RAISE EXCEPTION 'Apenas uma viagem ativa pode ser concluída' USING ERRCODE='P0001'; END IF;
 SELECT * INTO c FROM carga WHERE id=coalesce(e.carga_id_mobile,t.id_carga);
 SELECT * INTO cl FROM clientes WHERE id=e.id_cliente;
 SELECT * INTO ce FROM centro_logistica WHERE id=t.id_centro_logistica;
 UPDATE entregas SET snapshot_mobile=coalesce(e.snapshot_mobile,jsonb_build_object('caminhao',to_jsonb(t),'carga',to_jsonb(c),'cliente',to_jsonb(cl),'centro',to_jsonb(ce))),status='entregue',data_entrega=timezone('utc',now()),updated_at=timezone('utc',now()),motorista_id_mobile=p_driver,carga_id_mobile=coalesce(e.carga_id_mobile,t.id_carga) WHERE id=e.id;
 IF NOT EXISTS(SELECT 1 FROM entregas WHERE id_caminhao=t.id AND id<>e.id AND status IN ('em_transito','no_armazem')) THEN UPDATE caminhao SET status='disponivel',updated_at=timezone('utc',now()) WHERE id=t.id; END IF;
 RETURN jsonb_build_object('id',e.id,'status','entregue');
END;
$$;

REVOKE ALL ON FUNCTION public.koda_mobile_trips(integer,integer), public.koda_mobile_start(integer,integer,text,jsonb), public.koda_mobile_sensor(integer,integer,text), public.koda_mobile_telemetry(integer,jsonb), public.koda_mobile_finish(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.koda_mobile_trips(integer,integer), public.koda_mobile_start(integer,integer,text,jsonb), public.koda_mobile_sensor(integer,integer,text), public.koda_mobile_telemetry(integer,jsonb), public.koda_mobile_finish(integer,integer) TO service_role;
COMMIT;
