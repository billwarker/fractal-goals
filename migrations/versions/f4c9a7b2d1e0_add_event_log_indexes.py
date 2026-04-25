"""add_event_log_indexes

Revision ID: f4c9a7b2d1e0
Revises: f2a1c8d9e4b7
Create Date: 2026-04-25 12:15:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = 'f4c9a7b2d1e0'
down_revision: Union[str, Sequence[str], None] = 'f2a1c8d9e4b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_event_logs_root_timestamp_desc "
        "ON event_logs (root_id, timestamp DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_event_logs_root_event_type_timestamp_desc "
        "ON event_logs (root_id, event_type, timestamp DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_event_logs_root_event_type_timestamp_desc")
    op.execute("DROP INDEX IF EXISTS ix_event_logs_root_timestamp_desc")
