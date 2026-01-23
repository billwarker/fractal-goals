"""Migrate to native JSON and JSONB

Revision ID: d09aa8e14566
Revises: 1c23207b804b
Create Date: 2026-01-22 22:33:11.669042

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd09aa8e14566'
down_revision: Union[str, Sequence[str], None] = '1c23207b804b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

JSONB_TYPE = sa.JSON().with_variant(postgresql.JSONB(), 'postgresql')

def upgrade() -> None:
    # 1. Activity Instances
    op.alter_column('activity_instances', 'data',
               existing_type=sa.VARCHAR(),
               type_=JSONB_TYPE,
               postgresql_using='data::jsonb')
    
    # 2. Goals
    op.alter_column('goals', 'targets',
               existing_type=sa.TEXT(),
               type_=JSONB_TYPE,
               postgresql_using='targets::jsonb')
    
    # 3. Programs
    op.alter_column('programs', 'goal_ids',
               existing_type=sa.TEXT(),
               type_=JSONB_TYPE,
               postgresql_using='goal_ids::jsonb')
    op.alter_column('programs', 'weekly_schedule',
               existing_type=sa.TEXT(),
               type_=JSONB_TYPE,
               postgresql_using='weekly_schedule::jsonb')
    
    # 4. Session Templates
    op.alter_column('session_templates', 'template_data',
               existing_type=sa.VARCHAR(),
               type_=JSONB_TYPE,
               postgresql_using='template_data::jsonb')
    
    # 5. Sessions
    op.alter_column('sessions', 'attributes',
               existing_type=sa.TEXT(),
               type_=JSONB_TYPE,
               postgresql_using='attributes::jsonb')
    
    # 6. Visualization Annotations
    op.alter_column('visualization_annotations', 'visualization_context',
               existing_type=sa.TEXT(),
               type_=JSONB_TYPE,
               postgresql_using='visualization_context::jsonb')
    op.alter_column('visualization_annotations', 'selected_points',
               existing_type=sa.TEXT(),
               type_=JSONB_TYPE,
               postgresql_using='selected_points::jsonb')
    op.alter_column('visualization_annotations', 'selection_bounds',
               existing_type=sa.TEXT(),
               type_=JSONB_TYPE,
               postgresql_using='selection_bounds::jsonb')


def downgrade() -> None:
    # Reverse conversions (casting JSONB back to TEXT/VARCHAR)
    op.alter_column('visualization_annotations', 'selection_bounds',
               existing_type=JSONB_TYPE,
               type_=sa.TEXT(),
               postgresql_using='selection_bounds::text')
    op.alter_column('visualization_annotations', 'selected_points',
               existing_type=JSONB_TYPE,
               type_=sa.TEXT(),
               postgresql_using='selected_points::text')
    op.alter_column('visualization_annotations', 'visualization_context',
               existing_type=JSONB_TYPE,
               type_=sa.TEXT(),
               postgresql_using='visualization_context::text')
    op.alter_column('sessions', 'attributes',
               existing_type=JSONB_TYPE,
               type_=sa.TEXT(),
               postgresql_using='attributes::text')
    op.alter_column('session_templates', 'template_data',
               existing_type=JSONB_TYPE,
               type_=sa.VARCHAR(),
               postgresql_using='template_data::text')
    op.alter_column('programs', 'weekly_schedule',
               existing_type=JSONB_TYPE,
               type_=sa.TEXT(),
               postgresql_using='weekly_schedule::text')
    op.alter_column('programs', 'goal_ids',
               existing_type=JSONB_TYPE,
               type_=sa.TEXT(),
               postgresql_using='goal_ids::text')
    op.alter_column('goals', 'targets',
               existing_type=JSONB_TYPE,
               type_=sa.TEXT(),
               postgresql_using='targets::text')
    op.alter_column('activity_instances', 'data',
               existing_type=JSONB_TYPE,
               type_=sa.VARCHAR(),
               postgresql_using='data::text')
