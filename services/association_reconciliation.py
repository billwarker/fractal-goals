"""Shared, history-preserving reconciliation for many-to-many associations."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select

from models import EventLog, utc_now


@dataclass(frozen=True)
class AssociationDelta:
    added_ids: frozenset[str]
    removed_ids: frozenset[str]
    occurred_at: datetime


def append_goal_association_event(
    db_session,
    *,
    root_id,
    goal_id,
    association_kind,
    association_id,
    association_name,
    action,
    occurred_at=None,
):
    """Append an immutable, transaction-bound association history event."""
    event_type = f"{association_kind}.{action}"
    label = (
        "activity group"
        if association_kind == "activity_group"
        else "activity"
    )
    action_label = (
        "Associated" if action == "associated" else "Disassociated"
    )
    name_key = (
        "activity_group_name"
        if association_kind == "activity_group"
        else "activity_name"
    )
    id_key = (
        "activity_group_id"
        if association_kind == "activity_group"
        else "activity_definition_id"
    )
    db_session.add(EventLog(
        root_id=root_id,
        event_type=event_type,
        entity_type=association_kind,
        entity_id=association_id,
        description=f"{action_label} {label}: {association_name}",
        payload={
            "goal_id": goal_id,
            id_key: association_id,
            name_key: association_name,
        },
        source="association_reconciliation",
        timestamp=occurred_at or utc_now(),
    ))


def reconcile_association_rows(
    db_session,
    table,
    scope_column,
    scope_id,
    value_column,
    desired_ids,
):
    """Apply a replacement set and return the exact membership delta."""
    existing_rows = db_session.execute(
        select(value_column, table.c.deleted_at).where(
            scope_column == scope_id
        )
    ).all()
    active_ids = {
        value_id
        for value_id, deleted_at in existing_rows
        if deleted_at is None
    }
    all_existing_ids = {value_id for value_id, _ in existing_rows}
    desired_ids = set(desired_ids)
    occurred_at = utc_now()

    # Retain active rows in the desired set so their historical created_at
    # remains stable. Remove stale or soft-deleted rows before inserting only
    # genuinely new/reactivated associations.
    ids_to_delete = all_existing_ids - (active_ids & desired_ids)
    if ids_to_delete:
        db_session.execute(
            table.delete().where(
                scope_column == scope_id,
                value_column.in_(ids_to_delete),
            )
        )

    ids_to_insert = desired_ids - active_ids
    if ids_to_insert:
        db_session.execute(
            table.insert(),
            [
                {
                    scope_column.name: scope_id,
                    value_column.name: value_id,
                    "created_at": occurred_at,
                }
                for value_id in sorted(ids_to_insert)
            ],
        )

    return AssociationDelta(
        added_ids=frozenset(ids_to_insert),
        removed_ids=frozenset(active_ids - desired_ids),
        occurred_at=occurred_at,
    )
