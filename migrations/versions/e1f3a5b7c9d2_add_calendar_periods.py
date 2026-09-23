"""Add fractal-wide calendar periods (time off).

Revision ID: e1f3a5b7c9d2
Revises: d8e0f2a4b6c9
"""
from alembic import op
import sqlalchemy as sa


revision = "e1f3a5b7c9d2"
down_revision = "d8e0f2a4b6c9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "calendar_periods",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("root_id", sa.String(), nullable=False),
        sa.Column("owner_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("protects_streaks", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "kind IN ('vacation', 'travel', 'illness', 'other')", name="ck_calendar_period_kind",
        ),
        sa.CheckConstraint("end_date >= start_date", name="ck_calendar_period_date_order"),
        sa.ForeignKeyConstraint(["root_id"], ["goals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_calendar_periods_root_dates", "calendar_periods", ["root_id", "start_date", "end_date"],
    )
    op.create_index("ix_calendar_periods_owner_id", "calendar_periods", ["owner_id"])


def downgrade():
    op.drop_index("ix_calendar_periods_owner_id", table_name="calendar_periods")
    op.drop_index("ix_calendar_periods_root_dates", table_name="calendar_periods")
    op.drop_table("calendar_periods")
