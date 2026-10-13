"""List summaries keep card contracts without loading session execution bodies."""
import json
import pytest
from sqlalchemy import event
from models import ActivityInstance, Session


@pytest.mark.parametrize('native', [True, False])
def test_summary_keeps_quick_metadata_and_does_not_hydrate_activities(
    native, authed_client, db_session, sample_practice_session, sample_activity_instance,
):
    session = sample_practice_session
    attributes = {'session_data': {'session_type': 'quick', 'template_color': '#123456', 'template_name': 'Quick',
                                   'sections': [{'exercises': [{'name': 'Large payload', 'notes': 'x' * 100000}]}]}}
    session.attributes = attributes if native else json.dumps(attributes)
    db_session.commit()
    loaded = []
    def track(instance, _context):
        loaded.append(instance.id)
    event.listen(ActivityInstance, 'load', track)
    try:
        response = authed_client.get(f'/api/{session.root_id}/sessions?view=summary&limit=20')
    finally:
        event.remove(ActivityInstance, 'load', track)
    assert response.status_code == 200
    assert loaded == []
    assert len(response.data) < 10000
    row = next(row for row in response.get_json()['sessions'] if row['id'] == session.id)
    assert row['read_model'] == 'session-list-v1'
    assert row['session_type'] == 'quick'
    assert row['template_color'] == '#123456'
    assert 'sections' not in row['attributes']['session_data']
    assert 'activity_instances' not in row
    assert 'notes' not in row


@pytest.mark.parametrize('query', ['view=unknown', 'limit=0', 'limit=-1', 'offset=-1'])
def test_summary_options_are_bounded(authed_client, sample_ultimate_goal, query):
    assert authed_client.get(f'/api/{sample_ultimate_goal.id}/sessions?{query}').status_code == 400


@pytest.mark.parametrize('native_template', [True, False])
@pytest.mark.parametrize('native_session', [True, False])
def test_summary_matches_detail_template_presentation(native_template, native_session, authed_client, db_session, sample_practice_session, sample_session_template):
    session, template = sample_practice_session, sample_session_template
    template.name = 'Current template name'
    template_data = {'template_color': '#567890', 'sections': [{'notes': 'x' * 50000}]}
    template.template_data = template_data if native_template else json.dumps(template_data)
    snapshot = {'session_data': {'template_name': 'Historical template name', 'template_color': '#123456'}}
    session.attributes = snapshot if native_session else json.dumps(snapshot)
    session.template_id = template.id
    db_session.commit()
    detail = authed_client.get(f'/api/{session.root_id}/sessions/{session.id}').get_json()
    response = authed_client.get(f'/api/{session.root_id}/sessions?view=summary')
    summary = next(row for row in response.get_json()['sessions'] if row['id'] == session.id)
    assert summary['template_name'] == detail['attributes']['session_data']['template_name'] == 'Historical template name'
    assert summary['template_color'] == detail['template_color'] == '#567890'
    assert len(response.data) < 10000
