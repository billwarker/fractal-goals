"""Add nano_goal_id to notes

Revision ID: 6cd49aa88564
Revises: 6f9621382aca
Create Date: 2026-02-14 15:04:38.676562

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6cd49aa88564'
down_revision: Union[str, Sequence[str], None] = '6f9621382aca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('notes', sa.Column('nano_goal_id', sa.String(), nullable=True))
    op.create_foreign_key(None, 'notes', 'goals', ['nano_goal_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(None, 'notes', type_='foreignkey')
    op.drop_column('notes', 'nano_goal_id')
