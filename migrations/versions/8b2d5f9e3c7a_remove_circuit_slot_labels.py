"""Remove unused circuit slot labels.

Revision ID: 8b2d5f9e3c7a
Revises: 7a1c4e8d2b6f
Create Date: 2026-07-18
"""

from alembic import op
import sqlalchemy as sa


revision = "8b2d5f9e3c7a"
down_revision = "7a1c4e8d2b6f"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("circuit_run_slots", "display_label")
    op.drop_column("circuit_slots", "display_label")


def downgrade():
    op.add_column("circuit_slots", sa.Column("display_label", sa.String(), nullable=True))
    op.add_column("circuit_run_slots", sa.Column("display_label", sa.String(), nullable=True))
