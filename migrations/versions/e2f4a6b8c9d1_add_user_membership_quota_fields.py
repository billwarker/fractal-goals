"""add_user_membership_quota_fields

Revision ID: e2f4a6b8c9d1
Revises: c8d3f2a1b6e4
Create Date: 2026-05-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from models.base import JSON_TYPE


revision: str = "e2f4a6b8c9d1"
down_revision: Union[str, Sequence[str], None] = "c8d3f2a1b6e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("membership_tier", sa.String(length=32), nullable=False, server_default="free"))
        batch_op.add_column(sa.Column("quota_overrides", JSON_TYPE, nullable=True))
        batch_op.add_column(sa.Column("stripe_customer_id", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("subscription_status", sa.String(length=32), nullable=False, server_default="none"))
        batch_op.add_column(sa.Column("paid_amount_cad_cents", sa.Integer(), nullable=True))

    # Existing accounts predate paid tiers and should keep unlimited legacy access.
    op.execute("UPDATE users SET membership_tier = 'legacy' WHERE membership_tier = 'free'")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("paid_amount_cad_cents")
        batch_op.drop_column("subscription_status")
        batch_op.drop_column("stripe_subscription_id")
        batch_op.drop_column("stripe_customer_id")
        batch_op.drop_column("quota_overrides")
        batch_op.drop_column("membership_tier")
