"""Pin a note to the next time ("carry forward").

An activity note (one with `activity_definition_id`) can be pinned to the next instance of its
activity; a session note to the next session. `carry_forward_at` is set and the note shows on open
sessions other than its own: on that activity's cards, or in the session's notes. The pin is used up,
in the same transaction, by the first such instance to complete (`carried_into_instance_id`;
completing a session counts for all of its instances, timed or not), or for a session note by the next
session to complete (`carried_into_session_id`). Every completion path sets `ActivityInstance.completed`
or `Session.completed` through the ORM, so one flush hook covers timers, session completion, circuits
and synced offline writes alike. Quick sessions never show notes, so they never use a pin.
"""
from datetime import datetime, timezone

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session as OrmSession

from models import ActivityInstance, Note, Session
from services.session_runtime import is_quick_session


class CarryForwardError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def set_carry_forward(note, on: bool) -> None:
    if note.carried_into_instance_id or note.carried_into_session_id:
        raise CarryForwardError('This note was already carried to its next time', 409)
    if on and not (note.activity_definition_id or note.context_type == 'session'):
        raise CarryForwardError('Only activity and session notes can be pinned to next time')
    if on and note.carry_forward_at is None:
        note.carry_forward_at = datetime.now(timezone.utc)
    elif not on:
        note.carry_forward_at = None


def _pending_query(db_session, root_id):
    return db_session.query(Note).filter(
        Note.root_id == root_id,
        Note.carry_forward_at.isnot(None),
        Note.carried_into_instance_id.is_(None),
        Note.carried_into_session_id.is_(None),
        Note.deleted_at.is_(None),
    )


def carried_notes_for_session(db_session, root_id, session_id) -> tuple[list[Note], list[Note]]:
    """(pending, delivered): notes pinned to this session or its activities, and those it used.
    Pending pins show only while the session is open; a finished session shows what it used."""
    session = db_session.query(Session).filter(Session.id == session_id, Session.root_id == root_id).first()
    if session is None:
        return [], []
    instances = db_session.query(ActivityInstance.id, ActivityInstance.activity_definition_id).filter(
        ActivityInstance.session_id == session_id,
        ActivityInstance.root_id == root_id,
        ActivityInstance.deleted_at.is_(None),
    ).all()
    pending = []
    if not session.completed and not is_quick_session(session):
        definition_ids = {row.activity_definition_id for row in instances}
        pending = _pending_query(db_session, root_id).filter(
            Note.session_id.is_distinct_from(session_id),
            (Note.context_type == 'session') | Note.activity_definition_id.in_(definition_ids),
        ).order_by(Note.created_at.desc()).all()
    delivered = db_session.query(Note).filter(
        Note.root_id == root_id,
        (Note.carried_into_session_id == session_id)
        | Note.carried_into_instance_id.in_([row.id for row in instances]),
        Note.deleted_at.is_(None),
    ).order_by(Note.created_at.desc()).all()
    return pending, delivered


def _became_completed(db_session, obj) -> bool:
    if not bool(obj.completed) or obj.deleted_at is not None:
        return False
    if obj in db_session.new:
        return True
    history = inspect(obj).attrs.completed.history
    return history.has_changes() and not any(history.deleted)


def _newly_completed(db_session) -> tuple[list[ActivityInstance], list[Session]]:
    objects = list(db_session.new) + list(db_session.dirty)
    found = [
        obj for obj in objects
        if isinstance(obj, ActivityInstance) and _became_completed(db_session, obj)
    ]
    sessions = [
        obj for obj in objects
        if isinstance(obj, Session) and obj.id is not None and _became_completed(db_session, obj)
    ]
    if sessions:
        seen = {instance.id for instance in found}
        found += [
            instance for instance in db_session.query(ActivityInstance).filter(
                ActivityInstance.session_id.in_([session.id for session in sessions]),
                ActivityInstance.deleted_at.is_(None),
            ).order_by(ActivityInstance.created_at, ActivityInstance.id)
            if instance.id not in seen
        ]
    return found, sessions


def consume_for_instances(db_session, instances) -> None:
    """Give each pending activity pin to the first completed instance of its activity outside its own session."""
    by_root: dict[str, list[ActivityInstance]] = {}
    for instance in instances:
        by_root.setdefault(instance.root_id, []).append(instance)
    for root_id, root_instances in by_root.items():
        session_ids = {instance.session_id for instance in root_instances if instance.session_id is not None}
        sessions = {
            row.id: row for row in db_session.query(Session).filter(Session.id.in_(session_ids)).all()
        } if session_ids else {}
        eligible = [
            instance for instance in root_instances
            if instance.session_id in sessions and not is_quick_session(sessions[instance.session_id])
        ]
        if not eligible:
            continue
        pending = _pending_query(db_session, root_id).filter(
            Note.activity_definition_id.in_({instance.activity_definition_id for instance in eligible}),
        ).all()
        for note in pending:
            target = next((
                instance for instance in eligible
                if instance.activity_definition_id == note.activity_definition_id
                and instance.session_id != note.session_id
            ), None)
            if target is not None:
                note.carried_into_instance_id = target.id


def consume_for_sessions(db_session, sessions) -> None:
    """Give each pending session-note pin to the first other non-quick session that completes."""
    for session in sessions:
        if is_quick_session(session):
            continue
        for note in _pending_query(db_session, session.root_id).filter(
            Note.context_type == 'session',
            Note.session_id.is_distinct_from(session.id),
        ):
            note.carried_into_session_id = session.id


@event.listens_for(OrmSession, 'before_flush')
def _consume_on_completion(db_session, _flush_context, _instances):
    with db_session.no_autoflush:
        instances, sessions = _newly_completed(db_session)
        if instances:
            consume_for_instances(db_session, instances)
        if sessions:
            consume_for_sessions(db_session, sessions)
