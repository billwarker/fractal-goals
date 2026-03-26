"""add_activity_modes

Revision ID: 7f7f42a2b1c3
Revises: 94a9feab5041
Create Date: 2026-03-26 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f7f42a2b1c3'
down_revision: Union[str, Sequence[str], None] = '94a9feab5041'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'activity_modes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('color', sa.String(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_activity_modes_root_id'), 'activity_modes', ['root_id'], unique=False)

    op.create_table(
        'activity_instance_modes',
        sa.Column(
            'activity_instance_id',
            sa.String(),
            sa.ForeignKey('activity_instances.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'activity_mode_id',
            sa.String(),
            sa.ForeignKey('activity_modes.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('activity_instance_id', 'activity_mode_id'),
    )
    op.create_index(
        op.f('ix_activity_instance_modes_activity_instance_id'),
        'activity_instance_modes',
        ['activity_instance_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_activity_instance_modes_activity_mode_id'),
        'activity_instance_modes',
        ['activity_mode_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_activity_instance_modes_activity_mode_id'), table_name='activity_instance_modes')
    op.drop_index(op.f('ix_activity_instance_modes_activity_instance_id'), table_name='activity_instance_modes')
    op.drop_table('activity_instance_modes')
    op.drop_index(op.f('ix_activity_modes_root_id'), table_name='activity_modes')
    op.drop_table('activity_modes')
