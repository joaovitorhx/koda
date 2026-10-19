-- =============================================================
-- MIGRATION 003 — Alertas automáticos de temperatura por carga
-- =============================================================
-- Cria:
--   1. Tabela `carga_alertas` (1 linha por evento térmico contínuo)
--   2. Função `fn_carga_telemetria_processar_alertas`
--   3. Trigger AFTER INSERT em `carga_telemetria_auditoria` que
--      abre/atualiza/fecha alertas conforme as leituras chegam
--
-- Modelo de evento:
--   • Cada vez que a temperatura sai da faixa (`temperatura_minima` /
--     `temperatura_maxima` da `carga`) o trigger ABRE um alerta com
--     status='aberto'.
--   • Enquanto a temperatura continua fora da faixa (do mesmo lado),
--     novos pings só ATUALIZAM o pico e incrementam qtd_pings — não
--     geram alertas novos (evita spam).
--   • Quando a temperatura volta para dentro da faixa, ou cruza para o
--     lado oposto, o alerta aberto é FECHADO (status='resolvido').
--   • Garantia de unicidade: índice parcial impede 2 alertas abertos
--     simultaneamente para a mesma (carga, tipo).
--
-- Idempotente: pode rodar várias vezes.
-- Executar no Supabase SQL Editor ou via psql.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1) Tabela de alertas
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carga_alertas (
    id                          SERIAL PRIMARY KEY,
    id_carga                    INT             NOT NULL,

    -- 'alta' = temperatura > limite_maximo
    -- 'baixa' = temperatura < limite_minimo
    tipo                        VARCHAR(10)     NOT NULL,

    -- 'aberto' | 'resolvido' | 'cancelado' (cancelado = encerrado manualmente)
    status                      VARCHAR(20)     NOT NULL DEFAULT 'aberto',

    -- Snapshot da faixa no momento da abertura: se a operadora alterar
    -- depois a faixa-referência da carga, o alerta histórico continua
    -- mostrando contra quais limites ele foi disparado.
    limite_minimo               DECIMAL(5,2)    NOT NULL,
    limite_maximo               DECIMAL(5,2)    NOT NULL,

    -- Temperaturas envolvidas no evento
    temperatura_inicio          DECIMAL(5,2)    NOT NULL,
    -- pico = máx p/ tipo 'alta'; mín p/ tipo 'baixa'
    temperatura_pico            DECIMAL(5,2)    NOT NULL,
    -- temperatura do ping que resolveu o alerta (NULL enquanto aberto)
    temperatura_fim             DECIMAL(5,2),

    -- Estatísticas / referências
    qtd_pings                   INT             NOT NULL DEFAULT 1,
    aberto_telemetria_id        INT,
    resolvido_telemetria_id     INT,

    -- Timestamps
    aberto_at                   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolvido_at                TIMESTAMP,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_carga_alertas_carga
        FOREIGN KEY (id_carga) REFERENCES carga(id) ON DELETE CASCADE,

    -- Se um ping for removido por retenção, o alerta sobrevive (SET NULL)
    CONSTRAINT fk_carga_alertas_telem_aberto
        FOREIGN KEY (aberto_telemetria_id)
        REFERENCES carga_telemetria_auditoria(id) ON DELETE SET NULL,

    CONSTRAINT fk_carga_alertas_telem_resolvido
        FOREIGN KEY (resolvido_telemetria_id)
        REFERENCES carga_telemetria_auditoria(id) ON DELETE SET NULL,

    CONSTRAINT chk_carga_alertas_tipo   CHECK (tipo   IN ('alta','baixa')),
    CONSTRAINT chk_carga_alertas_status CHECK (status IN ('aberto','resolvido','cancelado'))
);

-- Buscas frequentes
CREATE INDEX IF NOT EXISTS idx_carga_alertas_carga   ON carga_alertas (id_carga);
CREATE INDEX IF NOT EXISTS idx_carga_alertas_status  ON carga_alertas (status);
CREATE INDEX IF NOT EXISTS idx_carga_alertas_aberto_at
    ON carga_alertas (aberto_at DESC);

-- Garante "no máximo 1 alerta ABERTO por (carga, tipo)" — base da lógica anti-spam
CREATE UNIQUE INDEX IF NOT EXISTS uq_carga_alertas_um_aberto_por_tipo
    ON carga_alertas (id_carga, tipo)
    WHERE status = 'aberto';

COMMENT ON TABLE  carga_alertas IS
    'Eventos contínuos de violação térmica por carga (1 linha = 1 evento, do momento que saiu da faixa até voltar/cruzar).';
COMMENT ON COLUMN carga_alertas.tipo IS
    'alta = temperatura excedeu temperatura_maxima; baixa = temperatura ficou abaixo de temperatura_minima.';
COMMENT ON COLUMN carga_alertas.temperatura_pico IS
    'Pior leitura registrada durante o evento (máx p/ tipo alta, mín p/ tipo baixa).';


-- -------------------------------------------------------------
-- 2) Função do trigger
-- -------------------------------------------------------------
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

COMMENT ON FUNCTION fn_carga_telemetria_processar_alertas() IS
    'Abre/atualiza/fecha registros em carga_alertas conforme cada novo ping em carga_telemetria_auditoria.';


-- -------------------------------------------------------------
-- 3) Trigger
-- -------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_carga_telemetria_alertas
    ON carga_telemetria_auditoria;

CREATE TRIGGER trg_carga_telemetria_alertas
AFTER INSERT ON carga_telemetria_auditoria
FOR EACH ROW
EXECUTE FUNCTION fn_carga_telemetria_processar_alertas();


-- -------------------------------------------------------------
-- 4) Manutenção de `updated_at`
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_carga_alertas_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_carga_alertas_updated_at ON carga_alertas;

CREATE TRIGGER trg_carga_alertas_updated_at
BEFORE UPDATE ON carga_alertas
FOR EACH ROW
EXECUTE FUNCTION fn_carga_alertas_set_updated_at();


-- -------------------------------------------------------------
-- 5) (Opcional / Supabase) — políticas RLS
-- -------------------------------------------------------------
-- Em Supabase, lembre-se de habilitar RLS e definir policies coerentes
-- com a forma como o app web/admin lê esses dados:
--
--   ALTER TABLE carga_alertas ENABLE ROW LEVEL SECURITY;
--
--   CREATE POLICY carga_alertas_read_authenticated
--     ON carga_alertas
--     FOR SELECT
--     TO authenticated
--     USING (true);
--
--   -- Inserts/updates só devem vir da própria trigger (SECURITY DEFINER
--   -- não é necessário porque o trigger roda com privilégios do owner
--   -- da função). Bloqueia escrita direta da anon key:
--   CREATE POLICY carga_alertas_no_direct_write
--     ON carga_alertas
--     FOR INSERT, UPDATE, DELETE
--     TO anon
--     USING (false)
--     WITH CHECK (false);

COMMIT;
