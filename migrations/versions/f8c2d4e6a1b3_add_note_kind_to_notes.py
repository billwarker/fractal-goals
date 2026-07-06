"""add note kind to notes

Revision ID: f8c2d4e6a1b3
Revises: e1a2b3c4d5f6
Create Date: 2026-07-06 16:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f8c2d4e6a1b3'
down_revision: Union[str, Sequence[str], None] = 'e1a2b3c4d5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('notes', sa.Column('note_kind', sa.String(), nullable=True))
    op.create_index(op.f('ix_notes_note_kind'), 'notes', ['note_kind'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_notes_note_kind'), table_name='notes')
    op.drop_column('notes', 'note_kind')
