-- Keep the existing central alert trigger chronological. Run after 001 and 002.
BEGIN;
CREATE OR REPLACE FUNCTION fn_carga_telemetria_processar_alertas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_min       DECIMAL(5,2);
    v_max       DECIMAL(5,2);
    v_tipo      TEXT;
    v_alerta_id INT;
BEGIN
    -- Offline packets remain in the audit trail. They must not reverse a newer
    -- thermal state already observed by the web central or another device.
    IF EXISTS (SELECT 1 FROM public.carga_telemetria_auditoria
        WHERE id_carga = NEW.id_carga AND
        (created_at > NEW.created_at OR (created_at = NEW.created_at AND id > NEW.id))) THEN
        RETURN NEW;
    END IF;
    -- Lê faixa atual da carga referenciada
    SELECT temperatura_minima, temperatura_maxima
      INTO v_min, v_max
      FROM carga
     WHERE id = NEW.id_carga;

    -- Se a carga não existe ou não tem faixa, não há o que avaliar
    IF v_min IS NULL OR v_max IS NULL THEN
        RETURN NEW;
    END IF;

    -- Classifica a leitura
    IF NEW.temperatura > v_max THEN
        v_tipo := 'alta';
    ELSIF NEW.temperatura < v_min THEN
        v_tipo := 'baixa';
    ELSE
        v_tipo := NULL;  -- dentro da faixa
    END IF;

    ----------------------------------------------------------------
    -- CASO A: leitura DENTRO da faixa
    --   Fecha qualquer alerta aberto da carga (independente do tipo).
    ----------------------------------------------------------------
    IF v_tipo IS NULL THEN
        UPDATE carga_alertas
           SET status                  = 'resolvido',
               resolvido_at            = NEW.created_at,
               resolvido_telemetria_id = NEW.id,
               temperatura_fim         = NEW.temperatura,
               qtd_pings               = qtd_pings + 1,
               updated_at              = CURRENT_TIMESTAMP
         WHERE id_carga = NEW.id_carga
           AND status   = 'aberto';

        RETURN NEW;
    END IF;

    ----------------------------------------------------------------
    -- CASO B: leitura FORA da faixa
    --   B.1) Existe alerta aberto do MESMO tipo  → só atualiza
    --   B.2) Existe alerta aberto do TIPO OPOSTO → fecha o oposto e
    --        abre o novo (cruzou de baixa para alta ou vice-versa)
    --   B.3) Não existe alerta aberto            → abre novo
    --
    -- Lock pessimista (FOR UPDATE) garante que dois inserts
    -- concorrentes não criem 2 alertas iguais (o índice unique parcial
    -- também blinda isso, mas o lock evita o erro 23505).
    ----------------------------------------------------------------
    SELECT id INTO v_alerta_id
      FROM carga_alertas
     WHERE id_carga = NEW.id_carga
       AND tipo     = v_tipo
       AND status   = 'aberto'
     FOR UPDATE;

    IF FOUND THEN
        -- B.1 — só atualiza pico e contagem
        UPDATE carga_alertas
           SET temperatura_pico = CASE
                   WHEN tipo = 'alta' THEN GREATEST(temperatura_pico, NEW.temperatura)
                   ELSE                   LEAST   (temperatura_pico, NEW.temperatura)
               END,
               qtd_pings  = qtd_pings + 1,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = v_alerta_id;
    ELSE
        -- B.2 — fecha alerta do tipo OPOSTO se houver
        UPDATE carga_alertas
           SET status                  = 'resolvido',
               resolvido_at            = NEW.created_at,
               resolvido_telemetria_id = NEW.id,
               temperatura_fim         = NEW.temperatura,
               qtd_pings               = qtd_pings + 1,
               updated_at              = CURRENT_TIMESTAMP
         WHERE id_carga = NEW.id_carga
           AND tipo    <> v_tipo
           AND status   = 'aberto';

        -- B.3 — abre novo
        INSERT INTO carga_alertas (
            id_carga, tipo, status,
            limite_minimo, limite_maximo,
            temperatura_inicio, temperatura_pico,
            aberto_telemetria_id,
            aberto_at, qtd_pings
        ) VALUES (
            NEW.id_carga, v_tipo, 'aberto',
            v_min, v_max,
            NEW.temperatura, NEW.temperatura,
            NEW.id,
            NEW.created_at, 1
        );
    END IF;

    RETURN NEW;
END;
$$;


COMMIT;
