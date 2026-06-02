"""remove_program_day_note_condition

Revision ID: 0b1c2d3e4f5a
Revises: f0a1b2c3d4e5
Create Date: 2026-06-01 11:25:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0b1c2d3e4f5a'
down_revision = 'f0a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('program_days') as batch_op:
        batch_op.drop_column('note_condition')


def downgrade():
    with op.batch_alter_table('program_days') as batch_op:
        batch_op.add_column(sa.Column('note_condition', sa.Boolean(), nullable=False, server_default='false'))
    with op.batch_alter_table('program_days') as batch_op:
        batch_op.alter_column('note_condition', server_default=None)
