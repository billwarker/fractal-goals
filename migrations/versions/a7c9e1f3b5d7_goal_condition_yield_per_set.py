"""Single-session activity thresholds can measure yield per set.

Widens the check constraints only: no new column, and existing conditions are untouched. Downgrading
fails while any `set_yield` condition exists, rather than silently changing what a goal means; those
goals need a different threshold first.
"""
from alembic import op

revision = 'a7c9e1f3b5d7'
down_revision = 'f4b6d8e0a2c3'
branch_labels = None
depends_on = None

TABLE = 'goal_completion_conditions'


def _replace(name, condition):
    op.drop_constraint(name, TABLE, type_='check')
    op.create_check_constraint(name, TABLE, condition)


def upgrade():
    _replace(
        'ck_goal_conditions_kind_measure',
        "(kind = 'single_session' AND measure IN ('sets', 'yield', 'set_yield'))"
        " OR (kind = 'cumulative' AND measure IN ('metric', 'yield'))"
        " OR (kind = 'consistency' AND measure = 'sets')",
    )
    _replace(
        'ck_goal_conditions_min_sets',
        "measure NOT IN ('sets', 'set_yield') OR kind <> 'single_session' OR min_sets >= 1",
    )
    _replace(
        'ck_goal_conditions_total',
        "measure NOT IN ('yield', 'set_yield', 'metric') OR (target_value IS NOT NULL AND operator IN ('>=', '>', '<=', '<'))",
    )
    _replace(
        'ck_goal_conditions_set_aggregate',
        "set_aggregate = 'each' OR (set_aggregate = 'average' AND measure IN ('sets', 'set_yield')"
        " AND kind IN ('single_session', 'consistency') AND min_sets >= 1)",
    )


def downgrade():
    _replace(
        'ck_goal_conditions_set_aggregate',
        "set_aggregate = 'each' OR (set_aggregate = 'average' AND measure = 'sets'"
        " AND kind IN ('single_session', 'consistency') AND min_sets >= 1)",
    )
    _replace(
        'ck_goal_conditions_total',
        "measure NOT IN ('yield', 'metric') OR (target_value IS NOT NULL AND operator IN ('>=', '>', '<=', '<'))",
    )
    _replace(
        'ck_goal_conditions_min_sets',
        "measure <> 'sets' OR kind <> 'single_session' OR min_sets >= 1",
    )
    _replace(
        'ck_goal_conditions_kind_measure',
        "(kind = 'single_session' AND measure IN ('sets', 'yield'))"
        " OR (kind = 'cumulative' AND measure IN ('metric', 'yield'))"
        " OR (kind = 'consistency' AND measure = 'sets')",
    )
