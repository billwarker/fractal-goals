import json
import uuid
from datetime import date, timedelta

from models import Goal, Note, Program
from services.serializers import derive_note_type
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


def test_create_note_rejects_blank_content_after_normalization(db_session, sample_ultimate_goal, test_user):
    service = NoteService(db_session)

    payload, error, status = service.create_note(sample_ultimate_goal.id, test_user.id, {
        'context_type': 'root',
        'context_id': sample_ultimate_goal.id,
        'content': '   ',
    })

    assert payload is None
    assert status == 400
    assert error == 'content is required'


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


def test_create_note_rejects_removed_nano_goal_id_field(
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
    db_session.add(immediate)
    db_session.commit()

    service = NoteService(db_session)
    payload, error, status = service.create_note(root.id, test_user.id, {
        'content': 'Regular note',
        'context_type': 'activity_instance',
        'context_id': sample_activity_instance.id,
        'activity_instance_id': sample_activity_instance.id,
        'nano_goal_id': immediate.id,
    })

    assert payload is None
    assert status == 400
    assert error == 'nano_goal_id is no longer supported'


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


def test_derive_note_type_distinguishes_activity_set_notes():
    assert derive_note_type('activity_instance', None) == 'activity_instance_note'
    assert derive_note_type('activity_instance', 0) == 'activity_set_note'
    assert derive_note_type('goal', None) == 'goal_note'
    assert derive_note_type('program', None) == 'program_note'


def test_create_program_note(db_session, sample_goal_hierarchy, test_user):
    root = sample_goal_hierarchy['ultimate']
    program = Program(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Program with notes',
        start_date=date.today(),
        end_date=date.today() + timedelta(days=14),
        weekly_schedule=[],
    )
    db_session.add(program)
    db_session.commit()

    service = NoteService(db_session)
    payload, error, status = service.create_note(root.id, test_user.id, {
        'content': 'Remember the intent',
        'context_type': 'program',
        'context_id': program.id,
    })

    assert error is None
    assert status == 201
    assert payload['note_type'] == 'program_note'
    assert payload['program_name'] == 'Program with notes'

    notes, error, status = service.get_all_notes(
        root.id,
        test_user.id,
        filters={'context_types': ['program'], 'context_id': program.id},
    )

    assert error is None
    assert status == 200
    assert notes['total'] == 1
    assert notes['notes'][0]['content'] == 'Remember the intent'
    assert notes['notes'][0]['program_name'] == 'Program with notes'


def test_get_all_notes_scopes_program_notes_to_selected_program(db_session, sample_goal_hierarchy, test_user):
    root = sample_goal_hierarchy['ultimate']
    first_program = Program(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Previous Program',
        start_date=date.today() - timedelta(days=30),
        end_date=date.today() - timedelta(days=15),
        weekly_schedule=[],
    )
    second_program = Program(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Current Program',
        start_date=date.today(),
        end_date=date.today() + timedelta(days=14),
        weekly_schedule=[],
    )
    db_session.add_all([first_program, second_program])
    db_session.commit()

    service = NoteService(db_session)
    for program, content in (
        (first_program, 'Past cycle reflection'),
        (second_program, 'Current cycle focus'),
    ):
        payload, error, status = service.create_note(root.id, test_user.id, {
            'content': content,
            'context_type': 'program',
            'context_id': program.id,
        })
        assert error is None
        assert status == 201
        assert payload['program_name'] == program.name

    notes, error, status = service.get_all_notes(
        root.id,
        test_user.id,
        filters={'context_types': ['program'], 'context_id': first_program.id},
    )

    assert error is None
    assert status == 200
    assert notes['total'] == 1
    assert notes['notes'][0]['content'] == 'Past cycle reflection'
    assert notes['notes'][0]['program_name'] == 'Previous Program'


def test_pin_note_rejects_activity_set_notes(db_session, sample_goal_hierarchy, sample_activity_instance, test_user):
    note = Note(
        id=str(uuid.uuid4()),
        root_id=sample_goal_hierarchy['ultimate'].id,
        context_type='activity_instance',
        context_id=sample_activity_instance.id,
        activity_instance_id=sample_activity_instance.id,
        activity_definition_id=sample_activity_instance.activity_definition_id,
        set_index=0,
        content='Set-specific note',
    )
    db_session.add(note)
    db_session.commit()

    service = NoteService(db_session)
    payload, error, status = service.pin_note(sample_goal_hierarchy['ultimate'].id, note.id, test_user.id)

    assert payload is None
    assert status == 400
    assert error == 'Activity set notes cannot be pinned'


def test_get_session_notes_includes_session_template_name(
    db_session,
    sample_goal_hierarchy,
    sample_activity_instance,
    sample_session_template,
    test_user,
):
    session = sample_activity_instance.session
    session.template_id = sample_session_template.id
    session.attributes = json.dumps({
        'session_data': {
            'template_name': 'Standard Practice Session',
        },
    })

    note = Note(
        id=str(uuid.uuid4()),
        root_id=sample_goal_hierarchy['ultimate'].id,
        context_type='session',
        context_id=session.id,
        session_id=session.id,
        content='Session-specific note',
    )
    db_session.add(note)
    db_session.commit()

    service = NoteService(db_session)
    payload, error, status = service.get_session_notes(
        sample_goal_hierarchy['ultimate'].id,
        session.id,
        test_user.id,
    )

    assert error is None
    assert status == 200
    assert payload[0]['session_template_name'] == 'Standard Practice Session'


def test_get_all_notes_filters_regular_goal_notes_by_goal_id(
    db_session,
    sample_goal_hierarchy,
    sample_activity_instance,
    test_user,
):
    root = sample_goal_hierarchy['ultimate']
    goal = Goal(
        id=str(uuid.uuid4()),
        name='Immediate Goal',
        owner_id=test_user.id,
        parent_id=sample_goal_hierarchy['short_term'].id,
        root_id=root.id,
    )
    db_session.add(goal)
    db_session.flush()

    goal_note = Note(
        id=str(uuid.uuid4()),
        root_id=root.id,
        context_type='goal',
        context_id=goal.id,
        goal_id=goal.id,
        content='Smooth',
    )
    activity_note = Note(
        id=str(uuid.uuid4()),
        root_id=root.id,
        context_type='activity_instance',
        context_id=sample_activity_instance.id,
        session_id=sample_activity_instance.session_id,
        activity_instance_id=sample_activity_instance.id,
        activity_definition_id=sample_activity_instance.activity_definition_id,
        content='Technique note',
    )
    db_session.add_all([goal_note, activity_note])
    db_session.commit()

    service = NoteService(db_session)

    payload, error, status = service.get_all_notes(
        root.id,
        test_user.id,
        filters={'note_types': ['goal_note']},
    )

    assert error is None
    assert status == 200
    assert payload['total'] == 1
    assert payload['notes'][0]['id'] == goal_note.id
    assert payload['notes'][0]['note_type'] == 'goal_note'
    assert payload['notes'][0]['goal_name'] == 'Immediate Goal'

    payload, error, status = service.get_all_notes(
        root.id,
        test_user.id,
        filters={'goal_id': goal.id},
    )

    assert error is None
    assert status == 200
    assert payload['total'] == 1
    assert payload['notes'][0]['id'] == goal_note.id
