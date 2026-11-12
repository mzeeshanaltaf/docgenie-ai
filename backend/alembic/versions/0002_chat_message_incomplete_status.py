"""allow the 'incomplete' chat message status

A message whose run was cut short (client disconnect, or an error after some answer text was
streamed) is stored as `incomplete`. Phase 1's check constraint only knew `stopped`.

Revision ID: 0002
Revises: 0001
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

S = "document_genie"


def upgrade() -> None:
    op.execute(f"ALTER TABLE {S}.chat_messages DROP CONSTRAINT ck_chat_messages_status")
    op.execute(
        f"ALTER TABLE {S}.chat_messages ADD CONSTRAINT ck_chat_messages_status "
        "CHECK (status in ('streaming','complete','error','stopped','incomplete'))"
    )


def downgrade() -> None:
    op.execute(f"UPDATE {S}.chat_messages SET status = 'stopped' WHERE status = 'incomplete'")
    op.execute(f"ALTER TABLE {S}.chat_messages DROP CONSTRAINT ck_chat_messages_status")
    op.execute(
        f"ALTER TABLE {S}.chat_messages ADD CONSTRAINT ck_chat_messages_status "
        "CHECK (status in ('streaming','complete','error','stopped'))"
    )
