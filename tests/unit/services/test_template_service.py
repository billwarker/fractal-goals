import models

from services.events import Events
from services.template_service import TemplateService


def test_delete_template_emits_deleted_event(db_session, sample_ultimate_goal, sample_session_template, test_user, monkeypatch):
    emitted = []
    monkeypatch.setattr('services.template_service.event_bus.emit', lambda event: emitted.append(event))

    service = TemplateService(db_session)
    payload, error, status = service.delete_template(
        sample_ultimate_goal.id,
        sample_session_template.id,
        test_user.id,
    )

    assert error is None
    assert status == 200
    assert payload == {'message': 'Template deleted successfully'}
    assert [event.name for event in emitted] == [Events.SESSION_TEMPLATE_DELETED]
    assert emitted[0].data['template_id'] == sample_session_template.id


def test_create_template_from_session_uses_session_structure(
    db_session,
    sample_ultimate_goal,
    sample_practice_session,
    sample_activity_definition,
    test_user,
):
    sample_practice_session.attributes = {
        'session_type': 'normal',
        'sections': [
            {
                'name': 'Main',
                'estimated_duration_minutes': 20,
                'activity_ids': ['instance-1'],
            }
        ]
    }
    instance = models.ActivityInstance(
        id='instance-1',
        session_id=sample_practice_session.id,
        activity_definition_id=sample_activity_definition.id,
        root_id=sample_practice_session.root_id,
    )
    db_session.add(instance)
    db_session.commit()

    service = TemplateService(db_session)
    template, error, status = service.create_template_from_session(
        sample_ultimate_goal.id,
        sample_practice_session.id,
        'Session Copy',
        test_user.id,
    )

    assert error is None
    assert status == 201
    assert template.name == 'Session Copy'
    template_data = models._safe_load_json(template.template_data, {})
    assert template_data['sections'][0]['name'] == 'Main'
    assert template_data['sections'][0]['activities'] == [
        {
            'activity_id': sample_activity_definition.id,
            'name': sample_activity_definition.name,
            'type': 'activity',
        }
    ]


def test_create_template_from_session_preserves_section_metadata(
    db_session,
    sample_ultimate_goal,
    sample_practice_session,
    sample_activity_definition,
    test_user,
):
    sample_practice_session.attributes = {
        'session_type': 'normal',
        'sections': [
            {
                'name': 'Main',
                'estimated_duration_minutes': 20,
                'notes': 'keep me',
                'theme': 'strength',
                'activity_ids': ['instance-2'],
            }
        ]
    }
    db_session.add(models.ActivityInstance(
        id='instance-2',
        session_id=sample_practice_session.id,
        activity_definition_id=sample_activity_definition.id,
        root_id=sample_practice_session.root_id,
    ))
    db_session.commit()

    service = TemplateService(db_session)
    template, error, status = service.create_template_from_session(
        sample_ultimate_goal.id,
        sample_practice_session.id,
        'Metadata Copy',
        test_user.id,
    )

    assert error is None
    assert status == 201
    template_data = models._safe_load_json(template.template_data, {})
    assert template_data['sections'][0]['notes'] == 'keep me'
    assert template_data['sections'][0]['theme'] == 'strength'
    assert template_data['sections'][0]['duration_minutes'] == 20
