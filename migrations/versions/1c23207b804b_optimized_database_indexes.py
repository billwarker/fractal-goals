"""Optimized database indexes

Revision ID: 1c23207b804b
Revises: b8e4a72f9d31
Create Date: 2026-01-22 22:24:15.708385

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1c23207b804b'
down_revision: Union[str, Sequence[str], None] = 'b8e4a72f9d31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new composite indexes
    op.create_index('ix_activity_instances_session_deleted', 'activity_instances', ['session_id', 'deleted_at'], unique=False)
    op.create_index('ix_goals_root_deleted_type', 'goals', ['root_id', 'deleted_at', 'type'], unique=False)
    op.create_index('ix_goals_root_parent_deleted', 'goals', ['root_id', 'parent_id', 'deleted_at'], unique=False)
    op.create_index('ix_notes_root_context_deleted', 'notes', ['root_id', 'context_type', 'context_id', 'deleted_at'], unique=False)
    op.create_index('ix_sessions_root_deleted_completed', 'sessions', ['root_id', 'deleted_at', 'completed'], unique=False)
    op.create_index('ix_viz_annotations_root_type_context', 'visualization_annotations', ['root_id', 'visualization_type', 'deleted_at'], unique=False)


def downgrade() -> None:
    # Remove new composite indexes
    op.drop_index('ix_viz_annotations_root_type_context', table_name='visualization_annotations')
    op.drop_index('ix_sessions_root_deleted_completed', table_name='sessions')
    op.drop_index('ix_notes_root_context_deleted', table_name='notes')
    op.drop_index('ix_goals_root_parent_deleted', table_name='goals')
    op.drop_index('ix_goals_root_deleted_type', table_name='goals')
    op.drop_index('ix_activity_instances_session_deleted', table_name='activity_instances')
