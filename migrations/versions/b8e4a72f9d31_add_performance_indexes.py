"""add performance indexes

Revision ID: b8e4a72f9d31
Revises: a9912bb2692d
Create Date: 2026-01-21 22:30:00.000000

Adds indexes on frequently queried columns for better performance:
- sessions.root_id - scoped to fractal
- sessions.deleted_at - soft delete filter
- sessions.created_at - ordering
- goals.root_id - scoped queries
- goals.deleted_at - soft delete filter
- goals.parent_id - tree traversal
- activity_instances.session_id - lookup by session
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8e4a72f9d31'
down_revision = 'a9912bb2692d'
branch_labels = None
depends_on = None


def upgrade():
    # Sessions indexes
    op.create_index('ix_sessions_root_id', 'sessions', ['root_id'], unique=False)
    op.create_index('ix_sessions_deleted_at', 'sessions', ['deleted_at'], unique=False)
    op.create_index('ix_sessions_created_at', 'sessions', ['created_at'], unique=False)
    op.create_index('ix_sessions_completed', 'sessions', ['completed'], unique=False)
    
    # Composite index for common query pattern: active sessions for a fractal
    op.create_index('ix_sessions_root_deleted', 'sessions', ['root_id', 'deleted_at'], unique=False)
    
    # Goals indexes
    op.create_index('ix_goals_root_id', 'goals', ['root_id'], unique=False)
    op.create_index('ix_goals_deleted_at', 'goals', ['deleted_at'], unique=False)
    op.create_index('ix_goals_parent_id', 'goals', ['parent_id'], unique=False)
    op.create_index('ix_goals_type', 'goals', ['type'], unique=False)
    
    # Composite index for common query pattern: goals by type within a fractal
    op.create_index('ix_goals_root_type', 'goals', ['root_id', 'type'], unique=False)
    
    # Activity instances indexes
    op.create_index('ix_activity_instances_session_id', 'activity_instances', ['session_id'], unique=False)
    op.create_index('ix_activity_instances_deleted_at', 'activity_instances', ['deleted_at'], unique=False)
    op.create_index('ix_activity_instances_activity_def_id', 'activity_instances', ['activity_definition_id'], unique=False)
    
    # Activity definitions index
    op.create_index('ix_activity_definitions_group_id', 'activity_definitions', ['group_id'], unique=False)
    op.create_index('ix_activity_definitions_root_id', 'activity_definitions', ['root_id'], unique=False)
    
    # Activity groups index
    op.create_index('ix_activity_groups_root_id', 'activity_groups', ['root_id'], unique=False)
    
    # Programs indexes
    op.create_index('ix_programs_root_id', 'programs', ['root_id'], unique=False)
    op.create_index('ix_programs_is_active', 'programs', ['is_active'], unique=False)
    
    # Session templates index
    op.create_index('ix_session_templates_root_id', 'session_templates', ['root_id'], unique=False)


def downgrade():
    # Remove all indexes in reverse order
    op.drop_index('ix_session_templates_root_id', table_name='session_templates')
    
    op.drop_index('ix_programs_is_active', table_name='programs')
    op.drop_index('ix_programs_root_id', table_name='programs')
    
    op.drop_index('ix_activity_groups_root_id', table_name='activity_groups')
    
    op.drop_index('ix_activity_definitions_root_id', table_name='activity_definitions')
    op.drop_index('ix_activity_definitions_group_id', table_name='activity_definitions')
    
    op.drop_index('ix_activity_instances_activity_def_id', table_name='activity_instances')
    op.drop_index('ix_activity_instances_deleted_at', table_name='activity_instances')
    op.drop_index('ix_activity_instances_session_id', table_name='activity_instances')
    
    op.drop_index('ix_goals_root_type', table_name='goals')
    op.drop_index('ix_goals_type', table_name='goals')
    op.drop_index('ix_goals_parent_id', table_name='goals')
    op.drop_index('ix_goals_deleted_at', table_name='goals')
    op.drop_index('ix_goals_root_id', table_name='goals')
    
    op.drop_index('ix_sessions_root_deleted', table_name='sessions')
    op.drop_index('ix_sessions_completed', table_name='sessions')
    op.drop_index('ix_sessions_created_at', table_name='sessions')
    op.drop_index('ix_sessions_deleted_at', table_name='sessions')
    op.drop_index('ix_sessions_root_id', table_name='sessions')
