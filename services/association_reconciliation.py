"""Shared, history-preserving reconciliation for many-to-many associations."""

from sqlalchemy import select


def reconcile_association_rows(
    db_session,
    table,
    scope_column,
    scope_id,
    value_column,
    desired_ids,
):
    """Apply a replacement set while retaining active rows that already exist."""
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
                {scope_column.name: scope_id, value_column.name: value_id}
                for value_id in sorted(ids_to_insert)
            ],
        )
