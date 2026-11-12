"""drop the unused contact_submissions table

Phase 1 created it for a backend contact endpoint. The contact form stays on n8n (decided in
Phase 4), so nothing writes to it. It was empty when dropped.

Revision ID: 0003
Revises: 0002
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

S = "document_genie"


def upgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {S}.contact_submissions")


def downgrade() -> None:
    op.execute(f"""
    CREATE TABLE IF NOT EXISTS {S}.contact_submissions (
        id bigserial PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL,
        message text NOT NULL,
        ip text,
        created_at timestamptz NOT NULL DEFAULT now()
    )""")
