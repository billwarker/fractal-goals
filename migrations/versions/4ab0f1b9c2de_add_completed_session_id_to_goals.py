"""add completed_session_id to goals

Revision ID: 4ab0f1b9c2de
Revises: 3d2c8df1a4b7
Create Date: 2026-03-13 16:50:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ab0f1b9c2de'
down_revision: Union[str, Sequence[str], None] = '3d2c8df1a4b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goals', sa.Column('completed_session_id', sa.String(), nullable=True))
    op.create_foreign_key(
        'fk_goals_completed_session_id_sessions',
        'goals',
        'sessions',
        ['completed_session_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_goals_completed_session_id_sessions', 'goals', type_='foreignkey')
    op.drop_column('goals', 'completed_session_id')
