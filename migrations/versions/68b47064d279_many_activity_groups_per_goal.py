"""A goal links any number of live activity groups.

Relaxing and non-destructive: drops the partial unique index that a7c9e1b3d5f7 added. No rows are
read or rewritten, and the composite primary key (goal_id, activity_group_id) still serves lookups
by goal. Downgrade recreates the index and, like a7c9e1b3d5f7, stops with a listing while any goal
holds several live groups (scripts/report_multi_group_goals.py lists them) instead of dropping links.
"""
from alembic import op
import sqlalchemy as sa

revision = '68b47064d279'
down_revision = 'b8d2f4a6c0e1'
branch_labels = None
depends_on = None

INDEX_NAME = 'uq_goal_activity_group_associations_one_active'


def upgrade():
    op.drop_index(INDEX_NAME, table_name='goal_activity_group_associations', if_exists=True)


def downgrade():
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
            'Run scripts/report_multi_group_goals.py, keep one group per goal, then re-run the downgrade.'
        )
    op.create_index(
        INDEX_NAME, 'goal_activity_group_associations', ['goal_id'],
        unique=True, postgresql_where=sa.text('deleted_at IS NULL'),
    )
