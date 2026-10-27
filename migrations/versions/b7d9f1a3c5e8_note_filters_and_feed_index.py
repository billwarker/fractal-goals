"""Saved Notes page filters, and an index for the live notes feed by time."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b7d9f1a3c5e8'
down_revision = 'a6c8e0b2d4f7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'note_filters',
        sa.Column('id', sa.String(), primary_key=True, nullable=False),
        sa.Column('root_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=60), nullable=False),
        sa.Column('spec', postgresql.JSONB(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('root_id', 'name', name='uq_note_filters_root_name'),
    )
    op.create_index('ix_note_filters_root_id', 'note_filters', ['root_id'])
    op.create_index(
        'ix_notes_root_live_created', 'notes', ['root_id', 'created_at'],
        postgresql_where=sa.text('deleted_at IS NULL'),
    )


def downgrade():
    op.drop_index('ix_notes_root_live_created', table_name='notes')
    op.drop_index('ix_note_filters_root_id', table_name='note_filters')
    op.drop_table('note_filters')
