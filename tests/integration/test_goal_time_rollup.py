"""Time Spent Per Goal roll-up: series built from evidence, each session counted once per series."""
import uuid
from datetime import datetime, timedelta

import pytest

from models import Goal, GoalLevel, Session, session_goals


def _level(db_session, name, rank):
    level = GoalLevel(id=str(uuid.uuid4()), name=f'{name} {uuid.uuid4().hex[:6]}', rank=rank, color='#888888')
    db_session.add(level)
    return level


def _goal(db_session, root, name, level, parent):
    goal = Goal(id=str(uuid.uuid4()), name=name, owner_id=root.owner_id, root_id=root.id,
                parent_id=parent.id, level_id=level.id)
    db_session.add(goal)
    return goal


def _session(db_session, root, moment, seconds, *goals):
    session_id = str(uuid.uuid4())
    db_session.execute(Session.__table__.insert(), [dict(
        id=session_id, root_id=root.id, owner_id=root.owner_id, name='Practice', session_start=moment,
        session_end=moment + timedelta(seconds=seconds), total_duration_seconds=seconds, completed=True, created_at=moment,
    )])
    db_session.execute(session_goals.insert(), [dict(session_id=session_id, goal_id=goal.id, goal_type='Goal') for goal in goals])


@pytest.fixture
def tree(db_session, sample_ultimate_goal):
    """Guitar (rank 0) → Blues (1) → Chug (2); Guitar → Arpeggios (1). Sessions link to any level."""
    root = sample_ultimate_goal
    root.level_id = _level(db_session, 'Ultimate', 0).id
    long_level, mid_level = _level(db_session, 'Long Term', 1), _level(db_session, 'Mid Term', 2)
    db_session.flush()
    blues = _goal(db_session, root, 'Blues', long_level, root)
    db_session.flush()
    chug = _goal(db_session, root, 'Chug', mid_level, blues)
    arpeggios = _goal(db_session, root, 'Arpeggios', long_level, root)
    db_session.flush()
    monday = datetime(2026, 3, 2, 12, 0)
    _session(db_session, root, monday, 3600, chug)                   # only on the deep goal
    _session(db_session, root, monday, 1800, blues, chug)            # on a goal and its child: once for Blues
    _session(db_session, root, monday, 600, root)                    # only on the root: Guitar · other
    _session(db_session, root, monday, 900, blues, arpeggios)        # shared by siblings: counts for both
    _session(db_session, root, monday + timedelta(days=14), 1200, arpeggios)
    db_session.commit()
    return {'root': root, 'blues': blues, 'chug': chug, 'arpeggios': arpeggios}


def _rollup(client, root, **params):
    response = client.get(f'/api/{root.id}/goals/analytics', query_string={
        'charts': 'true', 'rollup': 'true', 'duration_mode': 'session', 'grain': 'week', 'timezone': 'UTC', **params,
    })
    assert response.status_code == 200, response.get_json()
    return response.get_json()['time_rollup']


def _totals(rollup):
    return {item['key']: sum(bucket['duration_seconds'] for bucket in item['buckets']) for item in rollup['series']}


def test_default_level_stacks_children_under_their_level_goal_once(authed_client, tree):
    rollup = _rollup(authed_client, tree['root'])
    assert rollup['rank'] == 1
    assert _totals(rollup) == {
        tree['blues'].id: 3600 + 1800 + 900,
        tree['arpeggios'].id: 900 + 1200,
        f"{tree['root'].id}:other": 600,
    }
    # The shared sibling session counts once in the true totals.
    assert sum(total['duration_seconds'] for total in rollup['unique_totals']) == 3600 + 1800 + 600 + 900 + 1200
    assert (rollup['first_bucket'], rollup['last_bucket']) == ('2026-03-02', '2026-03-16')
    assert [(level['rank'], level['series_count']) for level in rollup['levels']] == [(0, 1), (1, 2), (2, 1)]


def test_a_deeper_level_shows_leftover_time_on_the_goals_above_it(authed_client, tree):
    rollup = _rollup(authed_client, tree['root'], rollup_rank=2)
    totals = _totals(rollup)
    assert totals[tree['chug'].id] == 3600 + 1800
    # Blues' 1800s session is already shown under Chug; only its sibling-shared session is left.
    assert totals[f"{tree['blues'].id}:other"] == 900
    by_key = {item['key']: item for item in rollup['series']}
    assert by_key[f"{tree['arpeggios'].id}:other"]['remainder'] is False  # a leaf: shown by name


def test_drilling_into_a_goal_shows_its_children_and_a_breadcrumb(authed_client, tree):
    rollup = _rollup(authed_client, tree['root'], focus_goal_id=tree['blues'].id)
    assert _totals(rollup) == {tree['chug'].id: 3600 + 1800, f"{tree['blues'].id}:other": 900}
    assert [crumb['name'] for crumb in rollup['breadcrumb']] == [tree['root'].name, 'Blues']
    assert next(item for item in rollup['series'] if item['key'] == tree['chug'].id)['drillable'] is False


def test_the_range_bounds_the_series_and_the_axis(authed_client, tree):
    rollup = _rollup(authed_client, tree['root'], range_start='2026-03-10T00:00:00Z', range_end='2026-03-20T23:59:59Z', grain='auto')
    assert rollup['grain'] == 'day'
    # No level splits the time, so Automatic picks the highest level below the top that has any.
    assert rollup['rank'] == 1
    assert _totals(rollup) == {tree['arpeggios'].id: 1200}
    assert (rollup['first_bucket'], rollup['last_bucket']) == ('2026-03-10', '2026-03-20')


@pytest.mark.parametrize('query, status', [
    ('rollup_rank=top', 400), ('duration_mode=minutes', 400), ('focus_goal_id=missing', 404),
])
def test_rollup_validates_its_parameters(authed_client, tree, query, status):
    response = authed_client.get(f"/api/{tree['root'].id}/goals/analytics?charts=true&rollup=true&{query}")
    assert response.status_code == status
