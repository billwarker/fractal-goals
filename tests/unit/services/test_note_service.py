import uuid

from models import Goal, GoalLevel, Note, session_goals
from services.events import Events
from services.note_service import NoteService


def test_create_note_emits_note_created_event(db_session, sample_ultimate_goal, test_user, monkeypatch):
    emitted = []
    monkeypatch.setattr('services.note_service.event_bus.emit', lambda event: emitted.append(event))

    service = NoteService(db_session)
    payload, error, status = service.create_note(sample_ultimate_goal.id, test_user.id, {
        'content': 'A useful note',
        'context_type': 'root',
        'context_id': sample_ultimate_goal.id,
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

    db_session.execute(session_goals.insert().values(
        session_id=sample_activity_instance.session_id,
        goal_id=sample_goal_hierarchy['short_term'].id,
        goal_type='ShortTermGoal',
    ))
    db_session.commit()

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


def test_create_image_only_root_note_succeeds(db_session, sample_ultimate_goal, test_user):
    service = NoteService(db_session)

    payload, error, status = service.create_note(sample_ultimate_goal.id, test_user.id, {
        'context_type': 'root',
        'context_id': sample_ultimate_goal.id,
        'image_data': 'data:image/png;base64,abc123',
    })

    assert error is None
    assert status == 201
    assert payload['content'] == '[Image]'
    assert payload['image_data'] == 'data:image/png;base64,abc123'


def test_create_activity_instance_note_hydrates_session_and_activity_definition(
    db_session,
    sample_goal_hierarchy,
    sample_activity_instance,
    test_user,
):
    service = NoteService(db_session)

    payload, error, status = service.create_note(sample_goal_hierarchy['ultimate'].id, test_user.id, {
        'content': 'Track this rep',
        'context_type': 'activity_instance',
        'context_id': sample_activity_instance.id,
        'activity_instance_id': sample_activity_instance.id,
    })

    assert error is None
    assert status == 201
    assert payload['session_id'] == sample_activity_instance.session_id
    assert payload['activity_definition_id'] == sample_activity_instance.activity_definition_id


def test_create_note_rejects_unlinked_nano_goal_for_activity_instance(
    db_session,
    sample_goal_hierarchy,
    sample_activity_instance,
    test_user,
):
    root = sample_goal_hierarchy['ultimate']
    immediate = Goal(
        id=str(uuid.uuid4()),
        name='Immediate Goal',
        owner_id=test_user.id,
        parent_id=sample_goal_hierarchy['short_term'].id,
        root_id=root.id,
    )
    micro = Goal(
        id=str(uuid.uuid4()),
        name='Micro Goal',
        owner_id=test_user.id,
        parent_id=immediate.id,
        root_id=root.id,
    )
    nano = Goal(
        id=str(uuid.uuid4()),
        name='Nano Goal',
        owner_id=test_user.id,
        parent_id=micro.id,
        root_id=root.id,
    )
    db_session.add_all([immediate, micro, nano])
    db_session.commit()

    service = NoteService(db_session)
    payload, error, status = service.create_note(root.id, test_user.id, {
        'content': 'Nano note',
        'context_type': 'activity_instance',
        'context_id': sample_activity_instance.id,
        'activity_instance_id': sample_activity_instance.id,
        'nano_goal_id': nano.id,
    })

    assert payload is None
    assert status == 400
    assert error == 'nano_goal_id is not linked to the provided session'


def test_get_goal_notes_returns_display_context_and_images(db_session, sample_goal_hierarchy, test_user):
    goal = sample_goal_hierarchy['short_term']
    note = Note(
        id=str(uuid.uuid4()),
        root_id=sample_goal_hierarchy['ultimate'].id,
        context_type='goal',
        context_id=goal.id,
        goal_id=goal.id,
        content='Goal note',
        image_data='data:image/png;base64,goalnote',
    )
    db_session.add(note)
    db_session.commit()

    service = NoteService(db_session)
    payload, error, status = service.get_goal_notes(
        sample_goal_hierarchy['ultimate'].id,
        goal.id,
        test_user.id,
    )

    assert error is None
    assert status == 200
    assert payload[0]['goal_name'] == goal.name
    assert payload[0]['image_data'] == 'data:image/png;base64,goalnote'
