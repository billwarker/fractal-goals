"""add_session_search_indexes

Revision ID: f2a1c8d9e4b7
Revises: e7f8a9b0c1d2
Create Date: 2026-04-25 10:20:00.000000

"""

from typing import Sequence, Union

from alembic import op


revision: str = 'f2a1c8d9e4b7'
down_revision: Union[str, Sequence[str], None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sessions_root_deleted_updated_at "
        "ON sessions (root_id, deleted_at, updated_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sessions_root_deleted_effective_start "
        "ON sessions (root_id, deleted_at, COALESCE(session_start, created_at) DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_activity_instances_root_deleted_activity_session "
        "ON activity_instances (root_id, deleted_at, activity_definition_id, session_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_activity_instances_root_deleted_activity_session")
    op.execute("DROP INDEX IF EXISTS ix_sessions_root_deleted_effective_start")
    op.execute("DROP INDEX IF EXISTS ix_sessions_root_deleted_updated_at")
