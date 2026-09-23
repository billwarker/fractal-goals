"""Add optimistic versions to records used by reviewed agent writes.

Revision ID: 6d4a2c9f1b83
Revises: 5a8c1d3e7f20
"""

from alembic import op
import sqlalchemy as sa


revision = "6d4a2c9f1b83"
down_revision = "5a8c1d3e7f20"
branch_labels = None
depends_on = None


VERSIONED_TABLES = ("goals", "activity_definitions", "programs", "program_blocks", "program_days")


def upgrade():
    for table in VERSIONED_TABLES:
        op.add_column(
            table,
            sa.Column("row_version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        )


def downgrade():
    for table in reversed(VERSIONED_TABLES):
        op.drop_column(table, "row_version")
