import json
import uuid
from datetime import datetime, timedelta
import pytest

from services.events import Events
from models import Note, Program, SessionTemplate


@pytest.mark.integration
class TestNotesApiNanoValidation:
    def test_create_note_rejects_removed_nano_goal_id_field(self, authed_client, sample_goal_hierarchy):
        root = sample_goal_hierarchy['ultimate']

        response = authed_client.post(
            f"/api/{root.id}/notes",
            data=json.dumps({
                "content": "Invalid note link",
                "context_type": "root",
                "context_id": root.id,
                "nano_goal_id": sample_goal_hierarchy['short_term'].id,
            }),
            content_type='application/json'
        )

        assert response.status_code == 400
        data = response.get_json()
        messages = [error.get("message", "") for error in data.get("details", [])]
        assert any("Extra inputs are not permitted" in message for message in messages)

    def test_removed_nano_goal_note_endpoint_returns_not_found(self, authed_client, sample_goal_hierarchy):
        root = sample_goal_hierarchy['ultimate']

        response = authed_client.post(
            f"/api/{root.id}/nano-goal-notes",
            data=json.dumps({
                "name": "Do one strict rep",
                "parent_id": sample_goal_hierarchy['short_term'].id,
            }),
            content_type='application/json'
        )

        assert response.status_code == 404

    def test_note_crud_endpoints_emit_note_events_and_preserve_persistence(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
        monkeypatch,
    ):
        root_id = sample_ultimate_goal.id
        emitted = []
        monkeypatch.setattr('services.note_service.event_bus.emit', lambda event: emitted.append(event))

        create_response = authed_client.post(
            f'/api/{root_id}/notes',
            json={
                'content': 'Track this cue',
                'context_type': 'root',
                'context_id': root_id,
            }
        )
        assert create_response.status_code == 201
        created_note = create_response.get_json()
        assert created_note['content'] == 'Track this cue'
        assert [event.name for event in emitted] == [Events.NOTE_CREATED]

        update_response = authed_client.put(
            f'/api/{root_id}/notes/{created_note["id"]}',
            json={'content': 'Track this cue carefully'}
        )
        assert update_response.status_code == 200
        assert update_response.get_json()['content'] == 'Track this cue carefully'
        assert [event.name for event in emitted] == [Events.NOTE_CREATED, Events.NOTE_UPDATED]

        delete_response = authed_client.delete(f'/api/{root_id}/notes/{created_note["id"]}')
        assert delete_response.status_code == 200
        assert [event.name for event in emitted] == [Events.NOTE_CREATED, Events.NOTE_UPDATED, Events.NOTE_DELETED]

        db_session.expire_all()
        deleted_note = db_session.query(Note).filter_by(id=created_note['id']).first()
        assert deleted_note is not None
        assert deleted_note.deleted_at is not None

    def test_create_program_note(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        program = Program(
            id=str(uuid.uuid4()),
            root_id=root_id,
            name='Program Notes API',
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=14),
            weekly_schedule=[],
        )
        db_session.add(program)
        db_session.commit()

        response = authed_client.post(
            f'/api/{root_id}/notes',
            json={
                'content': 'Keep the main constraint in view',
                'context_type': 'program',
                'context_id': program.id,
            },
        )

        assert response.status_code == 201
        payload = response.get_json()
        assert payload['content'] == 'Keep the main constraint in view'
        assert payload['context_type'] == 'program'
        assert payload['context_id'] == program.id
        assert payload['note_type'] == 'program_note'
        assert payload['program_name'] == 'Program Notes API'

        list_response = authed_client.get(
            f'/api/{root_id}/notes?context_types=program&context_id={program.id}',
        )

        assert list_response.status_code == 200
        notes = list_response.get_json()['notes']
        assert notes[0]['program_name'] == 'Program Notes API'

    def test_create_note_rejects_quick_session(self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition):
        root_id = sample_ultimate_goal.id
        quick_template = SessionTemplate(
            id=str(uuid.uuid4()),
            name='Quick Template',
            root_id=root_id,
            template_data=json.dumps({
                'session_type': 'quick',
                'activities': [{'activity_id': sample_activity_definition.id}],
            }),
        )
        db_session.add(quick_template)
        db_session.commit()

        create_response = authed_client.post(
            f'/api/{root_id}/sessions',
            json={
                'name': 'Quick Session',
                'template_id': quick_template.id,
            }
        )
        assert create_response.status_code == 201
        session = create_response.get_json()

        response = authed_client.post(
            f'/api/{root_id}/notes',
            json={
                'content': 'Should fail',
                'context_type': 'session',
                'context_id': session['id'],
                'session_id': session['id'],
            }
        )

        assert response.status_code == 400
        assert 'Quick sessions do not support notes' in response.get_json()['error']
