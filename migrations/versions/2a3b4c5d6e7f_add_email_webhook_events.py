"""add email webhook events

Revision ID: 2a3b4c5d6e7f
Revises: 1f2e3d4c5b6a
Create Date: 2026-07-07 00:00:01.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '2a3b4c5d6e7f'
down_revision = '1f2e3d4c5b6a'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('email_delivery_events', sa.Column('last_event_type', sa.String(length=80), nullable=True))
    op.add_column('email_delivery_events', sa.Column('last_event_at', sa.DateTime(), nullable=True))
    op.add_column('email_delivery_events', sa.Column('delivered_at', sa.DateTime(), nullable=True))

    op.create_table(
        'email_webhook_events',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('provider', sa.String(length=32), nullable=False),
        sa.Column('provider_event_id', sa.String(length=255), nullable=False),
        sa.Column('provider_message_id', sa.String(length=255), nullable=True),
        sa.Column('event_type', sa.String(length=80), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_email_webhook_events_event_type'), 'email_webhook_events', ['event_type'], unique=False)
    op.create_index(op.f('ix_email_webhook_events_provider'), 'email_webhook_events', ['provider'], unique=False)
    op.create_index(op.f('ix_email_webhook_events_provider_event_id'), 'email_webhook_events', ['provider_event_id'], unique=True)
    op.create_index(op.f('ix_email_webhook_events_provider_message_id'), 'email_webhook_events', ['provider_message_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_email_webhook_events_provider_message_id'), table_name='email_webhook_events')
    op.drop_index(op.f('ix_email_webhook_events_provider_event_id'), table_name='email_webhook_events')
    op.drop_index(op.f('ix_email_webhook_events_provider'), table_name='email_webhook_events')
    op.drop_index(op.f('ix_email_webhook_events_event_type'), table_name='email_webhook_events')
    op.drop_table('email_webhook_events')

    op.drop_column('email_delivery_events', 'delivered_at')
    op.drop_column('email_delivery_events', 'last_event_at')
    op.drop_column('email_delivery_events', 'last_event_type')
