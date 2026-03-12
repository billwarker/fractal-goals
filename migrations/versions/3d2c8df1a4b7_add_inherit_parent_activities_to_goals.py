"""add inherit_parent_activities to goals

Revision ID: 3d2c8df1a4b7
Revises: ff40dedbdfeb
Create Date: 2026-03-12 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3d2c8df1a4b7'
down_revision: Union[str, Sequence[str], None] = 'ff40dedbdfeb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'goals',
        sa.Column(
            'inherit_parent_activities',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column('goals', 'inherit_parent_activities', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('goals', 'inherit_parent_activities')
