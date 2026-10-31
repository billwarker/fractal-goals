"""Activity thresholds can average each rule's metric across a session's counted sets.

Additive: existing conditions become `set_aggregate = 'each'`, their current behaviour.
"""
from alembic import op
import sqlalchemy as sa

revision = 'c1e3a5b7d9f0'
down_revision = 'b8d0f2a4c6e8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'goal_completion_conditions',
        sa.Column('set_aggregate', sa.String(), nullable=False, server_default='each'),
    )
    op.create_check_constraint(
        'ck_goal_conditions_set_aggregate', 'goal_completion_conditions',
        "set_aggregate = 'each' OR (set_aggregate = 'average' AND measure = 'sets'"
        " AND kind IN ('single_session', 'consistency') AND min_sets >= 1)",
    )


def downgrade():
    op.drop_constraint('ck_goal_conditions_set_aggregate', 'goal_completion_conditions', type_='check')
    op.drop_column('goal_completion_conditions', 'set_aggregate')
