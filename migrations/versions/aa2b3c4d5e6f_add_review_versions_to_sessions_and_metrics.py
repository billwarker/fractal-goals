"""Add optimistic versions to reviewed session and metric mutations."""

from alembic import op
import sqlalchemy as sa


revision = "aa2b3c4d5e6f"
down_revision = "9f2b7c4d1a60"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("sessions", "fractal_metric_definitions"):
        op.add_column(
            table,
            sa.Column("row_version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        )


def downgrade():
    for table in ("fractal_metric_definitions", "sessions"):
        op.drop_column(table, "row_version")
