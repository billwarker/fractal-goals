"""Add session goal provenance and normalize goal_type values

Revision ID: c1f4c9d0a123
Revises: 7080ee18b7a9
Create Date: 2026-02-18 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1f4c9d0a123'
down_revision: Union[str, Sequence[str], None] = '7080ee18b7a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'session_goals',
        sa.Column(
            'association_source',
            sa.String(),
            nullable=False,
            server_default='manual'
        )
    )

    op.execute("""
        UPDATE session_goals
        SET goal_type = CASE goal_type
            WHEN 'short_term' THEN 'ShortTermGoal'
            WHEN 'immediate' THEN 'ImmediateGoal'
            WHEN 'micro' THEN 'MicroGoal'
            ELSE goal_type
        END
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE session_goals
        SET goal_type = CASE goal_type
            WHEN 'ShortTermGoal' THEN 'short_term'
            WHEN 'ImmediateGoal' THEN 'immediate'
            WHEN 'MicroGoal' THEN 'micro'
            ELSE goal_type
        END
    """)

    op.drop_column('session_goals', 'association_source')
