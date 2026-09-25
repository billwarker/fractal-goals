"""Add users.session_version for revocable auth sessions.

Every issued session token carries the user's session version; incrementing it
revokes all outstanding tokens (password change/reset, admin reset, sign out
everywhere).

Revision ID: a4c6e8f0b2d5
Revises: e1f3a5b7c9d2
"""
from alembic import op
import sqlalchemy as sa


revision = "a4c6e8f0b2d5"
down_revision = "e1f3a5b7c9d2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("session_version", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )


def downgrade():
    op.drop_column("users", "session_version")
