"""Ordered candidates and scope projection for bulk goal-note reads."""

from sqlalchemy.orm import joinedload
from models import Note, Session


def load_root_goal_notes(db_session, root_id):
    """Ordered candidates for bulk projection through get_goal_notes."""
    return (
        db_session.query(Note)
        .filter(
            Note.root_id == root_id,
            Note.deleted_at.is_(None),
            Note.context_type.in_(("goal", "activity_instance")),
        )
        .options(
            joinedload(Note.session).joinedload(Session.template),
            joinedload(Note.goal),
            joinedload(Note.activity_definition),
            joinedload(Note.activity_instance),
        )
        .order_by(Note.pinned_at.desc().nullslast(), Note.created_at.desc())
        .all()
    )


def filter_goal_notes(
    notes,
    root_id,
    goal_ids,
    activity_ids,
    include_goal_notes,
    include_activity_instance_notes,
):
    goal_ids, activity_ids = set(goal_ids), set(activity_ids)

    def included(note):
        if note.root_id != root_id or note.deleted_at is not None:
            return False
        if note.context_type == "goal":
            return include_goal_notes and note.goal_id in goal_ids
        if (
            note.context_type != "activity_instance"
            or not include_activity_instance_notes
        ):
            return False
        instance = note.activity_instance
        return note.goal_id in goal_ids or (
            instance is not None
            and instance.root_id == root_id
            and instance.deleted_at is None
            and instance.activity_definition_id in activity_ids
        )

    return [note for note in notes if included(note)]


def goal_note_load_options():
    return (
        joinedload(Note.session).joinedload(Session.template),
        joinedload(Note.goal),
        joinedload(Note.activity_definition),
    )
