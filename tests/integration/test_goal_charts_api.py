"""Goal charts: saved analytics views on goals, a view's goals, and the scoped activity evidence."""
from config import config
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from models import GoalAnalyticsView, User
from tests.integration.test_goal_conditions_api import _create_goal, _instance, _now, _session, _threshold


def _view(client, root, name, category='activities', visualization='metricTrends', kind='view'):
    profile = {'selectedCategory': category, 'selectedVisualization': visualization}
    layout = {'type': 'analytics_view', 'version': 1, 'profile': profile, 'global_filters': {}}
    if kind == 'dashboard':
        layout = {'version': 1, 'layout': {'type': 'grid', 'panels': []}, 'window_states': {
            'window-1': profile, 'window-2': profile}, 'selected_window_id': 'window-1'}
    response = client.post(f"/api/roots/{root}/dashboards", json={'name': name, 'kind': kind, 'layout': layout})
    assert response.status_code == 201, response.get_json()
    return response.get_json()['data']['id']


def _charts(client, root, goal_id):
    response = client.get(f"/api/{root}/goals/{goal_id}/charts")
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def _attach(client, root, goal_id, view_id):
    return client.post(f"/api/{root}/goals/{goal_id}/charts", json={'dashboard_id': view_id})


@pytest.mark.integration
class TestGoalCharts:
    def test_attach_reorder_and_detach(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        goal = _create_goal(authed_client, root, root, name="Bench 225")['id']
        trends, totals = _view(authed_client, root, 'Trends'), _view(authed_client, root, 'Totals', visualization='activityFrequency')

        assert _attach(authed_client, root, goal, trends).status_code == 201
        assert _attach(authed_client, root, goal, totals).status_code == 201
        assert [c['name'] for c in _charts(authed_client, root, goal)['charts']] == ['Trends', 'Totals']

        reordered = authed_client.put(f"/api/{root}/goals/{goal}/charts/order", json={'dashboard_ids': [totals, trends]})
        assert reordered.status_code == 200
        assert [c['name'] for c in reordered.get_json()['charts']] == ['Totals', 'Trends']
        assert authed_client.put(f"/api/{root}/goals/{goal}/charts/order", json={'dashboard_ids': [totals]}).status_code == 400

        assert authed_client.delete(f"/api/{root}/goals/{goal}/charts/{totals}").status_code == 200
        assert [c['name'] for c in _charts(authed_client, root, goal)['charts']] == ['Trends']
        assert authed_client.delete(f"/api/{root}/goals/{goal}/charts/{totals}").status_code == 404

    def test_only_chart_views_attach(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        goal = _create_goal(authed_client, root, root)['id']
        goals_view = _view(authed_client, root, 'Goal timeline', category='goals', visualization='goalCompletionTimeline')
        sessions_view = _view(authed_client, root, 'Sessions', category='sessions', visualization='sessionTrends')
        query_view = _view(authed_client, root, 'Query', category='query', visualization='sql')
        dashboard = _view(authed_client, root, 'Board', kind='dashboard')

        assert _attach(authed_client, root, goal, goals_view).status_code == 201
        assert _attach(authed_client, root, goal, goals_view).status_code == 409
        assert _attach(authed_client, root, goal, sessions_view).status_code == 201
        query_attempt = _attach(authed_client, root, goal, query_view)
        assert query_attempt.status_code == 400 and 'query views' in query_attempt.get_json()['error']
        assert _attach(authed_client, root, goal, dashboard).status_code == 400
        assert _attach(authed_client, root, goal, 'missing').status_code == 404

    def test_views_saved_in_the_older_grid_shape_attach(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        goal = _create_goal(authed_client, root, root)['id']

        def grid_view(name, window_states):
            layout = {'version': 1, 'layout': {'type': 'grid', 'panels': [{'id': 'window-1', 'x': 0, 'y': 0, 'w': 96, 'h': 48}]},
                      'window_states': window_states, 'selected_window_id': 'window-1'}
            response = authed_client.post(f"/api/roots/{root}/dashboards", json={'name': name, 'kind': 'view', 'layout': layout})
            assert response.status_code == 201, response.get_json()
            return response.get_json()['data']['id']

        weight = grid_view('Weight Over Time', {'window-1': {'selectedCategory': 'activities', 'selectedVisualization': 'lineGraph'}})
        assert _attach(authed_client, root, goal, weight).status_code == 201
        assert _charts(authed_client, root, goal)['charts'][0]['category'] == 'activities'

        sessions = grid_view('Old sessions', {'window-1': {'selectedCategory': 'sessions', 'selectedVisualization': 'sessionTrends'}})
        assert _attach(authed_client, root, goal, sessions).status_code == 201
        empty = grid_view('Empty', {'window-1': {'selectedCategory': None, 'selectedVisualization': None}})
        assert _attach(authed_client, root, goal, empty).get_json()['error'] == 'This view has no chart yet'

    def test_the_default_chart_follows_the_condition(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        root = sample_ultimate_goal.id
        threshold = _create_goal(authed_client, root, root, _threshold(sample_activity_definition))['id']
        manual = _create_goal(authed_client, root, root)['id']

        assert _charts(authed_client, root, threshold)['default_chart'] == 'condition_progress'
        assert _charts(authed_client, root, manual)['default_chart'] is None

    def test_a_goal_shows_at_most_twelve_charts(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        goal = _create_goal(authed_client, root, root)['id']
        for index in range(12):
            assert _attach(authed_client, root, goal, _view(authed_client, root, f'View {index}')).status_code == 201

        assert _attach(authed_client, root, goal, _view(authed_client, root, 'One too many')).status_code == 400

    def test_deleting_a_view_or_goal_removes_its_links(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        first, second = (_create_goal(authed_client, root, root, name=name)['id'] for name in ('First', 'Second'))
        view = _view(authed_client, root, 'Trends')
        _attach(authed_client, root, first, view)
        _attach(authed_client, root, second, view)

        authed_client.delete(f"/api/{root}/goals/{second}")
        assert [g['goal_name'] for g in authed_client.get(f"/api/roots/{root}/dashboards/{view}/goals").get_json()['goals']] == ['First']

        assert authed_client.delete(f"/api/roots/{root}/dashboards/{view}").status_code == 200
        assert _charts(authed_client, root, first)['charts'] == []
        db_session.expire_all()
        assert db_session.query(GoalAnalyticsView).filter_by(dashboard_id=view).count() == 0

    def test_another_users_fractal_is_not_reachable(self, client, authed_client, db_session, sample_ultimate_goal):
        from tests.conftest import session_headers_for
        other = User(
            id=str(uuid.uuid4()), username="charter", email="charter@example.com",
            terms_accepted_version="1.0", terms_accepted_at=datetime.now(timezone.utc),
            privacy_accepted_version=config.PRIVACY_VERSION, privacy_accepted_at=datetime.now(timezone.utc),
        )
        other.set_password("Password123")
        db_session.add(other)
        db_session.commit()
        root = sample_ultimate_goal.id
        goal = _create_goal(authed_client, root, root)['id']
        view = _view(authed_client, root, 'Trends')
        headers = session_headers_for(other)

        statuses = [
            client.get(f"/api/{root}/goals/{goal}/charts", headers=headers).status_code,
            client.post(f"/api/{root}/goals/{goal}/charts", json={'dashboard_id': view}, headers=headers).status_code,
            client.get(f"/api/roots/{root}/dashboards/{view}/goals", headers=headers).status_code,
        ]
        assert statuses == [404, 404, 404]


@pytest.mark.integration
class TestViewGoals:
    def test_setting_a_views_goals_adds_and_removes_links(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        a, b, c = (_create_goal(authed_client, root, root, name=name)['id'] for name in ('A goal', 'B goal', 'C goal'))
        view = _view(authed_client, root, 'Trends')
        other = _view(authed_client, root, 'Other')
        _attach(authed_client, root, b, other)

        response = authed_client.put(f"/api/roots/{root}/dashboards/{view}/goals", json={'goal_ids': [a, b]})
        assert response.status_code == 200, response.get_json()
        assert [g['goal_name'] for g in response.get_json()['goals']] == ['A goal', 'B goal']
        # Added after the goal's existing charts.
        assert [chart['name'] for chart in _charts(authed_client, root, b)['charts']] == ['Other', 'Trends']

        response = authed_client.put(f"/api/roots/{root}/dashboards/{view}/goals", json={'goal_ids': [c]})
        assert [g['goal_name'] for g in response.get_json()['goals']] == ['C goal']
        assert _charts(authed_client, root, a)['charts'] == []
        assert authed_client.put(f"/api/roots/{root}/dashboards/{view}/goals", json={'goal_ids': ['missing']}).status_code == 404

    def test_query_views_report_why_they_cannot_attach(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        view = _view(authed_client, root, 'Query', category='query', visualization='sql')
        sessions = _view(authed_client, root, 'Sessions', category='sessions', visualization='sessionTrends')

        payload = authed_client.get(f"/api/roots/{root}/dashboards/{view}/goals").get_json()

        assert payload['attachable'] is False and 'query views' in payload['reason']
        assert authed_client.get(f"/api/roots/{root}/dashboards/{sessions}/goals").get_json()['attachable'] is True


@pytest.mark.integration
class TestActivityEvidence:
    def test_returns_recent_completed_instances_oldest_first(self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition):
        root = sample_ultimate_goal.id
        session = _session(db_session, sample_ultimate_goal, started=_now() - timedelta(days=5))
        older = _instance(db_session, session, sample_activity_definition, [{"Weight": 200}], occurred=_now() - timedelta(days=5), completed=True)
        newer = _instance(db_session, session, sample_activity_definition, [{"Weight": 210}], occurred=_now() - timedelta(days=1), completed=True)
        # Unfinished instances aren't evidence.
        _instance(db_session, session, sample_activity_definition, [{"Weight": 999}], occurred=_now())

        payload = authed_client.get(f"/api/{root}/activities/{sample_activity_definition.id}/analytics-evidence").get_json()

        assert [item['id'] for item in payload['instances']] == [older.id, newer.id]
        assert payload['activity_definition']['id'] == sample_activity_definition.id
        assert payload['truncated'] is False
        limited = authed_client.get(f"/api/{root}/activities/{sample_activity_definition.id}/analytics-evidence",
                                    query_string={'limit': 1}).get_json()
        assert ([item['id'] for item in limited['instances']], limited['truncated']) == ([newer.id], True)
        since = authed_client.get(f"/api/{root}/activities/{sample_activity_definition.id}/analytics-evidence",
                                  query_string={'since': (_now() - timedelta(days=2)).date().isoformat()}).get_json()
        assert [item['id'] for item in since['instances']] == [newer.id]

    def test_rejects_bad_input_and_unknown_activities(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        root = sample_ultimate_goal.id
        base = f"/api/{root}/activities/{sample_activity_definition.id}/analytics-evidence"
        assert authed_client.get(base, query_string={'since': 'soon'}).status_code == 400
        assert authed_client.get(f"/api/{root}/activities/missing/analytics-evidence").status_code == 404


@pytest.mark.integration
def test_reads_run_in_constant_queries(authed_client, db_session, sample_ultimate_goal, sample_activity_definition, query_counter):
    root = sample_ultimate_goal.id
    goal = _create_goal(authed_client, root, root, _threshold(sample_activity_definition))['id']
    session = _session(db_session, sample_ultimate_goal, started=_now() - timedelta(days=3))

    def counts():
        query_counter['total'] = 0
        _charts(authed_client, root, goal)
        charts = query_counter['total']
        query_counter['total'] = 0
        authed_client.get(f"/api/{root}/activities/{sample_activity_definition.id}/analytics-evidence")
        return charts, query_counter['total']

    _attach(authed_client, root, goal, _view(authed_client, root, 'View 0'))
    _instance(db_session, session, sample_activity_definition, [{"Weight": 200}], occurred=_now() - timedelta(days=3), completed=True)
    db_session.commit()
    one = counts()
    for index in range(1, 5):
        _attach(authed_client, root, goal, _view(authed_client, root, f'View {index}'))
        _instance(db_session, session, sample_activity_definition, [{"Weight": 200 + index}], occurred=_now() - timedelta(days=3), completed=True)
    db_session.commit()
    assert counts() == one
