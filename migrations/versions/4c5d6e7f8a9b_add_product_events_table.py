"""add product events table

Revision ID: 4c5d6e7f8a9b
Revises: 3b4c5d6e7f8a
Create Date: 2026-07-07 00:00:03.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = '4c5d6e7f8a9b'
down_revision = '3b4c5d6e7f8a'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'product_events',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('event_name', sa.String(length=80), nullable=False),
        sa.Column('path', sa.String(length=255), nullable=True),
        sa.Column('root_id', sa.String(), nullable=True),
        sa.Column('properties', JSONB(), nullable=True),
        sa.Column('client_ts', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_product_events_user_id'), 'product_events', ['user_id'], unique=False)
    op.create_index(op.f('ix_product_events_created_at'), 'product_events', ['created_at'], unique=False)
    op.create_index('ix_product_events_user_created_at', 'product_events', ['user_id', 'created_at'], unique=False)
    op.create_index('ix_product_events_event_name_created_at', 'product_events', ['event_name', 'created_at'], unique=False)


def downgrade():
    op.drop_index('ix_product_events_event_name_created_at', table_name='product_events')
    op.drop_index('ix_product_events_user_created_at', table_name='product_events')
    op.drop_index(op.f('ix_product_events_created_at'), table_name='product_events')
    op.drop_index(op.f('ix_product_events_user_id'), table_name='product_events')
    op.drop_table('product_events')
