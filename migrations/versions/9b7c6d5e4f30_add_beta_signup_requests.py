"""add beta signup requests

Revision ID: 9b7c6d5e4f30
Revises: 0f4e8a9c1b23
Create Date: 2026-06-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9b7c6d5e4f30'
down_revision: Union[str, Sequence[str], None] = '0f4e8a9c1b23'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'beta_signup_requests',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('email', sa.String(length=120), nullable=False),
        sa.Column('use_case', sa.String(length=80), nullable=False),
        sa.Column('note', sa.String(length=1000), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('source', sa.String(length=80), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_beta_signup_requests_email'), 'beta_signup_requests', ['email'], unique=True)
    op.create_index(op.f('ix_beta_signup_requests_status'), 'beta_signup_requests', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_beta_signup_requests_status'), table_name='beta_signup_requests')
    op.drop_index(op.f('ix_beta_signup_requests_email'), table_name='beta_signup_requests')
    op.drop_table('beta_signup_requests')
