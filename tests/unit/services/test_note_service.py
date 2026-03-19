import uuid

from models import Goal, GoalLevel, Note
from services.events import Events
from services.note_service import NoteService


def test_create_note_emits_note_created_event(db_session, sample_ultimate_goal, test_user, monkeypatch):
    emitted = []
    monkeypatch.setattr('services.note_service.event_bus.emit', lambda event: emitted.append(event))

    service = NoteService(db_session)
    payload, error, status = service.create_note(sample_ultimate_goal.id, test_user.id, {
        'content': 'A useful note',
        'context_type': 'session',
        'context_id': 'ctx-1',
    })

    assert error is None
    assert status == 201
    assert payload['content'] == 'A useful note'
    assert [event.name for event in emitted] == [Events.NOTE_CREATED]
    assert emitted[0].data['note_content'] == 'A useful note'


def test_update_note_emits_note_updated_event(db_session, sample_ultimate_goal, test_user, monkeypatch):
    note = Note(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        context_type='session',
        context_id='ctx-1',
        content='Before',
    )
    db_session.add(note)
    db_session.commit()

    emitted = []
    monkeypatch.setattr('services.note_service.event_bus.emit', lambda event: emitted.append(event))

    service = NoteService(db_session)
    payload, error, status = service.update_note(sample_ultimate_goal.id, note.id, test_user.id, {
        'content': 'After',
    })

    assert error is None
    assert status == 200
    assert payload['content'] == 'After'
    assert [event.name for event in emitted] == [Events.NOTE_UPDATED]
    assert emitted[0].data['updated_fields'] == ['content']


def test_delete_note_emits_note_deleted_event(db_session, sample_ultimate_goal, test_user, monkeypatch):
    note = Note(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        context_type='session',
        context_id='ctx-1',
        content='Remove me',
    )
    db_session.add(note)
    db_session.commit()

    emitted = []
    monkeypatch.setattr('services.note_service.event_bus.emit', lambda event: emitted.append(event))

    service = NoteService(db_session)
    payload, error, status = service.delete_note(sample_ultimate_goal.id, note.id, test_user.id)

    assert error is None
    assert status == 200
    assert payload == {'success': True}
    assert [event.name for event in emitted] == [Events.NOTE_DELETED]
    assert emitted[0].data['note_content'] == 'Remove me'


def test_create_nano_goal_note_emits_note_and_goal_events(
    db_session,
    sample_goal_hierarchy,
    sample_activity_instance,
    test_user,
    monkeypatch,
):
    root = sample_goal_hierarchy['ultimate']
    emitted = []
    monkeypatch.setattr('services.note_service.event_bus.emit', lambda event: emitted.append(event))

    def fake_create_fractal_goal_record(self, root_id, current_user_id, data):
        nano_level = db_session.query(GoalLevel).filter_by(name='Nano Goal').first()
        if nano_level is None:
            nano_level = GoalLevel(name='Nano Goal', rank=6)
            db_session.add(nano_level)
            db_session.flush()

        goal = Goal(
            id=str(uuid.uuid4()),
            name=data['name'],
            parent_id=data['parent_id'],
            root_id=root_id,
            owner_id=current_user_id,
            level_id=nano_level.id,
        )
        db_session.add(goal)
        db_session.commit()
        db_session.refresh(goal)
        return goal, None, 201

    monkeypatch.setattr(
        'services.note_service.GoalService.create_fractal_goal_record',
        fake_create_fractal_goal_record,
    )

    service = NoteService(db_session)
    payload, error, status = service.create_nano_goal_note(root.id, test_user.id, {
        'name': 'Nano note goal',
        'parent_id': sample_goal_hierarchy['short_term'].id,
        'session_id': sample_activity_instance.session_id,
        'activity_instance_id': sample_activity_instance.id,
        'activity_definition_id': sample_activity_instance.activity_definition_id,
    })

    assert error is None
    assert status == 201
    assert payload['note']['nano_goal_id'] == payload['goal']['id']
    assert [event.name for event in emitted] == [Events.NOTE_CREATED, Events.GOAL_CREATED]
    assert emitted[0].data['note_id'] == payload['note']['id']
    assert emitted[1].data['goal_id'] == payload['goal']['id']
