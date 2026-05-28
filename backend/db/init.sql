-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- SLM Registry table
CREATE TABLE IF NOT EXISTS slm_registry (
    model_id              TEXT PRIMARY KEY,
    domain_label          TEXT NOT NULL,
    domain_embedding      VECTOR(768),
    coverage_topics       TEXT[] NOT NULL,
    training_corpus_hash  TEXT NOT NULL,
    base_model            TEXT NOT NULL,
    adapter_type          TEXT NOT NULL,
    val_loss              FLOAT,
    hallucination_rate    FLOAT,
    task_completion_rate  FLOAT,
    model_path            TEXT NOT NULL,
    ollama_model_name     TEXT,
    vram_required_gb      FLOAT,
    build_trigger_query   TEXT,
    build_trigger_scores  JSONB,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    last_used_at          TIMESTAMPTZ,
    query_count           INTEGER DEFAULT 0,
    retrain_needed        BOOLEAN DEFAULT FALSE,
    parent_model_id       TEXT REFERENCES slm_registry(model_id)
);

CREATE INDEX IF NOT EXISTS slm_registry_embedding_idx
    ON slm_registry USING ivfflat (domain_embedding vector_cosine_ops)
    WITH (lists = 100);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    session_id     TEXT PRIMARY KEY,
    session_name   TEXT,
    domain_tags    TEXT[],
    user_goal      TEXT,
    corpus_path    TEXT,
    db_config      JSONB,
    graph_path     TEXT,
    assigned_slm   TEXT REFERENCES slm_registry(model_id),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Query history table
CREATE TABLE IF NOT EXISTS query_history (
    id              BIGSERIAL PRIMARY KEY,
    session_id      TEXT REFERENCES sessions(session_id),
    query           TEXT NOT NULL,
    task_category   TEXT,
    task_type       TEXT,
    routing_plan    JSONB,
    slm_used        TEXT,
    response_summary TEXT,
    hallucination_rate FLOAT,
    task_completion_rate FLOAT,
    latency_ms      INTEGER,
    token_count_in  INTEGER,
    token_count_out INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Bandit scores table
CREATE TABLE IF NOT EXISTS bandit_scores (
    id           BIGSERIAL PRIMARY KEY,
    task_type    TEXT NOT NULL,
    model_id     TEXT NOT NULL,
    score        FLOAT NOT NULL DEFAULT 0.75,
    query_count  INTEGER DEFAULT 0,
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (task_type, model_id)
);

-- Data ingestion jobs table
CREATE TABLE IF NOT EXISTS ingest_jobs (
    job_id         TEXT PRIMARY KEY,
    session_id     TEXT REFERENCES sessions(session_id),
    status         TEXT DEFAULT 'pending',
    progress       JSONB DEFAULT '{}',
    corpus_path    TEXT,
    graph_path     TEXT,
    domain_label   TEXT DEFAULT 'general',
    file_count     INTEGER DEFAULT 0,
    entity_count   INTEGER DEFAULT 0,
    community_count INTEGER DEFAULT 0,
    metadata       JSONB DEFAULT '{}',
    error_message  TEXT,
    error          TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    completed_at   TIMESTAMPTZ
);
