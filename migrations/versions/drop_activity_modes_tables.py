"""drop_activity_modes_tables

Revision ID: c4d5e6f7a8b9
Revises: 23b551de5bfa
Create Date: 2026-04-14

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = 'c4d5e6f7a8b9'
down_revision = '23b551de5bfa'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'activity_instance_modes' in existing_tables:
        op.drop_table('activity_instance_modes')
    if 'activity_modes' in existing_tables:
        op.drop_table('activity_modes')


def downgrade():
    op.create_table(
        'activity_modes',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('root_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('color', sa.String(), nullable=True),
        sa.Column('sort_order', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_activity_modes_root_id', 'activity_modes', ['root_id'])
    op.create_table(
        'activity_instance_modes',
        sa.Column('activity_instance_id', sa.String(), sa.ForeignKey('activity_instances.id', ondelete='CASCADE'), primary_key=True, nullable=False),
        sa.Column('activity_mode_id', sa.String(), sa.ForeignKey('activity_modes.id', ondelete='CASCADE'), primary_key=True, nullable=False),
        sa.Column('created_at', sa.DateTime()),
    )
