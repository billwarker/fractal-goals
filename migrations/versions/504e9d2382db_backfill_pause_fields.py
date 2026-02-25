"""backfill pause fields

Revision ID: 504e9d2382db
Revises: 504e9d2382da
Create Date: 2026-02-24 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '504e9d2382db'
down_revision: Union[str, Sequence[str], None] = '504e9d2382da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Backfill activity_instances
    op.execute("UPDATE activity_instances SET is_paused = false WHERE is_paused IS NULL;")
    op.execute("UPDATE activity_instances SET total_paused_seconds = 0 WHERE total_paused_seconds IS NULL;")

    # Backfill sessions
    op.execute("UPDATE sessions SET is_paused = false WHERE is_paused IS NULL;")
    op.execute("UPDATE sessions SET total_paused_seconds = 0 WHERE total_paused_seconds IS NULL;")


def downgrade() -> None:
    pass
