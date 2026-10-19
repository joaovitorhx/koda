-- =============================================================
-- SCHEMA — Sistema Logístico
-- =============================================================


-- -------------------------------------------------------------
-- USERS
-- Usuários do sistema (motoristas, administradores, etc.)
-- -------------------------------------------------------------
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100)        NOT NULL,
    email       VARCHAR(255)        NOT NULL UNIQUE,
    password    VARCHAR(255)        NOT NULL,
    phone       VARCHAR(20),
    avatar_url  VARCHAR(500),
    role        VARCHAR(50)         NOT NULL DEFAULT 'user',
    is_active   BOOLEAN             NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_role_users
        CHECK (role IN ('user', 'admin', 'driver'))
);

CREATE INDEX idx_users_email  ON users (email);
CREATE INDEX idx_users_role   ON users (role);
CREATE INDEX idx_users_active ON users (is_active);


-- -------------------------------------------------------------
-- CARGA
-- Cargas transportadas com monitoramento de temperatura e GPS
-- -------------------------------------------------------------
CREATE TABLE carga (
    id                  SERIAL PRIMARY KEY,
    tipo                VARCHAR(100)        NOT NULL,
    temperatura_maxima  DECIMAL(5,2)        NOT NULL,
    temperatura_minima  DECIMAL(5,2)        NOT NULL,
    temperatura_atual   DECIMAL(5,2)        NOT NULL,
    latitude            DECIMAL(9,6)        NOT NULL,
    longitude           DECIMAL(9,6)        NOT NULL,
    created_at          TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- `temperatura_minima` / `temperatura_maxima` são referência operacional; `temperatura_atual` guarda a leitura real (telemetria).
-- Bases já criadas com o antigo CHECK: executar
--   ALTER TABLE carga DROP CONSTRAINT IF EXISTS chk_temperatura;

CREATE INDEX idx_carga_tipo ON carga (tipo);


-- -------------------------------------------------------------
-- CARGA — TELEMETRIA / AUDITORIA
-- Um registo por envio (ex.: app BLE): temperatura + GPS ligados à carga.
-- No Supabase: criar políticas RLS para INSERT/SELECT conforme a chave anon.
-- -------------------------------------------------------------
CREATE TABLE carga_telemetria_auditoria (
    id              SERIAL PRIMARY KEY,
    id_carga        INT                 NOT NULL,
    temperatura     DECIMAL(5,2)        NOT NULL,
    latitude        DECIMAL(9,6),
    longitude       DECIMAL(9,6),
    created_at      TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_carga_telemetria_auditoria_carga
        FOREIGN KEY (id_carga) REFERENCES carga(id) ON DELETE CASCADE
);

CREATE INDEX idx_carga_telemetria_auditoria_carga
    ON carga_telemetria_auditoria (id_carga);

CREATE INDEX idx_carga_telemetria_auditoria_created
    ON carga_telemetria_auditoria (created_at DESC);


-- -------------------------------------------------------------
-- CENTRO LOGÍSTICO
-- Bases de operação dos caminhões
-- -------------------------------------------------------------
CREATE TABLE centro_logistica (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(150)    NOT NULL,
    latitude    DECIMAL(9,6)    NOT NULL,
    longitude   DECIMAL(9,6)    NOT NULL,
    endereco    VARCHAR(255),
    telefone    VARCHAR(20),
    is_ativo    BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_centro_logistica_nome ON centro_logistica (nome);


-- -------------------------------------------------------------
-- CLIENTES
-- Destinatários das entregas
-- -------------------------------------------------------------
CREATE TABLE clientes (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(150)    NOT NULL,
    email       VARCHAR(255)    UNIQUE,
    telefone    VARCHAR(20),
    documento   VARCHAR(20)     UNIQUE,
    latitude    DECIMAL(9,6)    NOT NULL,
    longitude   DECIMAL(9,6)    NOT NULL,
    endereco    VARCHAR(255),
    is_ativo    BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clientes_nome      ON clientes (nome);
CREATE INDEX idx_clientes_email     ON clientes (email);
CREATE INDEX idx_clientes_documento ON clientes (documento);


-- -------------------------------------------------------------
-- ARMAZÉNS PARCEIROS
-- Pontos intermediários de armazenamento na rota
-- -------------------------------------------------------------
CREATE TABLE armazens_parceiros (
    id              SERIAL PRIMARY KEY,
    nome            VARCHAR(150)    NOT NULL,
    latitude        DECIMAL(9,6)    NOT NULL,
    longitude       DECIMAL(9,6)    NOT NULL,
    endereco        VARCHAR(255),
    telefone        VARCHAR(20),
    email           VARCHAR(255)    UNIQUE,
    capacidade_kg   DECIMAL(10,2),
    is_ativo        BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_armazens_nome ON armazens_parceiros (nome);


-- -------------------------------------------------------------
-- CAMINHÃO
-- Veículos que ligam usuários, cargas e centros logísticos
-- -------------------------------------------------------------
CREATE TABLE caminhao (
    id                      SERIAL PRIMARY KEY,
    placa                   VARCHAR(10)     NOT NULL UNIQUE,
    modelo                  VARCHAR(100)    NOT NULL,
    marca                   VARCHAR(100)    NOT NULL,
    ano                     SMALLINT        NOT NULL,
    capacidade_kg           DECIMAL(10,2)   NOT NULL,
    id_usuario              INT             NOT NULL,
    id_carga                INT,
    id_centro_logistica     INT,
    status                  VARCHAR(50)     NOT NULL DEFAULT 'disponivel',
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_caminhao_usuario
        FOREIGN KEY (id_usuario) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT fk_caminhao_carga
        FOREIGN KEY (id_carga) REFERENCES carga(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_caminhao_centro_logistica
        FOREIGN KEY (id_centro_logistica) REFERENCES centro_logistica(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT chk_status_caminhao
        CHECK (status IN ('disponivel', 'em_espera', 'em_rota', 'manutencao', 'inativo'))
);

CREATE INDEX idx_caminhao_placa            ON caminhao (placa);
CREATE INDEX idx_caminhao_usuario          ON caminhao (id_usuario);
CREATE INDEX idx_caminhao_carga            ON caminhao (id_carga);
CREATE INDEX idx_caminhao_status           ON caminhao (status);
CREATE INDEX idx_caminhao_centro_logistica ON caminhao (id_centro_logistica);


-- -------------------------------------------------------------
-- ENTREGAS
-- Registro de entregas ligando caminhão, cliente e armazém
-- -------------------------------------------------------------
CREATE TABLE entregas (
    id                  SERIAL PRIMARY KEY,
    id_caminhao         INT             NOT NULL,
    id_cliente          INT             NOT NULL,
    id_armazem_parceiro INT,
    status              VARCHAR(50)     NOT NULL DEFAULT 'pendente',
    data_saida          TIMESTAMP,
    data_previsao       TIMESTAMP,
    data_entrega        TIMESTAMP,
    observacoes         TEXT,
    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_entrega_caminhao
        FOREIGN KEY (id_caminhao) REFERENCES caminhao(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT fk_entrega_cliente
        FOREIGN KEY (id_cliente) REFERENCES clientes(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT fk_entrega_armazem
        FOREIGN KEY (id_armazem_parceiro) REFERENCES armazens_parceiros(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT chk_status_entrega
        CHECK (status IN ('pendente', 'em_transito', 'no_armazem', 'entregue', 'cancelada'))
);

CREATE INDEX idx_entregas_caminhao ON entregas (id_caminhao);
CREATE INDEX idx_entregas_cliente  ON entregas (id_cliente);
CREATE INDEX idx_entregas_armazem  ON entregas (id_armazem_parceiro);
CREATE INDEX idx_entregas_status   ON entregas (status);


-- -------------------------------------------------------------
-- ACCESS REQUESTS
-- Solicitações de acesso de novos usuários pendentes de aprovação
-- -------------------------------------------------------------
CREATE TABLE access_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome        VARCHAR(150)    NOT NULL,
    email       VARCHAR(255)    NOT NULL,
    empresa     VARCHAR(150)    NOT NULL,
    cargo       VARCHAR(100)    NOT NULL,
    descricao   TEXT            NOT NULL,
    status      VARCHAR(50)     NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_status_access_requests
        CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX idx_access_requests_email      ON access_requests (email);
CREATE INDEX idx_access_requests_status     ON access_requests (status);
CREATE INDEX idx_access_requests_created_at ON access_requests (created_at DESC);

