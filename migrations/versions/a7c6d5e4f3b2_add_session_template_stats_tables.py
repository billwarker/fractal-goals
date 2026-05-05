"""add_session_template_stats_tables

Revision ID: a7c6d5e4f3b2
Revises: f4c9a7b2d1e0
Create Date: 2026-05-05 11:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7c6d5e4f3b2'
down_revision: Union[str, Sequence[str], None] = 'f4c9a7b2d1e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'session_template_stats',
        sa.Column('template_id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('session_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('average_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('median_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('min_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('max_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('calculation_version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['template_id'], ['session_templates.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('template_id'),
    )
    op.create_index('ix_session_template_stats_root_last_used', 'session_template_stats', ['root_id', 'last_used_at'])

    op.create_table(
        'template_section_stats',
        sa.Column('template_id', sa.String(), nullable=False),
        sa.Column('section_key', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('sample_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('average_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('median_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('min_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('max_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('calculation_version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['template_id'], ['session_templates.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('template_id', 'section_key'),
    )
    op.create_index('ix_template_section_stats_root_template', 'template_section_stats', ['root_id', 'template_id'])

    op.create_table(
        'activity_duration_stats',
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('activity_definition_id', sa.String(), nullable=False),
        sa.Column('sample_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('average_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('median_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('min_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('max_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('last_observed_at', sa.DateTime(), nullable=True),
        sa.Column('calculation_version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['activity_definition_id'], ['activity_definitions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('root_id', 'activity_definition_id'),
    )
    op.create_index('ix_activity_duration_stats_root_updated', 'activity_duration_stats', ['root_id', 'updated_at'])


def downgrade() -> None:
    op.drop_index('ix_activity_duration_stats_root_updated', table_name='activity_duration_stats')
    op.drop_table('activity_duration_stats')
    op.drop_index('ix_template_section_stats_root_template', table_name='template_section_stats')
    op.drop_table('template_section_stats')
    op.drop_index('ix_session_template_stats_root_last_used', table_name='session_template_stats')
    op.drop_table('session_template_stats')
