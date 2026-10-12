"""Add explicit, history-preserving activity-instance goal links."""
from alembic import op
import sqlalchemy as sa

revision = 'a4c6e8f0b2d4'
down_revision = 'd3f5a7b9c1e2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'activity_instance_goal_associations',
        sa.Column('activity_instance_id', sa.String(), sa.ForeignKey('activity_instances.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('goal_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_activity_instance_goal_associations_goal_id', 'activity_instance_goal_associations', ['goal_id', 'activity_instance_id'])


def downgrade():
    op.drop_table('activity_instance_goal_associations')
