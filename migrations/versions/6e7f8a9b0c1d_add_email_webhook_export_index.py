"""Add email webhook export index

Revision ID: 6e7f8a9b0c1d
Revises: 5d6e7f8a9b0c
Create Date: 2026-07-08 15:00:00.000000

"""
from alembic import op


revision = '6e7f8a9b0c1d'
down_revision = '5d6e7f8a9b0c'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_email_webhook_events_created_at_id "
        "ON email_webhook_events (created_at, id)"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_email_webhook_events_created_at_id")
