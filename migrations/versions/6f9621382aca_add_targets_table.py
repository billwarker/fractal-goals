"""add_targets_table

Revision ID: 6f9621382aca
Revises: 7080ee18b7a9
Create Date: 2026-02-07 18:52:56.923989

"""
from typing import Sequence, Union
import uuid
import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

# revision identifiers, used by Alembic.
revision: str = '6f9621382aca'
down_revision: Union[str, Sequence[str], None] = '7080ee18b7a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema and migrate data."""
    # 1. Create the targets table
    op.create_table('targets',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('goal_id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('activity_id', sa.String(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=True),
        sa.Column('metrics', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True),
        sa.Column('time_scope', sa.String(), nullable=True),
        sa.Column('start_date', sa.DateTime(), nullable=True),
        sa.Column('end_date', sa.DateTime(), nullable=True),
        sa.Column('linked_block_id', sa.String(), nullable=True),
        sa.Column('frequency_days', sa.Integer(), nullable=True),
        sa.Column('frequency_count', sa.Integer(), nullable=True),
        sa.Column('completed', sa.Boolean(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('completed_session_id', sa.String(), nullable=True),
        sa.Column('completed_instance_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['activity_id'], ['activity_definitions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['completed_instance_id'], ['activity_instances.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['completed_session_id'], ['sessions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['goal_id'], ['goals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['linked_block_id'], ['program_blocks.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_targets_activity_id'), 'targets', ['activity_id'], unique=False)
    op.create_index(op.f('ix_targets_completed'), 'targets', ['completed'], unique=False)
    op.create_index('ix_targets_goal_deleted', 'targets', ['goal_id', 'deleted_at'], unique=False)
    op.create_index(op.f('ix_targets_goal_id'), 'targets', ['goal_id'], unique=False)
    op.create_index('ix_targets_root_deleted', 'targets', ['root_id', 'deleted_at'], unique=False)
    op.create_index(op.f('ix_targets_root_id'), 'targets', ['root_id'], unique=False)
    
    # 2. Migrate existing JSON targets to relational table
    connection = op.get_bind()
    session = Session(bind=connection)
    
    # Get all goals with targets JSON data
    result = connection.execute(sa.text("""
        SELECT id, root_id, targets 
        FROM goals 
        WHERE targets IS NOT NULL AND targets != 'null' AND targets != '[]'
    """))
    
    migrated_count = 0
    for row in result:
        goal_id = row[0]
        root_id = row[1]
        targets_data = row[2]
        
        # Parse targets (handle both string and dict/list types)
        if isinstance(targets_data, str):
            try:
                targets = json.loads(targets_data)
            except (json.JSONDecodeError, TypeError):
                continue
        elif isinstance(targets_data, list):
            targets = targets_data
        else:
            continue
        
        if not targets or not isinstance(targets, list):
            continue
        
        for target in targets:
            if not isinstance(target, dict):
                continue
            
            # Use existing ID or generate new one
            target_id = target.get('id') or str(uuid.uuid4())
            
            # Parse dates if present
            completed_at = None
            if target.get('completed_at'):
                try:
                    completed_at = target.get('completed_at')
                except:
                    pass
            
            start_date = None
            if target.get('start_date'):
                try:
                    start_date = target.get('start_date')
                except:
                    pass
            
            end_date = None
            if target.get('end_date'):
                try:
                    end_date = target.get('end_date')
                except:
                    pass
            
            # Insert into targets table
            connection.execute(sa.text("""
                INSERT INTO targets (
                    id, goal_id, root_id, activity_id, name, type, metrics,
                    time_scope, start_date, end_date, linked_block_id,
                    frequency_days, frequency_count, completed, completed_at,
                    completed_session_id, completed_instance_id, created_at, updated_at
                ) VALUES (
                    :id, :goal_id, :root_id, :activity_id, :name, :type, :metrics,
                    :time_scope, :start_date, :end_date, :linked_block_id,
                    :frequency_days, :frequency_count, :completed, :completed_at,
                    :completed_session_id, :completed_instance_id, NOW(), NOW()
                )
            """), {
                'id': target_id,
                'goal_id': goal_id,
                'root_id': root_id,
                'activity_id': target.get('activity_id'),
                'name': target.get('name', 'Unnamed Target'),
                'type': target.get('type', 'threshold'),
                'metrics': json.dumps(target.get('metrics', [])) if target.get('metrics') else None,
                'time_scope': target.get('time_scope', 'all_time'),
                'start_date': start_date,
                'end_date': end_date,
                'linked_block_id': target.get('linked_block_id'),
                'frequency_days': target.get('frequency_days'),
                'frequency_count': target.get('frequency_count'),
                'completed': target.get('completed', False),
                'completed_at': completed_at,
                'completed_session_id': target.get('completed_session_id'),
                'completed_instance_id': target.get('completed_instance_id'),
            })
            migrated_count += 1
    
    print(f"[Migration] Migrated {migrated_count} targets from JSON to relational table")


def downgrade() -> None:
    """Downgrade schema."""
    # Note: This does not migrate data back to JSON - that would need to be done manually
    op.drop_index(op.f('ix_targets_root_id'), table_name='targets')
    op.drop_index('ix_targets_root_deleted', table_name='targets')
    op.drop_index(op.f('ix_targets_goal_id'), table_name='targets')
    op.drop_index('ix_targets_goal_deleted', table_name='targets')
    op.drop_index(op.f('ix_targets_completed'), table_name='targets')
    op.drop_index(op.f('ix_targets_activity_id'), table_name='targets')
    op.drop_table('targets')
