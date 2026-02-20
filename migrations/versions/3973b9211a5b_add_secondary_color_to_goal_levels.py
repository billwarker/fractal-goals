"""add secondary_color to goal_levels

Revision ID: 3973b9211a5b
Revises: bd71cb89beb8
Create Date: 2026-02-20 12:56:34.041855

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3973b9211a5b'
down_revision: Union[str, Sequence[str], None] = 'bd71cb89beb8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('goal_levels', sa.Column('secondary_color', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('goal_levels', 'secondary_color')
