"""Snapshot planned circuit rounds and values on circuit runs.

A circuit item in a session template or dated program session plan may plan rounds and
per-round member values. Session creation starts the run with that many rounds and copies
the plan here, so later template or plan edits never rewrite what a session was meant to hit.

Revision ID: e5a7c9b1d3f4
Revises: d3f5a7c9e1b2
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "e5a7c9b1d3f4"
down_revision = "d3f5a7c9e1b2"
branch_labels = None
depends_on = None


def _json_type():
    if op.get_bind().dialect.name == "postgresql":
        return postgresql.JSONB()
    return sa.JSON()


def upgrade():
    op.add_column("circuit_runs", sa.Column("prescription", _json_type(), nullable=True))


def downgrade():
    op.drop_column("circuit_runs", "prescription")
