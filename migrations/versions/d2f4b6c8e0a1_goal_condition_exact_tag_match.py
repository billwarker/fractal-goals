"""Tagged activity thresholds can match sets carrying exactly their tags.

Additive: existing conditions become `tag_match = 'contains'`, their current behaviour.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd2f4b6c8e0a1'
down_revision = 'c1e3a5b7d9f0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'goal_completion_conditions',
        sa.Column('tag_match', sa.String(), nullable=False, server_default='contains'),
    )
    op.create_check_constraint(
        'ck_goal_conditions_tag_match', 'goal_completion_conditions', "tag_match IN ('contains', 'exact')",
    )


def downgrade():
    op.drop_constraint('ck_goal_conditions_tag_match', 'goal_completion_conditions', type_='check')
    op.drop_column('goal_completion_conditions', 'tag_match')
