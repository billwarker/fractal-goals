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
