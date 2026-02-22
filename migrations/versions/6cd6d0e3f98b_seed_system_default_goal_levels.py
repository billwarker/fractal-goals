"""seed system default goal levels

Revision ID: 6cd6d0e3f98b
Revises: 3973b9211a5b
Create Date: 2026-02-20 13:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import uuid


# revision identifiers, used by Alembic.
revision: str = '6cd6d0e3f98b'
down_revision: Union[str, Sequence[str], None] = '3973b9211a5b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# System default goal levels - these serve as the base layer that all users inherit from.
# Users can create personal overrides (owner_id != NULL) or fractal-scoped overrides (root_id != NULL).
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
    """Seed system default goal levels if they don't already exist."""
    conn = op.get_bind()
    existing = conn.execute(sa.text("SELECT COUNT(*) FROM goal_levels WHERE owner_id IS NULL")).scalar()
    if existing == 0:
        for level in DEFAULT_LEVELS:
            conn.execute(sa.text(
                "INSERT INTO goal_levels (id, name, rank, color, icon, owner_id, allow_manual_completion, track_activities, requires_smart) "
                "VALUES (:id, :name, :rank, :color, :icon, NULL, true, true, false)"
            ), {"id": str(uuid.uuid4()), **level})


def downgrade() -> None:
    """Remove system default goal levels."""
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM goal_levels WHERE owner_id IS NULL"))
