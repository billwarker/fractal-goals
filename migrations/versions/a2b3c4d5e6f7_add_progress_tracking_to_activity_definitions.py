"""add progress tracking to activity definitions

Revision ID: a2b3c4d5e6f7
Revises: 3f8a1c2d4e5b
Create Date: 2026-04-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, Sequence[str], None] = '3f8a1c2d4e5b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('activity_definitions', sa.Column('track_progress', sa.Boolean(), nullable=True))
    op.add_column('activity_definitions', sa.Column('progress_aggregation', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('activity_definitions', 'progress_aggregation')
    op.drop_column('activity_definitions', 'track_progress')
