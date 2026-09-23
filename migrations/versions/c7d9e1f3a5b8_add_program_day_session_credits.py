"""Add occurrence-level program day session credits.

Revision ID: c7d9e1f3a5b8
Revises: ab3c5d7e9f21
"""
from alembic import op
import sqlalchemy as sa


revision = "c7d9e1f3a5b8"
down_revision = "ab3c5d7e9f21"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "program_day_session_credits",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("program_id", sa.String(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("disposition", sa.String(), nullable=False),
        sa.Column("template_id", sa.String(), nullable=True),
        sa.Column("set_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "disposition IN ('credit', 'exclude')",
            name="ck_program_day_session_credit_disposition",
        ),
        sa.CheckConstraint(
            "(disposition = 'credit' AND template_id IS NOT NULL)"
            " OR (disposition = 'exclude' AND template_id IS NULL)",
            name="ck_program_day_session_credit_template",
        ),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["session_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["set_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "program_id", "date", "session_id",
            name="uq_program_day_session_credit_program_date_session",
        ),
    )
    op.create_index(
        "ix_program_day_session_credits_program_id",
        "program_day_session_credits",
        ["program_id"],
    )
    op.create_index(
        "ix_program_day_session_credits_session_id",
        "program_day_session_credits",
        ["session_id"],
    )
    op.create_index(
        "ix_program_day_session_credits_set_by_user_id",
        "program_day_session_credits",
        ["set_by_user_id"],
    )


def downgrade():
    op.drop_index(
        "ix_program_day_session_credits_set_by_user_id",
        table_name="program_day_session_credits",
    )
    op.drop_index(
        "ix_program_day_session_credits_session_id",
        table_name="program_day_session_credits",
    )
    op.drop_index(
        "ix_program_day_session_credits_program_id",
        table_name="program_day_session_credits",
    )
    op.drop_table("program_day_session_credits")
