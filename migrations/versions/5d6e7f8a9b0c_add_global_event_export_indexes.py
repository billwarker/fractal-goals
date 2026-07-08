"""add global event export indexes

Admin-wide usage aggregation filters event tables by time only (no root_id),
and the BigQuery exporter keyset-paginates on (timestamp, id) — both need
global composite indexes that the existing root-scoped indexes cannot serve.

Revision ID: 5d6e7f8a9b0c
Revises: 4c5d6e7f8a9b
Create Date: 2026-07-08 00:00:01.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = '5d6e7f8a9b0c'
down_revision: Union[str, Sequence[str], None] = '4c5d6e7f8a9b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_event_logs_timestamp_id "
        "ON event_logs (timestamp, id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_email_delivery_events_created_at_id "
        "ON email_delivery_events (created_at, id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_email_delivery_events_created_at_id")
    op.execute("DROP INDEX IF EXISTS ix_event_logs_timestamp_id")
