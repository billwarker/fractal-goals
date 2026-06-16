"""relax beta signup optional fields

Make name/use_case nullable and widen use_case so the public landing form can
collect email plus an optional free-text goal without backfilling placeholder
values. Existing placeholder rows are normalized back to NULL.

Revision ID: 3a1c9e7b2d40
Revises: 9b7c6d5e4f30
Create Date: 2026-06-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3a1c9e7b2d40'
down_revision: Union[str, Sequence[str], None] = '9b7c6d5e4f30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'beta_signup_requests',
        'name',
        existing_type=sa.String(length=120),
        nullable=True,
    )
    op.alter_column(
        'beta_signup_requests',
        'use_case',
        existing_type=sa.String(length=80),
        type_=sa.String(length=280),
        nullable=True,
    )

    # Clear the legacy placeholder values the old service backfilled so exports
    # reflect only data testers actually provided.
    op.execute(
        "UPDATE beta_signup_requests SET name = NULL "
        "WHERE name = 'Beta access request'"
    )
    op.execute(
        "UPDATE beta_signup_requests SET use_case = NULL "
        "WHERE use_case = 'interested beta user'"
    )


def downgrade() -> None:
    # Restore placeholders for any now-NULL rows so the NOT NULL constraints can
    # be reinstated without failing.
    op.execute(
        "UPDATE beta_signup_requests SET name = 'Beta access request' "
        "WHERE name IS NULL"
    )
    op.execute(
        "UPDATE beta_signup_requests SET use_case = 'interested beta user' "
        "WHERE use_case IS NULL"
    )
    op.alter_column(
        'beta_signup_requests',
        'use_case',
        existing_type=sa.String(length=280),
        type_=sa.String(length=80),
        nullable=False,
    )
    op.alter_column(
        'beta_signup_requests',
        'name',
        existing_type=sa.String(length=120),
        nullable=False,
    )
