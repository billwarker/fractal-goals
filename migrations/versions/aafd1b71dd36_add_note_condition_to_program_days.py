"""add_note_condition_to_program_days

Revision ID: aafd1b71dd36
Revises: 68388735b61f
Create Date: 2026-04-01 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aafd1b71dd36'
down_revision: Union[str, Sequence[str], None] = '68388735b61f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'program_days',
        sa.Column('note_condition', sa.Boolean(), nullable=False, server_default='false')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('program_days', 'note_condition')
