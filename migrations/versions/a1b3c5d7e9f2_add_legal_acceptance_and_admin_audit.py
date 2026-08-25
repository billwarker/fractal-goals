"""add legal acceptance, erasure request, and admin audit trail

Adds the durable state behind the Privacy Policy and Terms of Service:

* consent evidence on ``users`` (which document version was accepted, and when)
* ``erasure_requested_at`` so a deletion request can be honoured after the
  published 30-day grace window rather than only anonymizing the identity row
* ``admin_audit_events`` so privileged administrative actions leave a queryable
  trail, which the Privacy Policy relies on when it says account access is
  limited and logged

Revision ID: a1b3c5d7e9f2
Revises: f7b9d2e4a6c8
Create Date: 2026-08-25
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "a1b3c5d7e9f2"
down_revision = "f7b9d2e4a6c8"
branch_labels = None
depends_on = None


def upgrade():
    # Consent evidence lives in columns, not preferences JSON, so it survives a
    # preferences overwrite and stays queryable for a regulator request.
    op.add_column("users", sa.Column("terms_accepted_version", sa.String(length=16), nullable=True))
    op.add_column("users", sa.Column("terms_accepted_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("privacy_accepted_version", sa.String(length=16), nullable=True))
    op.add_column("users", sa.Column("privacy_accepted_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("erasure_requested_at", sa.DateTime(), nullable=True))

    # Partial index: the erasure sweep only ever scans rows with a pending
    # request, which is a small minority of the table.
    op.create_index(
        "ix_users_erasure_requested_at",
        "users",
        ["erasure_requested_at"],
        unique=False,
        postgresql_where=sa.text("erasure_requested_at IS NOT NULL"),
    )

    op.create_table(
        "admin_audit_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("actor_user_id", sa.String(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_user_id", sa.String(), nullable=True),
        # Denormalized so the trail stays readable after a hard delete nulls
        # the target foreign key.
        sa.Column("target_label", sa.String(length=255), nullable=True),
        sa.Column("event_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        # SET NULL, never CASCADE: deleting an account must not erase the
        # evidence that an administrator acted on it.
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_audit_events_actor_user_id", "admin_audit_events", ["actor_user_id"])
    op.create_index("ix_admin_audit_events_action", "admin_audit_events", ["action"])
    op.create_index("ix_admin_audit_events_target_user_id", "admin_audit_events", ["target_user_id"])
    op.create_index("ix_admin_audit_events_created_at_id", "admin_audit_events", ["created_at", "id"])
    op.create_index(
        "ix_admin_audit_events_target_created_at",
        "admin_audit_events",
        ["target_user_id", "created_at"],
    )


def downgrade():
    op.drop_index("ix_admin_audit_events_target_created_at", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_created_at_id", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_target_user_id", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_action", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_actor_user_id", table_name="admin_audit_events")
    op.drop_table("admin_audit_events")

    op.drop_index("ix_users_erasure_requested_at", table_name="users")
    op.drop_column("users", "erasure_requested_at")
    op.drop_column("users", "privacy_accepted_at")
    op.drop_column("users", "privacy_accepted_version")
    op.drop_column("users", "terms_accepted_at")
    op.drop_column("users", "terms_accepted_version")
