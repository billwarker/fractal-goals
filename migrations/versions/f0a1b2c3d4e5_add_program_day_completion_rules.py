"""add program day completion rules

Revision ID: f0a1b2c3d4e5
Revises: 8c2f4a7d9b01
Create Date: 2026-06-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f0a1b2c3d4e5'
down_revision: Union[str, Sequence[str], None] = '8c2f4a7d9b01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'program_day_templates',
        sa.Column('is_required', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )
    op.add_column(
        'program_days',
        sa.Column('completion_min_templates', sa.Integer(), nullable=True),
    )
    op.alter_column('program_day_templates', 'is_required', server_default=None)


def downgrade() -> None:
    op.drop_column('program_days', 'completion_min_templates')
    op.drop_column('program_day_templates', 'is_required')
