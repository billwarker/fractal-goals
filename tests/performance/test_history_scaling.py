"""History growth must not increase ORM hydration or chart point counts."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from time import perf_counter
import pytest
from sqlalchemy import event
from models import ActivityInstance, Session, activity_goal_associations, session_goals
from services.goal_analytics_service import GoalAnalyticsService
from services.progress_service import ProgressService
from tests.conftest import session_headers_for


@pytest.fixture(params=[1000, 5000, 10000])
def history_account(request, db_session, sample_ultimate_goal, sample_activity_definition, test_user):
    root, activity = sample_ultimate_goal, sample_activity_definition
    count = request.param
    now = datetime.now(timezone.utc)
    root.created_at = now - timedelta(minutes=count + 60)
    sessions, instances = [], []
    for index in range(count):
        occurred = now - timedelta(minutes=count - index)
        session_id, instance_id = str(uuid4()), str(uuid4())
        sessions.append(dict(id=session_id, root_id=root.id, owner_id=test_user.id, name='History',
                             session_start=occurred, session_end=occurred + timedelta(seconds=30), completed=True,
                             total_duration_seconds=30, created_at=occurred))
        instances.append(dict(id=instance_id, session_id=session_id, root_id=root.id,
                              activity_definition_id=activity.id, completed=True, created_at=occurred,
                              time_start=occurred, time_stop=occurred + timedelta(seconds=30), duration_seconds=30))
    db_session.execute(Session.__table__.insert(), sessions)
    db_session.execute(ActivityInstance.__table__.insert(), instances)
    db_session.execute(activity_goal_associations.insert().values(goal_id=root.id, activity_id=activity.id))
    db_session.execute(session_goals.insert(), [dict(goal_id=root.id, session_id=row['id'], goal_type='UltimateGoal') for row in sessions])
    db_session.commit()
    return root, activity, instances, session_headers_for(test_user)


def test_single_progress_hydrates_only_target_and_predecessor(db_session, history_account):
    root, _, instances, _ = history_account
    hydrated = []
    def loaded(instance, _context):
        hydrated.append(instance.id)
    event.listen(ActivityInstance, 'load', loaded)
    try:
        result = ProgressService(db_session).get_progress_for_instance(instances[-1]['id'])
    finally:
        event.remove(ActivityInstance, 'load', loaded)
    assert result['previous_instance_id'] == instances[-2]['id']
    assert set(hydrated) <= {instances[-1]['id'], instances[-2]['id']}


def test_timeline_page_and_calendar_do_not_hydrate_lifetime_history(client, history_account):
    root, _, instances, headers = history_account
    hydrated = []
    def loaded(instance, _context):
        hydrated.append(instance.id)
    event.listen(ActivityInstance, 'load', loaded)
    try:
        url = f'/api/{root.id}/goals/{root.id}/activity-heatmap'
        calendar = client.get(url, headers=headers)
        assert calendar.status_code == 200
        assert calendar.get_json()['total_activities'] == len(instances)
        assert hydrated == []
        page = client.get(url + '?view=entries&metric=activities&limit=20', headers=headers)
        assert page.status_code == 200
        data = page.get_json()
        assert data['pagination']['total'] == len(instances)
        assert len(data['entries']) == 20
        assert len(set(hydrated)) <= 20
        hydrated.clear()
        next_page = client.get(url, headers=headers, query_string={
            'view': 'entries', 'metric': 'activities', 'limit': 20, 'cursor': data['pagination']['next_cursor'],
        })
        assert next_page.status_code == 200
        assert not {entry['id'] for entry in data['entries']} & {entry['id'] for entry in next_page.get_json()['entries']}
        assert len(set(hydrated)) <= 20
    finally:
        event.remove(ActivityInstance, 'load', loaded)


def test_analytics_aggregates_instances_without_hydration(db_session, history_account, test_user, record_property):
    root, _, instances, _ = history_account
    def loaded(_instance, _context):
        pytest.fail('Analytics hydrated an activity instead of aggregating SQL rows')
    event.listen(ActivityInstance, 'load', loaded)
    # Best of three: a rescan regression is slow on every run, while a busy machine
    # only slows some, so the minimum guards the plan without flaking under load.
    timings = []
    try:
        for _ in range(3):
            started = perf_counter()
            payload, error, status = GoalAnalyticsService(db_session).get_goal_analytics(root.id, test_user.id)
            timings.append((perf_counter() - started) * 1000)
    finally:
        event.remove(ActivityInstance, 'load', loaded)
    elapsed_ms = min(timings)
    record_property('analytics_elapsed_ms', elapsed_ms)
    assert elapsed_ms < 5000, 'Aggregate plan must not rescan an unindexed occurrence CTE per history row'
    assert status == 200 and error is None
    assert all(goal['session_durations_by_date'] == [] for goal in payload['goals'])
    goal = next(goal for goal in payload['goals'] if goal['id'] == root.id)
    assert goal['session_count'] == len(instances)
    assert goal['total_duration_seconds'] == len(instances) * 30
    assert sum(item['instance_count'] for item in goal['activity_breakdown']) == len(instances)
