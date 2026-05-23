"""add color to programs

Revision ID: 7b6d5a4c3e2f
Revises: e2f4a6b8c9d1
Create Date: 2026-05-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7b6d5a4c3e2f'
down_revision: Union[str, Sequence[str], None] = 'e2f4a6b8c9d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('programs', sa.Column('color', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('programs', 'color')
