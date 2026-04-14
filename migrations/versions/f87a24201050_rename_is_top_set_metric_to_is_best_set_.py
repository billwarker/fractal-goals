"""rename_is_top_set_metric_to_is_best_set_metric

Revision ID: f87a24201050
Revises: a2b3c4d5e6f7
Create Date: 2026-04-13 16:57:24.134169

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f87a24201050'
down_revision: Union[str, Sequence[str], None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('metric_definitions', 'is_top_set_metric', new_column_name='is_best_set_metric')


def downgrade() -> None:
    op.alter_column('metric_definitions', 'is_best_set_metric', new_column_name='is_top_set_metric')
