"""Which notes belong to a session, activity instance, goal, program or circuit, so they go when it does.

A note is *owned* by what it was written on: a session owns every note written in it (session, activity,
set and circuit notes); an activity instance its activity and set notes; a goal its goal notes, reviews and
completion notes; a program its program and date notes. Notes that only refer to something (an activity
note linked to a goal, a definition note) are not owned and survive it.

One predicate serves both the delete dialogs' counts and the deletes themselves, so what a dialog promises is
what happens. Owned notes are soft-deleted with their parent's exact `deleted_at`, so restoring a parent can
restore exactly its notes. A pin delivered into a deleted session or instance is released to wait again.
"""
from sqlalchemy import or_

from models import Note


def _owned_conditions(*, session_ids=(), instance_ids=(), goal_ids=(), set_ids=(),
                      circuit_run_ids=(), circuit_round_ids=(), program_ids=()):
    conditions = []
    if program_ids:
        conditions.append(Note.program_id.in_(list(program_ids)))
    if session_ids:
        conditions.append(Note.session_id.in_(list(session_ids)))
    if instance_ids:
        conditions.append(Note.activity_instance_id.in_(list(instance_ids)))
    if set_ids:
        conditions.append(Note.activity_set_id.in_(list(set_ids)))
    if goal_ids:
        conditions.append((Note.context_type == 'goal') & Note.goal_id.in_(list(goal_ids)))
    if circuit_run_ids:
        conditions.append((Note.context_type == 'circuit_run') & Note.context_id.in_(list(circuit_run_ids)))
    if circuit_round_ids:
        conditions.append((Note.context_type == 'circuit_round') & Note.context_id.in_(list(circuit_round_ids)))
    return conditions


def owned_notes_query(db_session, root_id, **targets):
    """Live notes of `root_id` owned by any of the targets; None when no target is given."""
    conditions = _owned_conditions(**targets)
    if not conditions:
        return None
    return db_session.query(Note).filter(
        Note.root_id == root_id,
        Note.deleted_at.is_(None),
        or_(*conditions),
    )


def count_owned_notes(db_session, root_id, **targets) -> int:
    query = owned_notes_query(db_session, root_id, **targets)
    return query.order_by(None).count() if query is not None else 0


def soft_delete_owned_notes(db_session, root_id, deleted_at, **targets) -> int:
    """Soft-delete the owned notes, stamped with the parent's `deleted_at`. Returns how many."""
    query = owned_notes_query(db_session, root_id, **targets)
    if query is None:
        return 0
    return query.update({Note.deleted_at: deleted_at}, synchronize_session=False)


def release_pins_into(db_session, root_id, *, session_ids=(), instance_ids=()) -> int:
    """Pins used up by a session or instance that is being deleted wait for the next one again."""
    released = 0
    if session_ids:
        released += db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.carried_into_session_id.in_(list(session_ids)),
        ).update({Note.carried_into_session_id: None}, synchronize_session=False)
    if instance_ids:
        released += db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.carried_into_instance_id.in_(list(instance_ids)),
        ).update({Note.carried_into_instance_id: None}, synchronize_session=False)
    return released
