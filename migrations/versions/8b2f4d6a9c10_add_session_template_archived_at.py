"""add session template archived_at

Revision ID: 8b2f4d6a9c10
Revises: 3a1c9e7b2d40
Create Date: 2026-06-16 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8b2f4d6a9c10'
down_revision: Union[str, None] = '3a1c9e7b2d40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('session_templates', sa.Column('archived_at', sa.DateTime(), nullable=True))
    op.create_index('ix_session_templates_root_archived_deleted', 'session_templates', ['root_id', 'archived_at', 'deleted_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_session_templates_root_archived_deleted', table_name='session_templates')
    op.drop_column('session_templates', 'archived_at')
