"""Add program-day weekly recurrence intervals.

Revision ID: d3f5a7b9c1e2
Revises: c2e4f6a8b0d1
"""
from alembic import op
import sqlalchemy as sa

revision = 'd3f5a7b9c1e2'
down_revision = 'c2e4f6a8b0d1'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('program_days') as batch:
        batch.add_column(sa.Column('repeat_every_weeks', sa.Integer(), nullable=False, server_default='1'))
        batch.create_check_constraint('ck_program_days_repeat_every_weeks_positive', 'repeat_every_weeks >= 1')


def downgrade():
    with op.batch_alter_table('program_days') as batch:
        batch.drop_constraint('ck_program_days_repeat_every_weeks_positive', type_='check')
        batch.drop_column('repeat_every_weeks')
