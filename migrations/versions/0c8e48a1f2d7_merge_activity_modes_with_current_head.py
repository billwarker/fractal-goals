"""merge_activity_modes_with_current_head

Revision ID: 0c8e48a1f2d7
Revises: 7f7f42a2b1c3, d4d467d80f3c
Create Date: 2026-03-26 17:20:00.000000

"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = '0c8e48a1f2d7'
down_revision: Union[str, Sequence[str], None] = ('7f7f42a2b1c3', 'd4d467d80f3c')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Merge concurrent heads."""


def downgrade() -> None:
    """Unmerge concurrent heads."""
