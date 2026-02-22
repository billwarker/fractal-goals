"""add secondary_color to goal_levels and seed system defaults

Revision ID: 3973b9211a5b
Revises: bd71cb89beb8
Create Date: 2026-02-20 12:56:34.041855

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import uuid


# revision identifiers, used by Alembic.
revision: str = '3973b9211a5b'
down_revision: Union[str, Sequence[str], None] = 'bd71cb89beb8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# System default goal levels
DEFAULT_LEVELS = [
    {"name": "Ultimate Goal",    "rank": 0, "color": "#1a1a2e", "icon": "circle"},
    {"name": "Long Term Goal",   "rank": 1, "color": "#16213e", "icon": "circle"},
    {"name": "Mid Term Goal",    "rank": 2, "color": "#0f3460", "icon": "circle"},
    {"name": "Short Term Goal",  "rank": 3, "color": "#00a8cc", "icon": "circle"},
    {"name": "Immediate Goal",   "rank": 4, "color": "#e94560", "icon": "circle"},
    {"name": "Micro Goal",       "rank": 5, "color": "#ff6f3c", "icon": "circle"},
    {"name": "Nano Goal",        "rank": 6, "color": "#ffc93c", "icon": "circle"},
    {"name": "Completed",        "rank": 99, "color": "#4caf50", "icon": "check"},
]


def upgrade() -> None:
    """Upgrade schema."""
    # Add the secondary_color column (IF NOT EXISTS for idempotency)
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='goal_levels' AND column_name='secondary_color'"
    ))
    if result.fetchone() is None:
        op.add_column('goal_levels', sa.Column('secondary_color', sa.String(), nullable=True))

    # Seed system default goal levels if they don't exist
    existing = conn.execute(sa.text("SELECT COUNT(*) FROM goal_levels WHERE owner_id IS NULL")).scalar()
    if existing == 0:
        for level in DEFAULT_LEVELS:
            conn.execute(sa.text(
                "INSERT INTO goal_levels (id, name, rank, color, icon, owner_id, allow_manual_completion, track_activities, requires_smart) "
                "VALUES (:id, :name, :rank, :color, :icon, NULL, true, true, false)"
            ), {"id": str(uuid.uuid4()), **level})


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('goal_levels', 'secondary_color')
