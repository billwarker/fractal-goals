"""Make circuit runs the sole timing owner for circuit work.

Revision ID: 9c3e6a1f4d8b
Revises: 8b2d5f9e3c7a
"""

from alembic import op
import sqlalchemy as sa


revision = "9c3e6a1f4d8b"
down_revision = "8b2d5f9e3c7a"
branch_labels = None
depends_on = None


def upgrade():
    # Circuit-owned child results are metric/set containers, never timer owners.
    op.execute(
        sa.text(
            """
            UPDATE activity_instances
            SET time_start = NULL,
                time_stop = NULL,
                duration_seconds = NULL,
                is_paused = false,
                last_paused_at = NULL,
                total_paused_seconds = 0
            WHERE id IN (
                SELECT activity_instance_id
                FROM circuit_run_slots
                WHERE activity_instance_id IS NOT NULL
                UNION
                SELECT activity_instance_id
                FROM circuit_round_members
                WHERE activity_instance_id IS NOT NULL
            )
            """
        )
    )
    op.execute(
        sa.text(
            "DELETE FROM session_work_intervals WHERE circuit_round_member_id IS NOT NULL"
        )
    )

    op.drop_index(
        "ix_session_work_intervals_circuit_round_member_id",
        table_name="session_work_intervals",
    )
    op.drop_constraint(
        "session_work_intervals_circuit_round_member_id_fkey",
        "session_work_intervals",
        type_="foreignkey",
    )
    op.drop_column("session_work_intervals", "circuit_round_member_id")

    op.drop_constraint(
        "ck_circuit_round_members_duration",
        "circuit_round_members",
        type_="check",
    )
    op.drop_constraint(
        "ck_circuit_round_members_status",
        "circuit_round_members",
        type_="check",
    )
    op.drop_column("circuit_round_members", "duration_seconds")
    op.drop_column("circuit_round_members", "status")

    op.drop_constraint("ck_circuit_rounds_status", "circuit_rounds", type_="check")
    op.drop_constraint("ck_circuit_rounds_duration", "circuit_rounds", type_="check")
    op.drop_constraint(
        "ck_circuit_rounds_paused_duration",
        "circuit_rounds",
        type_="check",
    )
    for column_name in (
        "status",
        "time_start",
        "time_stop",
        "duration_seconds",
        "is_paused",
        "last_paused_at",
        "total_paused_seconds",
    ):
        op.drop_column("circuit_rounds", column_name)


def downgrade():
    op.add_column(
        "circuit_rounds",
        sa.Column(
            "total_paused_seconds",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column("circuit_rounds", sa.Column("last_paused_at", sa.DateTime(), nullable=True))
    op.add_column(
        "circuit_rounds",
        sa.Column("is_paused", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("circuit_rounds", sa.Column("duration_seconds", sa.Integer(), nullable=True))
    op.add_column("circuit_rounds", sa.Column("time_stop", sa.DateTime(), nullable=True))
    op.add_column("circuit_rounds", sa.Column("time_start", sa.DateTime(), nullable=True))
    op.add_column(
        "circuit_rounds",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="planned"),
    )
    op.create_check_constraint(
        "ck_circuit_rounds_status",
        "circuit_rounds",
        "status IN ('planned', 'active', 'paused', 'completed', 'unfinished')",
    )
    op.create_check_constraint(
        "ck_circuit_rounds_duration",
        "circuit_rounds",
        "duration_seconds IS NULL OR duration_seconds >= 0",
    )
    op.create_check_constraint(
        "ck_circuit_rounds_paused_duration",
        "circuit_rounds",
        "total_paused_seconds >= 0",
    )

    op.add_column(
        "circuit_round_members",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="planned"),
    )
    op.add_column(
        "circuit_round_members",
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_check_constraint(
        "ck_circuit_round_members_status",
        "circuit_round_members",
        "status IN ('planned', 'active', 'completed', 'skipped', 'unfinished')",
    )
    op.create_check_constraint(
        "ck_circuit_round_members_duration",
        "circuit_round_members",
        "duration_seconds >= 0",
    )

    op.add_column(
        "session_work_intervals",
        sa.Column("circuit_round_member_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "session_work_intervals_circuit_round_member_id_fkey",
        "session_work_intervals",
        "circuit_round_members",
        ["circuit_round_member_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_session_work_intervals_circuit_round_member_id",
        "session_work_intervals",
        ["circuit_round_member_id"],
    )
