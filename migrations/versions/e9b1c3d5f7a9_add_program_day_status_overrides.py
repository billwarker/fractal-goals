"""Add occurrence-level program day status overrides.

Revision ID: e9b1c3d5f7a9
Revises: d4e6f8a1b3c5
"""
from alembic import op
import sqlalchemy as sa


revision = "e9b1c3d5f7a9"
down_revision = "d4e6f8a1b3c5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "program_day_status_overrides",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("program_id", sa.String(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("set_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('complete', 'rest')",
            name="ck_program_day_status_override_status",
        ),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["set_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "program_id", "date",
            name="uq_program_day_status_override_program_date",
        ),
    )
    op.create_index(
        "ix_program_day_status_overrides_program_id",
        "program_day_status_overrides",
        ["program_id"],
    )
    op.create_index(
        "ix_program_day_status_overrides_date",
        "program_day_status_overrides",
        ["date"],
    )
    op.create_index(
        "ix_program_day_status_overrides_set_by_user_id",
        "program_day_status_overrides",
        ["set_by_user_id"],
    )


def downgrade():
    op.drop_index(
        "ix_program_day_status_overrides_set_by_user_id",
        table_name="program_day_status_overrides",
    )
    op.drop_index(
        "ix_program_day_status_overrides_date",
        table_name="program_day_status_overrides",
    )
    op.drop_index(
        "ix_program_day_status_overrides_program_id",
        table_name="program_day_status_overrides",
    )
    op.drop_table("program_day_status_overrides")
