"""Add configurable fractal metric precision.

Revision ID: c3d5e7f9a1b2
Revises: b2c4d6e8f0a1
"""
from alembic import op
import sqlalchemy as sa


revision = "c3d5e7f9a1b2"
down_revision = "b2c4d6e8f0a1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "fractal_metric_definitions",
        sa.Column("precision", sa.Integer(), nullable=False, server_default="2"),
    )
    op.execute(
        "UPDATE fractal_metric_definitions SET precision = 0 "
        "WHERE input_type IN ('integer', 'duration')"
    )
    op.create_check_constraint(
        "ck_fractal_metric_precision",
        "fractal_metric_definitions",
        "precision >= 0 AND precision <= 6",
    )


def downgrade():
    op.drop_constraint(
        "ck_fractal_metric_precision",
        "fractal_metric_definitions",
        type_="check",
    )
    op.drop_column("fractal_metric_definitions", "precision")
