"""add queryable session program linkage

Revision ID: f7b9d2e4a6c8
Revises: e6a8c1d3f5b7
Create Date: 2026-08-24
"""

import sqlalchemy as sa
from alembic import op


revision = "f7b9d2e4a6c8"
down_revision = "e6a8c1d3f5b7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "sessions",
        sa.Column("program_id", sa.String(), nullable=True),
    )
    op.add_column(
        "sessions",
        sa.Column("program_block_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_sessions_program_id_programs",
        "sessions",
        "programs",
        ["program_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sessions_program_block_id_program_blocks",
        "sessions",
        "program_blocks",
        ["program_block_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_sessions_program_id", "sessions", ["program_id"])
    op.create_index("ix_sessions_program_block_id", "sessions", ["program_block_id"])
    op.execute(sa.text(
        "CREATE INDEX ix_sessions_program_effective_start "
        "ON sessions (program_id, COALESCE(session_start, completed_at, created_at))"
    ))

    op.execute(sa.text("""
        UPDATE sessions AS s
        SET program_id = pb.program_id,
            program_block_id = pb.id
        FROM program_days AS pd
        JOIN program_blocks AS pb ON pb.id = pd.block_id
        JOIN programs AS p ON p.id = pb.program_id
        WHERE s.program_day_id = pd.id
          AND p.root_id = s.root_id
    """))

    op.execute(sa.text("""
        UPDATE sessions AS s
        SET program_id = p.id
        FROM programs AS p
        WHERE s.program_id IS NULL
          AND p.id = s.attributes->'program_context'->>'program_id'
          AND p.root_id = s.root_id
    """))

    op.execute(sa.text("""
        UPDATE sessions AS s
        SET program_block_id = pb.id
        FROM program_blocks AS pb
        WHERE s.program_id IS NOT NULL
          AND s.program_block_id IS NULL
          AND pb.id = s.attributes->'program_context'->>'block_id'
          AND pb.program_id = s.program_id
    """))


def downgrade():
    op.drop_index("ix_sessions_program_effective_start", table_name="sessions")
    op.drop_index("ix_sessions_program_block_id", table_name="sessions")
    op.drop_index("ix_sessions_program_id", table_name="sessions")
    op.drop_constraint("fk_sessions_program_block_id_program_blocks", "sessions", type_="foreignkey")
    op.drop_constraint("fk_sessions_program_id_programs", "sessions", type_="foreignkey")
    op.drop_column("sessions", "program_block_id")
    op.drop_column("sessions", "program_id")
