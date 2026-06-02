"""add admin roles invites storage

Revision ID: ab12cd34ef56
Revises: 0b1c2d3e4f5a
Create Date: 2026-06-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = 'ab12cd34ef56'
down_revision = '0b1c2d3e4f5a'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('role', sa.String(length=32), nullable=False, server_default='user'))
    op.add_column('users', sa.Column('storage_limit_bytes', sa.BigInteger(), nullable=True, server_default='104857600'))
    op.create_index(op.f('ix_users_role'), 'users', ['role'], unique=False)

    op.create_table(
        'signup_invite_keys',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('key_hash', sa.String(length=64), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=True),
        sa.Column('created_by_user_id', sa.String(), nullable=True),
        sa.Column('used_by_user_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['used_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_signup_invite_keys_created_by_user_id'), 'signup_invite_keys', ['created_by_user_id'], unique=False)
    op.create_index(op.f('ix_signup_invite_keys_key_hash'), 'signup_invite_keys', ['key_hash'], unique=True)
    op.create_index(op.f('ix_signup_invite_keys_used_by_user_id'), 'signup_invite_keys', ['used_by_user_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_signup_invite_keys_used_by_user_id'), table_name='signup_invite_keys')
    op.drop_index(op.f('ix_signup_invite_keys_key_hash'), table_name='signup_invite_keys')
    op.drop_index(op.f('ix_signup_invite_keys_created_by_user_id'), table_name='signup_invite_keys')
    op.drop_table('signup_invite_keys')
    op.drop_index(op.f('ix_users_role'), table_name='users')
    op.drop_column('users', 'storage_limit_bytes')
    op.drop_column('users', 'role')
