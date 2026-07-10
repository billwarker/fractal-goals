"""Backfill self-referential root ids on fractal roots.

Revision ID: 7f8a9b0c1d2e
Revises: 6e7f8a9b0c1d
Create Date: 2026-07-10 08:45:00.000000

"""
from alembic import op


revision = '7f8a9b0c1d2e'
down_revision = '6e7f8a9b0c1d'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "UPDATE goals SET root_id = id "
        "WHERE parent_id IS NULL AND root_id IS NULL"
    )


def downgrade():
    # This repairs application data to the invariant expected by root-scoped
    # queries. Reintroducing invalid rows on downgrade would be destructive.
    pass
