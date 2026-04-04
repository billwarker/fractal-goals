"""add_goal_id_and_pinned_at_to_notes

Revision ID: 68388735b61f
Revises: 94008ce509bb
Create Date: 2026-04-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '68388735b61f'
down_revision: Union[str, Sequence[str], None] = '94008ce509bb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('notes', sa.Column('goal_id', sa.String(), nullable=True))
    op.create_foreign_key(
        'fk_notes_goal_id', 'notes', 'goals', ['goal_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_notes_goal_id', 'notes', ['goal_id'])
    op.add_column('notes', sa.Column('pinned_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_notes_goal_id', table_name='notes')
    op.drop_constraint('fk_notes_goal_id', 'notes', type_='foreignkey')
    op.drop_column('notes', 'goal_id')
    op.drop_column('notes', 'pinned_at')
