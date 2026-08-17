"""preserve pre-existing assignments across circuit scope removal

Revision ID: e6a8c1d3f5b7
Revises: d5f7a9c2e4b6
Create Date: 2026-08-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "e6a8c1d3f5b7"
down_revision = "d5f7a9c2e4b6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "circuit_scope_tags",
        sa.Column(
            "preserved_target_keys",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade():
    op.drop_column("circuit_scope_tags", "preserved_target_keys")
