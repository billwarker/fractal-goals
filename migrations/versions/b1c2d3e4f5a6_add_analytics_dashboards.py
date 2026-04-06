"""add analytics_dashboards table

Revision ID: b1c2d3e4f5a6
Revises: aafd1b71dd36
Create Date: 2026-04-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'aafd1b71dd36'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'analytics_dashboards',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('layout', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_analytics_dashboards_root_id', 'analytics_dashboards', ['root_id'], unique=False)
    op.create_index('ix_analytics_dashboards_user_id', 'analytics_dashboards', ['user_id'], unique=False)
    op.create_index(
        'ix_analytics_dashboards_root_user_deleted',
        'analytics_dashboards',
        ['root_id', 'user_id', 'deleted_at'],
        unique=False,
    )

def downgrade() -> None:
    op.drop_index('ix_analytics_dashboards_root_user_deleted', table_name='analytics_dashboards')
    op.drop_index('ix_analytics_dashboards_user_id', table_name='analytics_dashboards')
    op.drop_index('ix_analytics_dashboards_root_id', table_name='analytics_dashboards')
    op.drop_table('analytics_dashboards')
