"""Initial migration - baseline schema

Revision ID: 5d02309afbcb
Revises: 
Create Date: 2026-01-17 21:19:35.816575

This is the baseline migration that represents the current database schema.
For existing SQLite databases, this migration is already applied (stamp it).
For new PostgreSQL databases, this will create all tables from scratch.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5d02309afbcb'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create database schema."""
    # Check if tables already exist (for existing SQLite databases)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    if 'goals' in existing_tables:
        # Tables already exist - this is an existing database
        # Nothing to do, schema is already in place
        print("Tables already exist, skipping table creation")
        return
    
    # Create all tables for new databases (PostgreSQL)
    
    # Goals table (base table for goal hierarchy)
    op.create_table('goals',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), server_default=''),
        sa.Column('deadline', sa.DateTime(), nullable=True),
        sa.Column('completed', sa.Boolean(), server_default='false'),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('parent_id', sa.String(), nullable=True),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('root_id', sa.String(), nullable=True),
        sa.Column('relevance_statement', sa.Text(), nullable=True),
        sa.Column('is_smart', sa.Boolean(), server_default='false'),
        sa.Column('targets', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['parent_id'], ['goals.id'], ondelete='CASCADE'),
        sa.CheckConstraint(
            "type IN ('UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal', 'ImmediateGoal', 'MicroGoal', 'NanoGoal')",
            name='valid_goal_type'
        )
    )
    op.create_index('ix_goals_parent_id', 'goals', ['parent_id'])
    op.create_index('ix_goals_root_id', 'goals', ['root_id'])
    op.create_index('ix_goals_type', 'goals', ['type'])
    
    # Activity Groups table
    op.create_table('activity_groups',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), server_default=''),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'])
    )
    op.create_index('ix_activity_groups_root_id', 'activity_groups', ['root_id'])
    
    # Activity Definitions table
    op.create_table('activity_definitions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), server_default=''),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('has_sets', sa.Boolean(), server_default='false'),
        sa.Column('has_metrics', sa.Boolean(), server_default='true'),
        sa.Column('metrics_multiplicative', sa.Boolean(), server_default='false'),
        sa.Column('has_splits', sa.Boolean(), server_default='false'),
        sa.Column('group_id', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id']),
        sa.ForeignKeyConstraint(['group_id'], ['activity_groups.id'])
    )
    op.create_index('ix_activity_definitions_root_id', 'activity_definitions', ['root_id'])
    
    # Activity-Goal associations (for SMART goals)
    op.create_table('activity_goal_associations',
        sa.Column('activity_id', sa.String(), nullable=False),
        sa.Column('goal_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('activity_id', 'goal_id'),
        sa.ForeignKeyConstraint(['activity_id'], ['activity_definitions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['goal_id'], ['goals.id'], ondelete='CASCADE')
    )
    
    # Metric Definitions table
    op.create_table('metric_definitions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('activity_id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('unit', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('is_top_set_metric', sa.Boolean(), server_default='false'),
        sa.Column('is_multiplicative', sa.Boolean(), server_default='true'),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['activity_id'], ['activity_definitions.id']),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE')
    )
    op.create_index('ix_metric_definitions_root_id', 'metric_definitions', ['root_id'])
    op.create_index('ix_metric_definitions_activity_id', 'metric_definitions', ['activity_id'])
    
    # Split Definitions table
    op.create_table('split_definitions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('activity_id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['activity_id'], ['activity_definitions.id']),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE')
    )
    op.create_index('ix_split_definitions_root_id', 'split_definitions', ['root_id'])
    
    # Session Templates table
    op.create_table('session_templates',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), server_default=''),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('template_data', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'])
    )
    op.create_index('ix_session_templates_root_id', 'session_templates', ['root_id'])
    
    # Programs table
    op.create_table('programs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), server_default=''),
        sa.Column('start_date', sa.DateTime(), nullable=False),
        sa.Column('end_date', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('goal_ids', sa.Text(), nullable=False),
        sa.Column('weekly_schedule', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'])
    )
    op.create_index('ix_programs_root_id', 'programs', ['root_id'])
    
    # Program Blocks table
    op.create_table('program_blocks',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('program_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('color', sa.String(), nullable=True),
        sa.Column('goal_ids', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['program_id'], ['programs.id'])
    )
    
    # Program Days table
    op.create_table('program_days',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('block_id', sa.String(), nullable=False),
        sa.Column('date', sa.Date(), nullable=True),
        sa.Column('day_number', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_completed', sa.Boolean(), server_default='false'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['block_id'], ['program_blocks.id'])
    )
    
    # Program Day Templates junction table
    op.create_table('program_day_templates',
        sa.Column('program_day_id', sa.String(), nullable=False),
        sa.Column('session_template_id', sa.String(), nullable=False),
        sa.Column('order', sa.Integer(), server_default='0'),
        sa.PrimaryKeyConstraint('program_day_id', 'session_template_id'),
        sa.ForeignKeyConstraint(['program_day_id'], ['program_days.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_template_id'], ['session_templates.id'], ondelete='CASCADE')
    )
    
    # Sessions table
    op.create_table('sessions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), server_default=''),
        sa.Column('session_start', sa.DateTime(), nullable=True),
        sa.Column('session_end', sa.DateTime(), nullable=True),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('total_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('template_id', sa.String(), nullable=True),
        sa.Column('program_day_id', sa.String(), nullable=True),
        sa.Column('attributes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('completed', sa.Boolean(), server_default='false'),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id']),
        sa.ForeignKeyConstraint(['template_id'], ['session_templates.id']),
        sa.ForeignKeyConstraint(['program_day_id'], ['program_days.id'])
    )
    op.create_index('ix_sessions_root_id', 'sessions', ['root_id'])
    
    # Session-Goals junction table
    op.create_table('session_goals',
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('goal_id', sa.String(), nullable=False),
        sa.Column('goal_type', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('session_id', 'goal_id'),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['goal_id'], ['goals.id'], ondelete='CASCADE')
    )
    
    # Activity Instances table
    op.create_table('activity_instances',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=True),
        sa.Column('practice_session_id', sa.String(), nullable=True),  # Legacy
        sa.Column('activity_definition_id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('time_start', sa.DateTime(), nullable=True),
        sa.Column('time_stop', sa.DateTime(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('completed', sa.Boolean(), server_default='false'),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('data', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['activity_definition_id'], ['activity_definitions.id']),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE')
    )
    op.create_index('ix_activity_instances_root_id', 'activity_instances', ['root_id'])
    op.create_index('ix_activity_instances_session_id', 'activity_instances', ['session_id'])
    
    # Metric Values table
    op.create_table('metric_values',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('activity_instance_id', sa.String(), nullable=False),
        sa.Column('metric_definition_id', sa.String(), nullable=False),
        sa.Column('split_definition_id', sa.String(), nullable=True),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['activity_instance_id'], ['activity_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['metric_definition_id'], ['metric_definitions.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['split_definition_id'], ['split_definitions.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE')
    )
    op.create_index('ix_metric_values_root_id', 'metric_values', ['root_id'])
    
    # Notes table
    op.create_table('notes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('context_type', sa.String(), nullable=False),
        sa.Column('context_id', sa.String(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=True),
        sa.Column('activity_instance_id', sa.String(), nullable=True),
        sa.Column('activity_definition_id', sa.String(), nullable=True),
        sa.Column('set_index', sa.Integer(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('image_data', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['activity_instance_id'], ['activity_instances.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['activity_definition_id'], ['activity_definitions.id'], ondelete='SET NULL')
    )
    op.create_index('ix_notes_root_id', 'notes', ['root_id'])
    op.create_index('ix_notes_session_id', 'notes', ['session_id'])
    op.create_index('ix_notes_context_id', 'notes', ['context_id'])


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table('notes')
    op.drop_table('metric_values')
    op.drop_table('activity_instances')
    op.drop_table('session_goals')
    op.drop_table('sessions')
    op.drop_table('program_day_templates')
    op.drop_table('program_days')
    op.drop_table('program_blocks')
    op.drop_table('programs')
    op.drop_table('session_templates')
    op.drop_table('split_definitions')
    op.drop_table('metric_definitions')
    op.drop_table('activity_goal_associations')
    op.drop_table('activity_definitions')
    op.drop_table('activity_groups')
    op.drop_table('goals')
