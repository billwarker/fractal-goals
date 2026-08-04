"""Add activity-group placement to circuit definitions.

Revision ID: 7a1c4e8d2b6f
Revises: 5c7d9e1f3a2b
Create Date: 2026-07-18
"""

from alembic import op
import sqlalchemy as sa


revision = "7a1c4e8d2b6f"
down_revision = "5c7d9e1f3a2b"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "circuit_definitions",
        sa.Column(
            "group_id",
            sa.String(),
            sa.ForeignKey("activity_groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_circuit_definitions_group_id", "circuit_definitions", ["group_id"])


def downgrade():
    op.drop_index("ix_circuit_definitions_group_id", table_name="circuit_definitions")
    op.drop_column("circuit_definitions", "group_id")
