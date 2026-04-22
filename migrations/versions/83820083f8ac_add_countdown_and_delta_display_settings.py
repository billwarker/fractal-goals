"""add countdown and delta display settings

Revision ID: 83820083f8ac
Revises: c4d5e6f7a8b9
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '83820083f8ac'
down_revision: Union[str, Sequence[str], None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('activity_instances', sa.Column('target_duration_seconds', sa.Integer(), nullable=True))
    op.add_column('activity_definitions', sa.Column('delta_display_mode', sa.String(length=16), nullable=True))
    op.create_check_constraint(
        'ck_activity_instances_target_duration_positive',
        'activity_instances',
        'target_duration_seconds IS NULL OR target_duration_seconds > 0',
    )
    op.create_check_constraint(
        'ck_activity_definitions_delta_display_mode',
        'activity_definitions',
        "delta_display_mode IS NULL OR delta_display_mode IN ('percent', 'absolute')",
    )


def downgrade() -> None:
    op.drop_constraint(
        'ck_activity_definitions_delta_display_mode',
        'activity_definitions',
        type_='check',
    )
    op.drop_constraint(
        'ck_activity_instances_target_duration_positive',
        'activity_instances',
        type_='check',
    )
    op.drop_column('activity_definitions', 'delta_display_mode')
    op.drop_column('activity_instances', 'target_duration_seconds')
