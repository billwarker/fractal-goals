"""add responsiveness indexes

Revision ID: 2f1a9d3c7b10
Revises: 6cd49aa88564
Create Date: 2026-02-18
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "2f1a9d3c7b10"
down_revision: Union[str, Sequence[str], None] = "6cd49aa88564"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_activity_instances_root_deleted_session "
        "ON activity_instances (root_id, deleted_at, session_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_goals_root_deleted_completed "
        "ON goals (root_id, deleted_at, completed)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sessions_root_deleted_created "
        "ON sessions (root_id, deleted_at, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_event_logs_root_timestamp "
        "ON event_logs (root_id, timestamp DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_event_logs_root_timestamp")
    op.execute("DROP INDEX IF EXISTS ix_sessions_root_deleted_created")
    op.execute("DROP INDEX IF EXISTS ix_goals_root_deleted_completed")
    op.execute("DROP INDEX IF EXISTS ix_activity_instances_root_deleted_session")
