"""drop_note_image_data

Revision ID: c8d3f2a1b6e4
Revises: a7c6d5e4f3b2
Create Date: 2026-05-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c8d3f2a1b6e4"
down_revision: Union[str, Sequence[str], None] = "a7c6d5e4f3b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("notes") as batch_op:
        batch_op.drop_column("image_data")


def downgrade() -> None:
    with op.batch_alter_table("notes") as batch_op:
        batch_op.add_column(sa.Column("image_data", sa.Text(), nullable=True))
