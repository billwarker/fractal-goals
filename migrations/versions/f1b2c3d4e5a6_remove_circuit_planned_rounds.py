"""remove circuit planned rounds

Revision ID: f1b2c3d4e5a6
Revises: e8a1c4f7b2d9
Create Date: 2026-08-15

Circuit definitions no longer prescribe execution volume. Every run starts
with one round, and users explicitly add subsequent rounds during execution.
"""

import sqlalchemy as sa
from alembic import op


revision = "f1b2c3d4e5a6"
down_revision = "e8a1c4f7b2d9"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint(
        "ck_circuit_definitions_planned_rounds_positive",
        "circuit_definitions",
        type_="check",
    )
    op.drop_constraint(
        "ck_circuit_definitions_planned_rounds_max",
        "circuit_definitions",
        type_="check",
    )
    op.drop_column("circuit_definitions", "planned_rounds")

    op.drop_constraint(
        "ck_circuit_runs_planned_rounds_positive",
        "circuit_runs",
        type_="check",
    )
    op.drop_constraint(
        "ck_circuit_runs_planned_rounds_max",
        "circuit_runs",
        type_="check",
    )
    op.drop_column("circuit_runs", "planned_rounds")


def downgrade():
    op.add_column(
        "circuit_definitions",
        sa.Column(
            "planned_rounds",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )
    op.create_check_constraint(
        "ck_circuit_definitions_planned_rounds_positive",
        "circuit_definitions",
        "planned_rounds > 0",
    )
    op.create_check_constraint(
        "ck_circuit_definitions_planned_rounds_max",
        "circuit_definitions",
        "planned_rounds <= 1000",
    )

    op.add_column(
        "circuit_runs",
        sa.Column("planned_rounds", sa.Integer(), nullable=True),
    )
    op.execute(
        """
        UPDATE circuit_runs
        SET planned_rounds = GREATEST(1, COALESCE(
            (
                SELECT COUNT(*)::integer
                FROM circuit_rounds
                WHERE circuit_rounds.circuit_run_id = circuit_runs.id
            ),
            1
        ))
        """
    )
    op.alter_column("circuit_runs", "planned_rounds", nullable=False)
    op.create_check_constraint(
        "ck_circuit_runs_planned_rounds_positive",
        "circuit_runs",
        "planned_rounds > 0",
    )
    op.create_check_constraint(
        "ck_circuit_runs_planned_rounds_max",
        "circuit_runs",
        "planned_rounds <= 1000",
    )
