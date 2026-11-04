"""Saved analytics: goal links on views, pinning, opening order and duplicating."""
import pytest

from tests.integration.test_goal_charts_api import _attach, _view
from tests.integration.test_goal_conditions_api import _create_goal


def _list(client, root):
    response = client.get(f"/api/roots/{root}/dashboards")
    assert response.status_code == 200, response.get_json()
    return response.get_json()['data']


@pytest.mark.integration
class TestSavedAnalytics:
    def test_views_list_their_goals_and_chart(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        bench, squat = (_create_goal(authed_client, root, root, name=name)['id'] for name in ('Bench 225', 'Squat 315'))
        trends = _view(authed_client, root, 'Trends')
        _view(authed_client, root, 'Board', kind='dashboard')
        assert _attach(authed_client, root, squat, trends).status_code == 201
        assert _attach(authed_client, root, bench, trends).status_code == 201

        by_name = {item['name']: item for item in _list(authed_client, root)}
        # Same level: the earliest attached comes first.
        assert [goal['name'] for goal in by_name['Trends']['goals']] == ['Squat 315', 'Bench 225']
        assert by_name['Trends']['visualization'] == {'category': 'activities', 'id': 'metricTrends'}
        assert by_name['Board']['goals'] == [] and 'visualization' not in by_name['Board']
        # A deleted goal no longer counts.
        assert authed_client.delete(f"/api/{root}/goals/{bench}").status_code == 200
        assert [goal['name'] for goal in {i['name']: i for i in _list(authed_client, root)}['Trends']['goals']] == ['Squat 315']

    def test_view_goals_lead_with_the_highest_level_and_carry_its_name(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        parent = _create_goal(authed_client, root, root, name='Parent', type='MidTermGoal')['id']
        child = _create_goal(authed_client, root, parent, name='Child')['id']
        sibling = _create_goal(authed_client, root, root, name='Sibling', type='MidTermGoal')['id']
        view = _view(authed_client, root, 'Trends')
        for goal_id in (child, sibling, parent):
            assert _attach(authed_client, root, goal_id, view).status_code == 201

        goals = {item['name']: item for item in _list(authed_client, root)}['Trends']['goals']
        # Higher levels first (the child was attached first), then the earliest attached of a level.
        assert [goal['name'] for goal in goals] == ['Sibling', 'Parent', 'Child']
        assert goals[0]['level_rank'] < goals[2]['level_rank']
        assert all(goal['level_name'] for goal in goals)

    def test_view_goals_say_whether_each_is_smart(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        plain = _create_goal(authed_client, root, root, name='Plain', type='MidTermGoal')['id']
        smart = _create_goal(authed_client, root, plain, name='Smart', description='Why', deadline='2030-01-01', track_activities=False)
        assert smart['is_smart'] is True
        view = _view(authed_client, root, 'Trends')
        for goal_id in (plain, smart['id']):
            assert _attach(authed_client, root, goal_id, view).status_code == 201

        goals = {goal['name']: goal for goal in {item['name']: item for item in _list(authed_client, root)}['Trends']['goals']}
        assert goals['Plain']['is_smart'] is False
        assert goals['Smart']['is_smart'] is True

    def test_pinned_first_then_last_opened_without_touching_updated(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        first, second, third = (_view(authed_client, root, name) for name in ('First', 'Second', 'Third'))
        before = {item['id']: item['updated_at'] for item in _list(authed_client, root)}

        assert authed_client.post(f"/api/roots/{root}/dashboards/{first}/opened").status_code == 200
        pinned = authed_client.put(f"/api/roots/{root}/dashboards/{third}", json={'pinned': True})
        assert pinned.status_code == 200 and pinned.get_json()['data']['pinned'] is True

        listed = _list(authed_client, root)
        assert [item['name'] for item in listed] == ['Third', 'First', 'Second']
        assert {item['id']: item['updated_at'] for item in listed} == before
        assert next(item for item in listed if item['id'] == first)['last_opened_at']
        # Each open counts; the never-opened stay at zero.
        assert authed_client.post(f"/api/roots/{root}/dashboards/{first}/opened").status_code == 200
        counts = {item['id']: item['open_count'] for item in _list(authed_client, root)}
        assert counts == {first: 2, second: 0, third: 0}
        assert authed_client.post(f"/api/roots/{root}/dashboards/missing/opened").status_code == 404
        assert second

    def test_duplicates_are_named_copies_without_goal_links(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        goal = _create_goal(authed_client, root, root, name='Bench')['id']
        trends = _view(authed_client, root, 'Trends')
        assert _attach(authed_client, root, goal, trends).status_code == 201

        copies = [authed_client.post(f"/api/roots/{root}/dashboards/{trends}/duplicate") for _ in range(2)]
        assert [response.status_code for response in copies] == [201, 201]
        assert [response.get_json()['data']['name'] for response in copies] == ['Trends (copy)', 'Trends (copy 2)']
        by_name = {item['name']: item for item in _list(authed_client, root)}
        assert by_name['Trends (copy)']['goals'] == []
        assert by_name['Trends (copy)']['layout'] == by_name['Trends']['layout']


def test_listing_loads_goals_in_constant_queries(authed_client, sample_ultimate_goal, query_counter):
    root = sample_ultimate_goal.id
    goal = _create_goal(authed_client, root, root)['id']

    def count():
        query_counter['total'] = 0
        assert authed_client.get(f"/api/roots/{root}/dashboards").status_code == 200
        return query_counter['total']

    for index in range(3):
        _attach(authed_client, root, goal, _view(authed_client, root, f'View {index}'))
    few = count()
    for index in range(3, 9):
        _attach(authed_client, root, goal, _view(authed_client, root, f'View {index}'))
    assert count() == few


def test_saved_analytics_migration_preserves_layouts_and_reverses(db_session, authed_client, sample_ultimate_goal):
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import inspect, text

    root = sample_ultimate_goal.id
    view_id = _view(authed_client, root, 'Existing view')
    path = Path(__file__).resolve().parents[2] / 'migrations/versions/e3a5c7b9d1f2_analytics_saved_view_pins.py'
    spec = importlib.util.spec_from_file_location('saved_analytics_migration', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with db_session.get_bind().begin() as connection:
        original = connection.execute(text('SELECT layout FROM analytics_dashboards WHERE id = :id'), {'id': view_id}).scalar()
        with Operations.context(MigrationContext.configure(connection)):
            module.downgrade()
            assert 'pinned' not in {column['name'] for column in inspect(connection).get_columns('analytics_dashboards')}
            module.upgrade()
        row = connection.execute(text('SELECT layout, pinned, last_opened_at FROM analytics_dashboards WHERE id = :id'), {'id': view_id}).one()
        assert row.layout == original
        assert row.pinned is False and row.last_opened_at is None


def test_new_actions_reject_foreign_roots_and_deleted_views(authed_client, db_session, sample_ultimate_goal):
    from models import AnalyticsDashboard, Goal

    root = sample_ultimate_goal.id
    view_id = _view(authed_client, root, 'Private view')
    # The id exists, but cannot be addressed through another fractal.
    for action in ('opened', 'duplicate'):
        assert authed_client.post(f'/api/roots/missing/dashboards/{view_id}/{action}').status_code == 404
    assert authed_client.delete(f'/api/roots/{root}/dashboards/{view_id}').status_code == 200
    for action in ('opened', 'duplicate'):
        assert authed_client.post(f'/api/roots/{root}/dashboards/{view_id}/{action}').status_code == 404
    assert authed_client.put(f'/api/roots/{root}/dashboards/{view_id}', json={'pinned': True}).status_code == 404
    # Change ownership at the root; all three actions must re-check it.
    live = _view(authed_client, root, 'Live view')
    db_session.query(Goal).filter_by(id=root).update({'owner_id': None})
    db_session.commit()
    for action in ('opened', 'duplicate'):
        assert authed_client.post(f'/api/roots/{root}/dashboards/{live}/{action}').status_code == 404
    assert authed_client.put(f'/api/roots/{root}/dashboards/{live}', json={'pinned': True}).status_code == 404
    assert db_session.query(AnalyticsDashboard).filter_by(id=live).one().pinned is False


def test_duplicating_max_length_name_stays_renameable(authed_client, sample_ultimate_goal):
    from validators.core import MAX_NAME_LENGTH
    root = sample_ultimate_goal.id
    original = _view(authed_client, root, 'V' * MAX_NAME_LENGTH)
    for index in range(2):
        response = authed_client.post(f'/api/roots/{root}/dashboards/{original}/duplicate')
        assert response.status_code == 201
        copy = response.get_json()['data']
        assert len(copy['name']) == MAX_NAME_LENGTH
        assert copy['name'].endswith(' (copy)' if index == 0 else ' (copy 2)')
        assert authed_client.put(f"/api/roots/{root}/dashboards/{copy['id']}", json={'name': copy['name']}).status_code == 200
