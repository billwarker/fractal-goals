"""Disposable independent audit probes; removed after recording results."""
import importlib.util
from pathlib import Path
from uuid import uuid4

from sqlalchemy import text

from models import ActivityInstance, Session, utc_now
from services.analytics_engine import AnalyticsEngineService
from services.feature_flag_service import FeatureFlagService


def _sql(db_session, user_id, sql):
    FeatureFlagService(db_session).update_flags({'analytics_sql_explorer': True})
    return AnalyticsEngineService(db_session).run_query(user_id, {'mode': 'sql', 'sql': sql})


def test_review_schema_qualified_function_can_read_outside_catalog(db_session, test_user):
    schema = 'review_' + uuid4().hex[:12]
    db_session.execute(text(f'CREATE SCHEMA {schema}'))
    db_session.execute(text(f'''CREATE FUNCTION {schema}.generate_series(integer, integer)
        RETURNS SETOF text LANGUAGE sql SECURITY DEFINER AS $$
        SELECT password_hash FROM public.users WHERE id = '{test_user.id}'
        $$'''))
    db_session.commit()
    try:
        # This can be called by another account if such a routine exists. The audit
        # does not assume an unprivileged attacker can create the routine.
        payload, error, status = _sql(db_session, 'review-no-owned-account',
                                     f'SELECT * FROM {schema}.generate_series(1, 1)')
        assert status == 200, error
        assert payload['rows'][0]['generate_series'] == test_user.password_hash
    finally:
        db_session.rollback()
        db_session.execute(text(f'DROP SCHEMA {schema} CASCADE'))
        db_session.commit()


def test_review_nested_regclass_array_passes_guard(db_session, test_user):
    payload, error, status = _sql(db_session, test_user.id,
        "SELECT CAST(CAST('{users}' AS pg_catalog.regclass[]) AS text) AS metadata")
    assert status == 200, error
    assert payload['rows'] == [{'metadata': '{users}'}]


def test_review_only_catalog_relation_remains_scoped(db_session, test_user, sample_ultimate_goal):
    root_id = sample_ultimate_goal.id
    db_session.add(Session(id=str(uuid4()), owner_id=test_user.id, root_id=root_id,
                           name='Visible review session', completed=True))
    db_session.commit()
    payload, error, status = _sql(db_session, test_user.id, 'SELECT name FROM ONLY sessions')
    assert status in (200, 400), error
    if status == 200:
        assert payload['rows'] == [{'name': 'Visible review session'}]


def test_review_inventory_undercounts_soft_deleted_instance_sessions(
    db_session, authed_client, sample_ultimate_goal, sample_activity_definition,
):
    root_id = sample_ultimate_goal.id
    activity_id = sample_activity_definition.id
    session = Session(id=str(uuid4()), root_id=root_id, owner_id=sample_ultimate_goal.owner_id,
                      name='Legacy review evidence', completed=True,
                      attributes={'session_data': {'sections': [{'exercises': [
                          {'type': 'activity', 'activity_id': activity_id},
                      ]}]}})
    db_session.add(session)
    db_session.flush()
    db_session.add(ActivityInstance(id=str(uuid4()), root_id=root_id, session_id=session.id,
                                    activity_definition_id=activity_id, deleted_at=utc_now()))
    db_session.commit()
    path = Path(__file__).resolve().parents[2] / 'scripts/compat_inventory.py'
    spec = importlib.util.spec_from_file_location('review_compat_inventory', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.inventory(db_session)['sessions_with_legacy_exercise_evidence'] == 0
    response = authed_client.get(f'/api/{root_id}/sessions/analytics-summary')
    assert response.status_code == 200
    evidence = response.get_json()['activity_instances'][activity_id]
    assert len(evidence) == 1
    assert evidence[0]['id'].startswith(session.id + '-legacy-')
