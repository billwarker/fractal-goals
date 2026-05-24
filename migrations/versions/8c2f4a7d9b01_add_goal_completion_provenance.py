"""add goal completion provenance

Revision ID: 8c2f4a7d9b01
Revises: 7b6d5a4c3e2f
Create Date: 2026-05-23 19:55:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8c2f4a7d9b01'
down_revision: Union[str, Sequence[str], None] = '7b6d5a4c3e2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goals', sa.Column('completion_source', sa.String(), nullable=True))
    op.add_column('goals', sa.Column('completion_reason', sa.String(), nullable=True))
    op.add_column('goals', sa.Column('manually_uncompleted_at', sa.DateTime(), nullable=True))

    op.execute(
        """
        UPDATE goals
        SET completion_source = CASE
                WHEN completed = true AND completed_session_id IS NOT NULL THEN 'session'
                WHEN completed = true THEN 'manual'
                ELSE NULL
            END,
            completion_reason = CASE
                WHEN completed = true THEN 'legacy_completed'
                ELSE NULL
            END
        WHERE completion_source IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column('goals', 'manually_uncompleted_at')
    op.drop_column('goals', 'completion_reason')
    op.drop_column('goals', 'completion_source')
