"""add analytics query profiles

Revision ID: a6f3d2c1b9e8
Revises: e7a1b9c3d2f4
Create Date: 2026-06-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a6f3d2c1b9e8'
down_revision: Union[str, Sequence[str], None] = 'e7a1b9c3d2f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'analytics_query_profiles',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('query_spec', sa.JSON(), nullable=False),
        sa.Column('visualization_spec', sa.JSON(), nullable=True),
        sa.Column('spec_version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_analytics_query_profiles_user_deleted',
        'analytics_query_profiles',
        ['user_id', 'deleted_at'],
        unique=False,
    )
    op.create_index('ix_analytics_query_profiles_user_id', 'analytics_query_profiles', ['user_id'], unique=False)
    op.create_index(
        'uq_analytics_query_profiles_active_user_name',
        'analytics_query_profiles',
        ['user_id', 'name'],
        unique=True,
        postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_analytics_query_profiles_active_user_name', table_name='analytics_query_profiles')
    op.drop_index('ix_analytics_query_profiles_user_id', table_name='analytics_query_profiles')
    op.drop_index('ix_analytics_query_profiles_user_deleted', table_name='analytics_query_profiles')
    op.drop_table('analytics_query_profiles')
