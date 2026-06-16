import models
from datetime import date, timedelta

from models import Program, ProgramBlock, ProgramDay
from services.events import Events
from services.serializers import serialize_session_template
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


def test_update_template_can_archive_and_reactivate(db_session, sample_ultimate_goal, sample_session_template, test_user):
    service = TemplateService(db_session)

    archived, error, status = service.update_template(
        sample_ultimate_goal.id,
        sample_session_template.id,
        test_user.id,
        {'is_archived': True},
    )

    assert error is None
    assert status == 200
    assert archived.archived_at is not None
    assert serialize_session_template(archived)['is_archived'] is True

    reactivated, error, status = service.update_template(
        sample_ultimate_goal.id,
        sample_session_template.id,
        test_user.id,
        {'is_archived': False},
    )

    assert error is None
    assert status == 200
    assert reactivated.archived_at is None
    assert serialize_session_template(reactivated)['is_archived'] is False


def test_list_templates_marks_archived_template_used_by_active_program(
    db_session,
    sample_ultimate_goal,
    sample_session_template,
    test_user,
):
    today = date.today()
    sample_session_template.archived_at = models.utc_now()
    program = Program(
        root_id=sample_ultimate_goal.id,
        name='Current Program',
        start_date=today - timedelta(days=1),
        end_date=today + timedelta(days=1),
        weekly_schedule=[],
    )
    db_session.add(program)
    db_session.flush()
    block = ProgramBlock(
        program_id=program.id,
        name='Current Block',
        start_date=today - timedelta(days=1),
        end_date=today + timedelta(days=1),
    )
    db_session.add(block)
    db_session.flush()
    day = ProgramDay(
        block_id=block.id,
        name='Today',
        day_number=1,
        day_of_week=[today.strftime('%A')],
    )
    day.templates.append(sample_session_template)
    db_session.add(day)
    db_session.commit()

    templates, error, status = TemplateService(db_session).list_templates(sample_ultimate_goal.id, test_user.id)

    assert error is None
    assert status == 200
    listed = next(template for template in templates if template.id == sample_session_template.id)
    payload = serialize_session_template(listed)
    assert payload['is_archived'] is True
    assert payload['is_used_in_active_program'] is True
    assert payload['is_effectively_active'] is True


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
