"""add persisted circuit and round tag scopes

Revision ID: d5f7a9c2e4b6
Revises: c4e6a8b1d3f5
Create Date: 2026-08-16
"""

import sqlalchemy as sa
from alembic import op


revision = "d5f7a9c2e4b6"
down_revision = "c4e6a8b1d3f5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "circuit_scope_tags",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("root_id", sa.String(), nullable=False),
        sa.Column("circuit_run_id", sa.String(), nullable=False),
        sa.Column("circuit_round_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'",
            name="ck_circuit_scope_tags_color",
        ),
        sa.CheckConstraint("sort_order >= 0", name="ck_circuit_scope_tags_sort_order_nonnegative"),
        sa.ForeignKeyConstraint(["root_id"], ["goals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["circuit_run_id"], ["circuit_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["circuit_round_id"], ["circuit_rounds.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_circuit_scope_tags_root_id", "circuit_scope_tags", ["root_id"])
    op.create_index("ix_circuit_scope_tags_circuit_run_id", "circuit_scope_tags", ["circuit_run_id"])
    op.create_index("ix_circuit_scope_tags_circuit_round_id", "circuit_scope_tags", ["circuit_round_id"])
    op.create_index(
        "uq_circuit_scope_tags_run_name",
        "circuit_scope_tags",
        ["circuit_run_id", sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("circuit_round_id IS NULL"),
    )
    op.create_index(
        "uq_circuit_scope_tags_round_name",
        "circuit_scope_tags",
        ["circuit_round_id", sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("circuit_round_id IS NOT NULL"),
    )


def downgrade():
    op.drop_table("circuit_scope_tags")
