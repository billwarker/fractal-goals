"""A goal links at most one live activity group.

Non-destructive: aborts when any goal already holds several live group links, so they are
resolved deliberately (scripts/report_multi_group_goals.py lists them) rather than silently dropped.
"""
from alembic import op
import sqlalchemy as sa

revision = 'a7c9e1b3d5f7'
down_revision = 'c9e1a3b5d7f2'
branch_labels = None
depends_on = None

INDEX_NAME = 'uq_goal_activity_group_associations_one_active'


def upgrade():
    conflicts = op.get_bind().execute(sa.text("""
        SELECT goal_id, count(*) AS links
        FROM goal_activity_group_associations
        WHERE deleted_at IS NULL
        GROUP BY goal_id
        HAVING count(*) > 1
        ORDER BY goal_id
    """)).all()
    if conflicts:
        listed = ', '.join(f'{goal_id} ({links} groups)' for goal_id, links in conflicts[:20])
        raise RuntimeError(
            f'{len(conflicts)} goal(s) link more than one activity group: {listed}. '
            'Run scripts/report_multi_group_goals.py, keep one group per goal, then re-run the migration.'
        )
    op.create_index(
        INDEX_NAME, 'goal_activity_group_associations', ['goal_id'],
        unique=True, postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade():
    op.drop_index(INDEX_NAME, table_name='goal_activity_group_associations')
