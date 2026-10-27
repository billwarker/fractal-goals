"""Media attachments on goal descriptions."""
from alembic import op
import sqlalchemy as sa

revision = 'c9e1a3b5d7f2'
down_revision = 'b7d9f1a3c5e8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'goal_attachments',
        sa.Column('id', sa.String(), primary_key=True, nullable=False),
        sa.Column('goal_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(), sa.ForeignKey('media_assets.id', ondelete='CASCADE'), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('alt_text', sa.String(length=500), nullable=False),
        sa.UniqueConstraint('goal_id', 'asset_id', name='uq_goal_asset'),
        sa.UniqueConstraint('goal_id', 'position', name='uq_goal_attachment_position'),
    )
    op.create_index('ix_goal_attachments_goal_id', 'goal_attachments', ['goal_id'])
    op.create_index('ix_goal_attachments_asset_id', 'goal_attachments', ['asset_id'])


def downgrade():
    op.drop_index('ix_goal_attachments_asset_id', table_name='goal_attachments')
    op.drop_index('ix_goal_attachments_goal_id', table_name='goal_attachments')
    op.drop_table('goal_attachments')
