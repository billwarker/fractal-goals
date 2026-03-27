"""add fractal_metric_definitions table and link to metric_definitions

Revision ID: a1b2c3d4e5f6
Revises: ff40dedbdfeb
Create Date: 2026-03-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '0c8e48a1f2d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create fractal_metric_definitions table
    op.create_table(
        'fractal_metric_definitions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('unit', sa.String(), nullable=False),
        sa.Column('is_multiplicative', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_additive', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('input_type', sa.String(), nullable=False, server_default='number'),
        sa.Column('default_value', sa.Float(), nullable=True),
        sa.Column('higher_is_better', sa.Boolean(), nullable=True),
        sa.Column('predefined_values', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('min_value', sa.Float(), nullable=True),
        sa.Column('max_value', sa.Float(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_fractal_metric_definitions_root_id', 'fractal_metric_definitions', ['root_id'])

    # 2. Add fractal_metric_id FK column to metric_definitions (nullable for backfill)
    op.add_column(
        'metric_definitions',
        sa.Column('fractal_metric_id', sa.String(), nullable=True)
    )

    # 3. Backfill: for each unique (root_id, name, unit) combo in metric_definitions,
    #    create one fractal_metric_definitions row, then link all matching metric_definitions rows.
    op.execute("""
        INSERT INTO fractal_metric_definitions (id, root_id, name, unit, is_multiplicative, is_additive, input_type, sort_order, is_active, created_at, updated_at)
        SELECT
            gen_random_uuid()::text,
            root_id,
            name,
            unit,
            BOOL_OR(is_multiplicative),
            true,
            'number',
            0,
            true,
            MIN(created_at),
            NOW()
        FROM metric_definitions
        WHERE deleted_at IS NULL
        GROUP BY root_id, name, unit
    """)

    op.execute("""
        UPDATE metric_definitions md
        SET fractal_metric_id = fmd.id
        FROM fractal_metric_definitions fmd
        WHERE fmd.root_id = md.root_id
          AND fmd.name = md.name
          AND fmd.unit = md.unit
          AND md.fractal_metric_id IS NULL
    """)

    # 4. Add FK constraint now that backfill is complete
    op.create_foreign_key(
        'fk_metric_definitions_fractal_metric_id',
        'metric_definitions',
        'fractal_metric_definitions',
        ['fractal_metric_id'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_metric_definitions_fractal_metric_id', 'metric_definitions', type_='foreignkey')
    op.drop_column('metric_definitions', 'fractal_metric_id')
    op.drop_index('ix_fractal_metric_definitions_root_id', table_name='fractal_metric_definitions')
    op.drop_table('fractal_metric_definitions')
