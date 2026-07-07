"""add email service tables

Revision ID: 1f2e3d4c5b6a
Revises: f8c2d4e6a1b3
Create Date: 2026-07-07 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = '1f2e3d4c5b6a'
down_revision = 'f8c2d4e6a1b3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'password_reset_tokens',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_password_reset_tokens_expires_at'), 'password_reset_tokens', ['expires_at'], unique=False)
    op.create_index(op.f('ix_password_reset_tokens_token_hash'), 'password_reset_tokens', ['token_hash'], unique=True)
    op.create_index(op.f('ix_password_reset_tokens_used_at'), 'password_reset_tokens', ['used_at'], unique=False)
    op.create_index(op.f('ix_password_reset_tokens_user_id'), 'password_reset_tokens', ['user_id'], unique=False)

    op.add_column('beta_signup_requests', sa.Column('invited_at', sa.DateTime(), nullable=True))
    op.add_column('beta_signup_requests', sa.Column('invite_key_id', sa.String(), nullable=True))
    op.add_column('beta_signup_requests', sa.Column('last_invite_email_sent_at', sa.DateTime(), nullable=True))
    op.create_index(op.f('ix_beta_signup_requests_invite_key_id'), 'beta_signup_requests', ['invite_key_id'], unique=False)
    op.create_foreign_key(
        op.f('fk_beta_signup_requests_invite_key_id_signup_invite_keys'),
        'beta_signup_requests',
        'signup_invite_keys',
        ['invite_key_id'],
        ['id'],
        ondelete='SET NULL',
    )

    op.create_table(
        'email_delivery_events',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('provider', sa.String(length=32), nullable=False),
        sa.Column('template_key', sa.String(length=80), nullable=False),
        sa.Column('entity_type', sa.String(length=80), nullable=True),
        sa.Column('entity_id', sa.String(), nullable=True),
        sa.Column('recipient_user_id', sa.String(), nullable=True),
        sa.Column('beta_signup_id', sa.String(), nullable=True),
        sa.Column('provider_message_id', sa.String(length=255), nullable=True),
        sa.Column('idempotency_key', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('error_summary', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['beta_signup_id'], ['beta_signup_requests.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['recipient_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_email_delivery_events_beta_signup_id'), 'email_delivery_events', ['beta_signup_id'], unique=False)
    op.create_index(op.f('ix_email_delivery_events_entity_id'), 'email_delivery_events', ['entity_id'], unique=False)
    op.create_index(op.f('ix_email_delivery_events_entity_type'), 'email_delivery_events', ['entity_type'], unique=False)
    op.create_index(op.f('ix_email_delivery_events_idempotency_key'), 'email_delivery_events', ['idempotency_key'], unique=False)
    op.create_index(op.f('ix_email_delivery_events_provider'), 'email_delivery_events', ['provider'], unique=False)
    op.create_index(op.f('ix_email_delivery_events_recipient_user_id'), 'email_delivery_events', ['recipient_user_id'], unique=False)
    op.create_index(op.f('ix_email_delivery_events_status'), 'email_delivery_events', ['status'], unique=False)
    op.create_index(op.f('ix_email_delivery_events_template_key'), 'email_delivery_events', ['template_key'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_email_delivery_events_template_key'), table_name='email_delivery_events')
    op.drop_index(op.f('ix_email_delivery_events_status'), table_name='email_delivery_events')
    op.drop_index(op.f('ix_email_delivery_events_recipient_user_id'), table_name='email_delivery_events')
    op.drop_index(op.f('ix_email_delivery_events_provider'), table_name='email_delivery_events')
    op.drop_index(op.f('ix_email_delivery_events_idempotency_key'), table_name='email_delivery_events')
    op.drop_index(op.f('ix_email_delivery_events_entity_type'), table_name='email_delivery_events')
    op.drop_index(op.f('ix_email_delivery_events_entity_id'), table_name='email_delivery_events')
    op.drop_index(op.f('ix_email_delivery_events_beta_signup_id'), table_name='email_delivery_events')
    op.drop_table('email_delivery_events')

    op.drop_constraint(op.f('fk_beta_signup_requests_invite_key_id_signup_invite_keys'), 'beta_signup_requests', type_='foreignkey')
    op.drop_index(op.f('ix_beta_signup_requests_invite_key_id'), table_name='beta_signup_requests')
    op.drop_column('beta_signup_requests', 'last_invite_email_sent_at')
    op.drop_column('beta_signup_requests', 'invite_key_id')
    op.drop_column('beta_signup_requests', 'invited_at')

    op.drop_index(op.f('ix_password_reset_tokens_user_id'), table_name='password_reset_tokens')
    op.drop_index(op.f('ix_password_reset_tokens_used_at'), table_name='password_reset_tokens')
    op.drop_index(op.f('ix_password_reset_tokens_token_hash'), table_name='password_reset_tokens')
    op.drop_index(op.f('ix_password_reset_tokens_expires_at'), table_name='password_reset_tokens')
    op.drop_table('password_reset_tokens')
