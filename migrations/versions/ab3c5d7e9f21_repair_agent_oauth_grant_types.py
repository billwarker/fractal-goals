"""Repair drifted delegated-agent and note metadata.

Revision ID: ab3c5d7e9f21
Revises: aa2b3c4d5e6f

Some existing databases have the delegated-agent tables and are marked at the
agent-harness migration head, but are missing columns, indexes, or constraints
from that revision. This repair is intentionally conditional so healthy
databases are unchanged.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "ab3c5d7e9f21"
down_revision = "aa2b3c4d5e6f"
branch_labels = None
depends_on = None

JSON_TYPE = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
DEFAULT_GRANT_TYPES = "[\"authorization_code\", \"refresh_token\"]"


def _inspector():
    return sa.inspect(op.get_bind())


def _has_table(table_name):
    return table_name in _inspector().get_table_names()


def _has_column(table_name, column_name):
    if not _has_table(table_name):
        return False
    return any(column["name"] == column_name for column in _inspector().get_columns(table_name))


def _has_index(table_name, index_name):
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _has_constraint(table_name, constraint_name, constraint_type):
    inspector = _inspector()
    if constraint_type == "unique":
        constraints = inspector.get_unique_constraints(table_name)
    elif constraint_type == "foreignkey":
        constraints = inspector.get_foreign_keys(table_name)
    else:
        raise ValueError(f"Unsupported constraint type: {constraint_type}")
    return any(constraint.get("name") == constraint_name for constraint in constraints)


def _add_nullable_column(table_name, column):
    if _has_table(table_name) and not _has_column(table_name, column.name):
        op.add_column(table_name, column)


def _drop_index_if_present(table_name, index_name):
    if _has_table(table_name) and _has_index(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def _rename_legacy_unique_constraint(table_name, legacy_name, current_name, columns):
    if not _has_table(table_name) or _has_constraint(table_name, current_name, "unique"):
        return
    if _has_constraint(table_name, legacy_name, "unique"):
        op.drop_constraint(legacy_name, table_name, type_="unique")
    op.create_unique_constraint(current_name, table_name, columns)


def upgrade():
    _add_nullable_column(
        "agent_oauth_clients",
        sa.Column("grant_types", JSON_TYPE, nullable=True),
    )
    if _has_column("agent_oauth_clients", "grant_types"):
        op.execute(
            sa.text(
                "UPDATE agent_oauth_clients "
                "SET grant_types = CAST(:grant_types AS jsonb) "
                "WHERE grant_types IS NULL"
            ).bindparams(grant_types=DEFAULT_GRANT_TYPES)
        )
        op.alter_column(
            "agent_oauth_clients",
            "grant_types",
            existing_type=JSON_TYPE,
            nullable=False,
        )

    _add_nullable_column(
        "agent_authorization_codes",
        sa.Column("scope", sa.String(500), nullable=True),
    )
    if _has_column("agent_authorization_codes", "scope"):
        op.execute(
            sa.text(
                "UPDATE agent_authorization_codes AS codes "
                "SET scope = COALESCE(grants.scopes, 'goals:read') "
                "FROM agent_grants AS grants "
                "WHERE codes.grant_id = grants.id AND codes.scope IS NULL"
            )
        )
        op.execute(
            sa.text(
                "UPDATE agent_authorization_codes "
                "SET scope = 'goals:read' WHERE scope IS NULL"
            )
        )
        op.alter_column(
            "agent_authorization_codes",
            "scope",
            existing_type=sa.String(500),
            nullable=False,
        )
    _add_nullable_column(
        "agent_authorization_codes",
        sa.Column("code_challenge_method", sa.String(16), nullable=True),
    )
    if _has_column("agent_authorization_codes", "code_challenge_method"):
        op.execute(
            sa.text(
                "UPDATE agent_authorization_codes "
                "SET code_challenge_method = 'S256' "
                "WHERE code_challenge_method IS NULL"
            )
        )
        op.alter_column(
            "agent_authorization_codes",
            "code_challenge_method",
            existing_type=sa.String(16),
            nullable=False,
        )

    if not _has_table("agent_outbox_events"):
        op.create_table(
            "agent_outbox_events",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("event_type", sa.String(120), nullable=False),
            sa.Column("payload", JSON_TYPE, nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("dispatched_at", sa.DateTime(), nullable=True),
        )
    if _has_table("agent_outbox_events") and not _has_index(
        "agent_outbox_events", "ix_agent_outbox_events_pending_created"
    ):
        op.create_index(
            "ix_agent_outbox_events_pending_created",
            "agent_outbox_events",
            ["dispatched_at", "created_at"],
        )

    _add_nullable_column("notes", sa.Column("agent_grant_id", sa.String(), nullable=True))
    _add_nullable_column("notes", sa.Column("agent_run_id", sa.String(), nullable=True))
    if _has_table("notes") and _has_table("agent_grants") and not _has_constraint(
        "notes", "fk_notes_agent_grant_id_agent_grants", "foreignkey"
    ):
        op.create_foreign_key(
            "fk_notes_agent_grant_id_agent_grants",
            "notes",
            "agent_grants",
            ["agent_grant_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if _has_table("notes") and _has_table("agent_runs") and not _has_constraint(
        "notes", "fk_notes_agent_run_id_agent_runs", "foreignkey"
    ):
        op.create_foreign_key(
            "fk_notes_agent_run_id_agent_runs",
            "notes",
            "agent_runs",
            ["agent_run_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if _has_table("notes") and not _has_index("notes", "ix_notes_agent_grant_id"):
        op.create_index("ix_notes_agent_grant_id", "notes", ["agent_grant_id"])
    if _has_table("notes") and not _has_index("notes", "ix_notes_agent_run_id"):
        op.create_index("ix_notes_agent_run_id", "notes", ["agent_run_id"])

    _drop_index_if_present("agent_authorization_codes", "ix_agent_authorization_codes_code_hash")
    _drop_index_if_present("agent_credentials", "ix_agent_credentials_token_hash")
    _drop_index_if_present("agent_oauth_clients", "ix_agent_oauth_clients_client_id")
    _rename_legacy_unique_constraint(
        "agent_authorization_codes",
        "agent_authorization_codes_code_hash_key",
        "uq_agent_authorization_codes_code_hash",
        ["code_hash"],
    )
    _rename_legacy_unique_constraint(
        "agent_credentials",
        "agent_credentials_token_hash_key",
        "uq_agent_credentials_token_hash",
        ["token_hash"],
    )
    _rename_legacy_unique_constraint(
        "agent_oauth_clients",
        "agent_oauth_clients_client_id_key",
        "uq_agent_oauth_clients_client_id",
        ["client_id"],
    )
    _rename_legacy_unique_constraint(
        "agent_runs",
        "agent_runs_proposal_id_key",
        "uq_agent_runs_proposal_id",
        ["proposal_id"],
    )


def downgrade():
    # This is a schema-drift repair. Reversing it would destroy valid metadata
    # on databases where the original migration was already correct.
    pass
