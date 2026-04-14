"""add progress engine fields

Revision ID: 3f8a1c2d4e5b
Revises: ff40dedbdfeb
Create Date: 2026-04-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '3f8a1c2d4e5b'
down_revision: Union[str, Sequence[str], None] = 'c9d2e1f3a4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add track_progress and progress_aggregation to metric_definitions
    op.add_column('metric_definitions',
        sa.Column('track_progress', sa.Boolean(), server_default=sa.text('true'), nullable=False)
    )
    op.add_column('metric_definitions',
        sa.Column('progress_aggregation', sa.String(length=20), nullable=True)
    )

    # Add default_progress_aggregation to fractal_metric_definitions
    op.add_column('fractal_metric_definitions',
        sa.Column('default_progress_aggregation', sa.String(length=20), nullable=True)
    )

    # Create progress_records table
    op.create_table(
        'progress_records',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('activity_definition_id', sa.String(), nullable=False),
        sa.Column('activity_instance_id', sa.String(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('previous_instance_id', sa.String(), nullable=True),
        sa.Column('is_first_instance', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('has_change', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('has_improvement', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('has_regression', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('comparison_type', sa.String(), nullable=True),
        sa.Column('metric_comparisons', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('derived_summary', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['activity_definition_id'], ['activity_definitions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['activity_instance_id'], ['activity_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['previous_instance_id'], ['activity_instances.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('activity_instance_id'),
    )
    op.create_index('ix_progress_records_root_id', 'progress_records', ['root_id'])
    op.create_index('ix_progress_records_root_activity_created', 'progress_records',
                    ['root_id', 'activity_definition_id', 'created_at'])
    op.create_index('ix_progress_records_session', 'progress_records', ['session_id'])


def downgrade() -> None:
    op.drop_index('ix_progress_records_session', table_name='progress_records')
    op.drop_index('ix_progress_records_root_activity_created', table_name='progress_records')
    op.drop_index('ix_progress_records_root_id', table_name='progress_records')
    op.drop_table('progress_records')
    op.drop_column('fractal_metric_definitions', 'default_progress_aggregation')
    op.drop_column('metric_definitions', 'progress_aggregation')
    op.drop_column('metric_definitions', 'track_progress')
