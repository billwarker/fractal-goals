"""goal condition name: an optional display name for an activity threshold

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-10-20

Kind: additive. A nullable column; existing conditions keep no name and display as their goal's name.
Migration A (e1a2c3d4f5b6) now creates the column itself, because it evaluates goals through the
ORM models; this revision adds it only to databases that ran A before it did.
"""

import sqlalchemy as sa
from alembic import op


revision = "e8f9a0b1c2d3"
down_revision = "d7e8f9a0b1c2"
branch_labels = None
depends_on = None


def _has_name(bind):
    return any(column["name"] == "name" for column in sa.inspect(bind).get_columns("goal_completion_conditions"))


def upgrade():
    if not _has_name(op.get_bind()):
        op.add_column("goal_completion_conditions", sa.Column("name", sa.String(length=120), nullable=True))


def downgrade():
    if _has_name(op.get_bind()):
        op.drop_column("goal_completion_conditions", "name")
