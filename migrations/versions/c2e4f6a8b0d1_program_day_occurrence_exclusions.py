"""Add per-date program day exclusions.

Revision ID: c2e4f6a8b0d1
Revises: b8d4f2a6c1e3
"""
from alembic import op
import sqlalchemy as sa

revision = 'c2e4f6a8b0d1'
down_revision = 'b8d4f2a6c1e3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'program_day_occurrence_exclusions',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('program_day_id', sa.String(), sa.ForeignKey('program_days.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('created_by_user_id', sa.String(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('program_day_id', 'date', name='uq_program_day_occurrence_exclusion_day_date'),
    )
    op.create_index('ix_program_day_occurrence_exclusions_program_day_id', 'program_day_occurrence_exclusions', ['program_day_id'])


def downgrade():
    op.drop_table('program_day_occurrence_exclusions')
