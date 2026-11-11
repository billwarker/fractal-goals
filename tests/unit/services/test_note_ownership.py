import uuid
from datetime import datetime, timezone

from models import Note
from services.note_ownership import (
    count_owned_notes,
    owned_notes_query,
    release_pins_into,
    soft_delete_owned_notes,
)


def _note(db_session, root_id, context_type, context_id, **fields):
    row = Note(id=str(uuid.uuid4()), root_id=root_id, context_type=context_type, context_id=context_id,
               content=fields.pop('content', 'note'), **fields)
    db_session.add(row)
    return row


def test_no_target_owns_nothing(db_session, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    assert owned_notes_query(db_session, root_id) is None
    assert count_owned_notes(db_session, root_id) == 0
    assert soft_delete_owned_notes(db_session, root_id, datetime.now(timezone.utc)) == 0


def test_goals_own_only_their_goal_notes(db_session, sample_goal_hierarchy, sample_activity_definition):
    root_id = sample_goal_hierarchy['ultimate'].id
    goal = sample_goal_hierarchy['short_term']
    owned = _note(db_session, root_id, 'goal', goal.id, goal_id=goal.id)
    linked = _note(db_session, root_id, 'activity_definition', sample_activity_definition.id, goal_id=goal.id,
                   activity_definition_id=sample_activity_definition.id)
    already_gone = _note(db_session, root_id, 'goal', goal.id, goal_id=goal.id, deleted_at=datetime(2026, 1, 1))
    db_session.commit()

    stamp = datetime(2026, 11, 10, 12, 0)
    assert count_owned_notes(db_session, root_id, goal_ids=[goal.id]) == 1
    assert soft_delete_owned_notes(db_session, root_id, stamp, goal_ids=[goal.id]) == 1
    db_session.commit()
    db_session.expire_all()

    assert db_session.get(Note, owned.id).deleted_at == stamp
    assert db_session.get(Note, linked.id).deleted_at is None
    assert db_session.get(Note, already_gone.id).deleted_at == datetime(2026, 1, 1)  # Its own stamp is kept.


def test_notes_never_cross_fractals(db_session, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    goal = sample_goal_hierarchy['short_term']
    _note(db_session, root_id, 'goal', goal.id, goal_id=goal.id)
    db_session.commit()
    assert count_owned_notes(db_session, 'another-root', goal_ids=[goal.id]) == 0


def test_released_pins_wait_again(db_session, sample_goal_hierarchy, sample_practice_session, sample_activity_instance):
    root_id = sample_goal_hierarchy['ultimate'].id
    pinned_at = datetime.now(timezone.utc)
    into_session = _note(db_session, root_id, 'session', sample_practice_session.id, carry_forward_at=pinned_at,
                         carried_into_session_id=sample_practice_session.id)
    into_instance = _note(db_session, root_id, 'session', sample_practice_session.id, carry_forward_at=pinned_at,
                          carried_into_instance_id=sample_activity_instance.id)
    db_session.commit()

    released = release_pins_into(db_session, root_id, session_ids=[sample_practice_session.id],
                                 instance_ids=[sample_activity_instance.id])
    db_session.commit()
    db_session.expire_all()

    assert released == 2
    for note in (into_session, into_instance):
        row = db_session.get(Note, note.id)
        assert row.carry_forward_at is not None
        assert row.carried_into_session_id is None and row.carried_into_instance_id is None
