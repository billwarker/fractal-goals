"""Add an event ID for idempotent durable history delivery.

Revision ID: 8e1f6a3c9d42
Revises: 7c3e5a1b9d42
"""

from alembic import op
import sqlalchemy as sa


revision = "8e1f6a3c9d42"
down_revision = "7c3e5a1b9d42"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("event_logs", sa.Column("event_id", sa.String(length=80), nullable=True))
    op.create_unique_constraint("uq_event_logs_event_id", "event_logs", ["event_id"])


def downgrade():
    op.drop_constraint("uq_event_logs_event_id", "event_logs", type_="unique")
    op.drop_column("event_logs", "event_id")
