"""initial app schema: drop the n8n-era tables, create the rebuilt ones

Revision ID: 0001
Revises:
Create Date: 2026-11-11

Only touches the seven old app tables and the new ones, all schema-qualified in
`document_genie`. Better Auth tables (user, session, account, verification) are
never referenced. The pgvector extension already exists on the server (schema
`public`); CREATE EXTENSION IF NOT EXISTS is a no-op there and makes a fresh
database work too.

downgrade() drops the new tables. It cannot restore the old n8n-era tables or
their data (the plan treats that data as disposable).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

S = "document_genie"

OLD_TABLES = [  # dependency order: children first. No CASCADE, so an unexpected dependency fails loudly.
    "user_document_embeddings",
    "user_document_rows",
    "user_chat_histories",
    "n8n_user_chat_histories",
    "user_credit_transactions",
    "user_credit_accounts",
    "user_documents",
]

NEW_TABLES = [  # creation order; downgrade drops in reverse
    "documents",
    "document_chunks",
    "document_rows",
    "chat_sessions",
    "chat_messages",
    "message_feedback",
    "credit_accounts",
    "credit_transactions",
    "llm_usage",
    "contact_submissions",
]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    for t in OLD_TABLES:
        op.execute(f"DROP TABLE IF EXISTS {S}.{t}")

    op.execute(f"""
    CREATE TABLE {S}.documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        file_name text NOT NULL,
        mime_type text NOT NULL,
        file_size bigint NOT NULL,
        num_pages integer,
        storage_key text,
        checksum text NOT NULL,
        status text NOT NULL DEFAULT 'processing',
        error_code text,
        csv_schema jsonb,
        ocr_used boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_documents_user_checksum UNIQUE (user_id, checksum),
        CONSTRAINT ck_documents_status CHECK (status in ('processing','ready','failed'))
    )""")
    op.execute(f"CREATE INDEX ix_documents_user_created ON {S}.documents (user_id, created_at)")

    op.execute(f"""
    CREATE TABLE {S}.document_chunks (
        id bigserial PRIMARY KEY,
        document_id uuid NOT NULL REFERENCES {S}.documents(id) ON DELETE CASCADE,
        user_id text NOT NULL,
        chunk_index integer NOT NULL,
        page_start integer,
        page_end integer,
        content text NOT NULL,
        embedding vector(1536),
        tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
    )""")
    op.execute(
        f"CREATE INDEX ix_document_chunks_document ON {S}.document_chunks (document_id, chunk_index)"
    )
    op.execute(f"CREATE INDEX ix_document_chunks_user ON {S}.document_chunks (user_id)")
    op.execute(
        f"CREATE INDEX ix_document_chunks_embedding_hnsw ON {S}.document_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )
    op.execute(f"CREATE INDEX ix_document_chunks_tsv ON {S}.document_chunks USING gin (tsv)")

    op.execute(f"""
    CREATE TABLE {S}.document_rows (
        id bigserial PRIMARY KEY,
        document_id uuid NOT NULL REFERENCES {S}.documents(id) ON DELETE CASCADE,
        user_id text NOT NULL,
        row_index integer NOT NULL,
        row_data jsonb NOT NULL
    )""")
    op.execute(f"CREATE INDEX ix_document_rows_document ON {S}.document_rows (document_id, row_index)")
    op.execute(f"CREATE INDEX ix_document_rows_user ON {S}.document_rows (user_id)")

    op.execute(f"""
    CREATE TABLE {S}.chat_sessions (
        id uuid PRIMARY KEY,
        user_id text NOT NULL,
        title text,
        document_ids uuid[],
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    )""")
    op.execute(f"CREATE INDEX ix_chat_sessions_user_updated ON {S}.chat_sessions (user_id, updated_at)")

    op.execute(f"""
    CREATE TABLE {S}.chat_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES {S}.chat_sessions(id) ON DELETE CASCADE,
        user_id text NOT NULL,
        role text NOT NULL,
        content text NOT NULL DEFAULT '',
        parts jsonb,
        metrics jsonb,
        model text,
        status text NOT NULL DEFAULT 'complete',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_chat_messages_role CHECK (role in ('user','assistant')),
        CONSTRAINT ck_chat_messages_status CHECK (status in ('streaming','complete','error','stopped'))
    )""")
    op.execute(
        f"CREATE INDEX ix_chat_messages_session_created ON {S}.chat_messages (session_id, created_at)"
    )
    op.execute(f"CREATE INDEX ix_chat_messages_user ON {S}.chat_messages (user_id)")

    op.execute(f"""
    CREATE TABLE {S}.message_feedback (
        message_id uuid PRIMARY KEY REFERENCES {S}.chat_messages(id) ON DELETE CASCADE,
        user_id text NOT NULL,
        rating text NOT NULL,
        reason text,
        comment text,
        CONSTRAINT ck_message_feedback_rating CHECK (rating in ('like','dislike'))
    )""")

    op.execute(f"""
    CREATE TABLE {S}.credit_accounts (
        user_id text PRIMARY KEY,
        credit_balance integer NOT NULL DEFAULT 0,
        message_balance integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_credit_accounts_credit_nonneg CHECK (credit_balance >= 0),
        CONSTRAINT ck_credit_accounts_message_nonneg CHECK (message_balance >= 0)
    )""")

    op.execute(f"""
    CREATE TABLE {S}.credit_transactions (
        transaction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        unit_type text NOT NULL,
        transaction_type text NOT NULL,
        amount_delta integer NOT NULL,
        reference_id uuid,
        file_name_snapshot text,
        description text,
        created_at timestamptz NOT NULL DEFAULT now()
    )""")
    op.execute(
        f"CREATE INDEX ix_credit_transactions_user_created ON {S}.credit_transactions (user_id, created_at)"
    )

    op.execute(f"""
    CREATE TABLE {S}.llm_usage (
        id bigserial PRIMARY KEY,
        user_id text NOT NULL,
        session_id uuid,
        kind text NOT NULL,
        model text NOT NULL,
        service_tier text,
        input_tokens integer NOT NULL DEFAULT 0,
        output_tokens integer NOT NULL DEFAULT 0,
        reasoning_tokens integer NOT NULL DEFAULT 0,
        cached_tokens integer NOT NULL DEFAULT 0,
        cost_usd numeric(12,6),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_llm_usage_kind CHECK (kind in ('chat','title','ocr','embedding'))
    )""")
    op.execute(f"CREATE INDEX ix_llm_usage_user_created ON {S}.llm_usage (user_id, created_at)")

    op.execute(f"""
    CREATE TABLE {S}.contact_submissions (
        id bigserial PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL,
        message text NOT NULL,
        ip text,
        created_at timestamptz NOT NULL DEFAULT now()
    )""")


def downgrade() -> None:
    for t in reversed(NEW_TABLES):
        op.execute(f"DROP TABLE IF EXISTS {S}.{t}")
