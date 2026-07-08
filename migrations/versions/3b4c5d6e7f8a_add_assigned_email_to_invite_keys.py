"""add assigned email to invite keys

Revision ID: 3b4c5d6e7f8a
Revises: 2a3b4c5d6e7f
Create Date: 2026-07-07 00:00:02.000000
"""

from alembic import op
import sqlalchemy as sa


revision = '3b4c5d6e7f8a'
down_revision = '2a3b4c5d6e7f'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('signup_invite_keys', sa.Column('assigned_email', sa.String(length=120), nullable=True))
    op.create_index(op.f('ix_signup_invite_keys_assigned_email'), 'signup_invite_keys', ['assigned_email'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_signup_invite_keys_assigned_email'), table_name='signup_invite_keys')
    op.drop_column('signup_invite_keys', 'assigned_email')
