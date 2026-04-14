"""add_progress_settings_to_goals

Revision ID: 23b551de5bfa
Revises: f87a24201050
Create Date: 2026-04-13 17:15:40.642410

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '23b551de5bfa'
down_revision: Union[str, Sequence[str], None] = 'f87a24201050'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goals', sa.Column('progress_settings', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('goals', 'progress_settings')
