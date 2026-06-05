"""add app settings

Revision ID: 0f4e8a9c1b23
Revises: ab12cd34ef56
Create Date: 2026-06-05 11:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from models.base import JSON_TYPE


revision: str = '0f4e8a9c1b23'
down_revision: Union[str, Sequence[str], None] = 'ab12cd34ef56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'app_settings',
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('value', JSON_TYPE, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('key'),
    )


def downgrade() -> None:
    op.drop_table('app_settings')
