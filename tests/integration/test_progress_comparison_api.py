"""Tag-aware progress: same-tags predecessors, set-group pairing, and per-instance overrides."""

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivitySet,
    Goal,
    MetricDefinition,
    MetricValue,
    Session,
)

BASE = datetime(2026, 9, 1, 12, tzinfo=timezone.utc)


@pytest.fixture
def history(db_session, sample_ultimate_goal):
    """A set-based activity with one tracked metric and helpers to log past instances."""
    root = sample_ultimate_goal
    activity = ActivityDefinition(id=str(uuid4()), root_id=root.id, name='Squat', has_sets=True, has_metrics=True)
    db_session.add(activity)
    db_session.flush()
    metric = MetricDefinition(
        id=str(uuid4()), activity_id=activity.id, root_id=root.id, name='Weight', unit='kg',
        is_multiplicative=False, track_progress=True, is_active=True,
    )
    db_session.add(metric)
    db_session.commit()

    def log(day, sets, *, completed=True):
        """``sets``: list of (weight, [tag ids]) pairs; returns the instance."""
        when = BASE + timedelta(days=day)
        session = Session(
            id=str(uuid4()), owner_id=root.owner_id, root_id=root.id, name=f'Day {day}',
            completed=True, session_start=when, created_at=when, attributes=json.dumps({}),
        )
        db_session.add(session)
        db_session.flush()
        instance = ActivityInstance(
            id=str(uuid4()), root_id=root.id, session_id=session.id, activity_definition_id=activity.id,
            created_at=when, time_start=when, time_stop=when if completed else None, completed=completed,
            data=json.dumps({}),
        )
        db_session.add(instance)
        db_session.flush()
        for index, (weight, _tags) in enumerate(sets):
            activity_set = ActivitySet(activity_instance_id=instance.id, sort_order=index, status='completed')
            db_session.add(activity_set)
            db_session.flush()
            db_session.add(MetricValue(
                activity_instance_id=instance.id, activity_set_id=activity_set.id,
                metric_definition_id=metric.id, value=weight,
            ))
        db_session.commit()
        return instance

    return {'root_id': root.id, 'activity': activity, 'metric': metric, 'log': log}


def _tag(client, root_id, name):
    response = client.post(f'/api/{root_id}/activity-tags', json={'name': name})
    assert response.status_code == 201, response.get_json()
    return response.get_json()['id']


def _tag_instance(client, root_id, instance_id, tag_ids):
    response = client.put(f'/api/{root_id}/activity-instances/{instance_id}/tags', json={'tag_ids': tag_ids})
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def _tag_set(client, root_id, set_id, tag_ids):
    response = client.put(f'/api/{root_id}/activity-sets/{set_id}/tags', json={'tag_ids': tag_ids})
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def _progress(client, root_id, instance_id):
    response = client.get(f'/api/{root_id}/activity-instances/{instance_id}/progress')
    assert response.status_code == 200, response.get_json()
    return response.get_json()


@pytest.mark.integration
def test_instances_compare_with_the_latest_past_instance_with_the_same_tags(authed_client, history):
    root_id, log = history['root_id'], history['log']
    heavy = _tag(authed_client, root_id, 'Heavy')
    heavy_day = log(0, [(100, [])])
    _tag_instance(authed_client, root_id, heavy_day.id, [heavy])
    untagged_day = log(1, [(60, [])])
    current = log(2, [(105, [])])

    assigned = _tag_instance(authed_client, root_id, current.id, [heavy])
    # The assignment response carries the re-based comparison.
    assert assigned['progress_comparison']['previous_instance_id'] == heavy_day.id
    assert assigned['progress_comparison']['comparison_context']['mode'] == 'same_tags'
    assert assigned['progress_comparison']['comparison_context']['tag_ids'] == [heavy]

    untagged = _tag_instance(authed_client, root_id, current.id, [])
    assert untagged['progress_comparison']['previous_instance_id'] == untagged_day.id


@pytest.mark.integration
def test_completed_predecessors_win_within_the_comparison_context(authed_client, history):
    root_id, log = history['root_id'], history['log']
    completed = log(0, [(100, [])])
    log(1, [(90, [])], completed=False)
    current = log(2, [(110, [])])
    assert _progress(authed_client, root_id, current.id)['previous_instance_id'] == completed.id


@pytest.mark.integration
def test_each_set_group_compares_with_its_latest_earlier_set_group(authed_client, db_session, history):
    root_id, log = history['root_id'], history['log']
    warmup = _tag(authed_client, root_id, 'Warmup')
    older = log(0, [(50, []), (100, [])])
    _tag_set(authed_client, root_id, older.sets[0].id, [warmup])
    newer = log(1, [(110, [])])  # working sets only
    current = log(2, [(55, []), (120, [])])
    _tag_set(authed_client, root_id, current.sets[0].id, [warmup])

    comparison = _progress(authed_client, root_id, current.id)
    assert comparison['previous_instance_id'] == newer.id
    sets = {entry['set_index']: entry for entry in comparison['metric_comparisons'][0]['set_comparisons']}
    # The warmup set pairs with the older session's warmup; the working set with the newer working set.
    assert (sets[0]['previous_instance_id'], sets[0]['previous_set_index'], sets[0]['previous_value']) == (older.id, 0, 50.0)
    assert (sets[1]['previous_instance_id'], sets[1]['previous_set_index'], sets[1]['previous_value']) == (newer.id, 0, 110.0)
    assert sets[0]['improved'] and sets[1]['improved']


@pytest.mark.integration
def test_per_instance_override_rebases_only_that_instance(authed_client, history):
    root_id, log = history['root_id'], history['log']
    heavy = _tag(authed_client, root_id, 'Heavy')
    light = _tag(authed_client, root_id, 'Light')
    heavy_day = log(0, [(100, [])])
    _tag_instance(authed_client, root_id, heavy_day.id, [heavy])
    light_day = log(1, [(60, [])])
    _tag_instance(authed_client, root_id, light_day.id, [light])
    current = log(2, [(105, [])])
    _tag_instance(authed_client, root_id, current.id, [heavy])
    sibling = log(3, [(108, [])])
    _tag_instance(authed_client, root_id, sibling.id, [heavy])

    url = f'/api/{root_id}/activity-instances/{current.id}/progress-comparison'
    all_history = authed_client.put(url, json={'mode': 'all', 'version': 1})
    assert all_history.status_code == 200, all_history.get_json()
    assert all_history.get_json()['progress_comparison']['previous_instance_id'] == light_day.id
    assert all_history.get_json()['comparison_context'] == {
        'mode': 'all', 'tag_ids': [], 'tags': [], 'same_template': False, 'same_program_day': False,
        'template': None, 'program_day': None, 'remembered_for': None, 'version': 2,
    }

    stale = authed_client.put(url, json={'mode': 'same_tags', 'version': 1})
    assert stale.status_code == 409
    assert stale.get_json()['details']['current']['mode'] == 'all'

    chosen = authed_client.put(url, json={'mode': 'tags', 'tag_ids': [light], 'version': 2})
    assert chosen.get_json()['progress_comparison']['previous_instance_id'] == light_day.id
    assert [tag['name'] for tag in chosen.get_json()['comparison_context']['tags']] == ['Light']
    assert authed_client.put(url, json={'mode': 'all', 'tag_ids': [light]}).status_code == 400

    # Other instances keep their own (default) context.
    assert _progress(authed_client, root_id, sibling.id)['previous_instance_id'] == current.id
    reset = authed_client.put(url, json={'mode': 'same_tags'})
    assert reset.get_json()['progress_comparison']['previous_instance_id'] == heavy_day.id


@pytest.mark.integration
def test_override_tags_follow_a_merge(authed_client, history):
    root_id, log = history['root_id'], history['log']
    light = _tag(authed_client, root_id, 'Light')
    easy = _tag(authed_client, root_id, 'Easy')
    current = log(0, [(100, [])])
    authed_client.put(
        f'/api/{root_id}/activity-instances/{current.id}/progress-comparison',
        json={'mode': 'tags', 'tag_ids': [easy]},
    )
    catalog = {tag['id']: tag for tag in authed_client.get(f'/api/{root_id}/activity-tags').get_json()['tags']}
    merged = authed_client.post(f'/api/{root_id}/activity-tags/merge', json={
        'target_id': light, 'source_ids': [easy],
        'versions': {light: catalog[light]['version'], easy: catalog[easy]['version']},
    })
    assert merged.status_code == 200, merged.get_json()
    context = _progress(authed_client, root_id, current.id)['comparison_context']
    assert (context['mode'], context['tag_ids']) == ('tags', [light])


@pytest.mark.integration
def test_timeline_lists_only_matching_past_instances_and_previews_without_saving(authed_client, history):
    root_id, log, activity = history['root_id'], history['log'], history['activity']
    heavy = _tag(authed_client, root_id, 'Heavy')
    for day in range(4):
        past = log(day, [(100 + day, [])])
        if day % 2 == 0:
            _tag_instance(authed_client, root_id, past.id, [heavy])
    current = log(5, [(110, [])])
    _tag_instance(authed_client, root_id, current.id, [heavy])
    url = f'/api/{root_id}/activities/{activity.id}/progress-timeline'

    timeline = authed_client.get(f'{url}?instance_id={current.id}').get_json()
    assert (timeline['total'], timeline['total_all']) == (2, 4)
    assert all([tag['id'] for tag in item['tags']] == [heavy] for item in timeline['items'])
    assert timeline['comparison_context']['mode'] == 'same_tags'

    preview = authed_client.get(f'{url}?instance_id={current.id}&mode=all').get_json()
    assert (preview['total'], preview['comparison_context']['preview']) == (4, True)
    untagged = authed_client.get(f'{url}?instance_id={current.id}&mode=tags').get_json()
    assert untagged['total'] == 2
    # Previewing never saves the choice.
    assert _progress(authed_client, root_id, current.id)['comparison_context']['mode'] == 'same_tags'
    assert authed_client.get(f'{url}?mode=sideways').status_code == 400


@pytest.mark.integration
def test_comparison_endpoint_is_owner_scoped(authed_client, db_session, history, test_user):
    other_root = Goal(id=str(uuid4()), name='Other', owner_id=test_user.id, level_id=db_session.get(Goal, history['root_id']).level_id)
    other_root.root_id = other_root.id
    db_session.add(other_root)
    db_session.commit()
    current = history['log'](0, [(100, [])])
    response = authed_client.put(
        f'/api/{other_root.id}/activity-instances/{current.id}/progress-comparison', json={'mode': 'all'},
    )
    assert response.status_code == 404


# --- Scope: same session template / program day, remembered defaults, chart series ---------------

from datetime import date  # noqa: E402

from models import ActivityProgressDefault, Program, ProgramDay, SessionTemplate  # noqa: E402


@pytest.fixture
def scoped(db_session, history):
    """Two templates and two program days, and a logger that files sessions under them."""
    root_id = history['root_id']
    templates = [SessionTemplate(id=str(uuid4()), name=name, root_id=root_id, template_data={}) for name in ('Upper', 'Lower')]
    program = Program(
        id=str(uuid4()), root_id=root_id, name='Block', start_date=date(2026, 9, 1), end_date=date(2026, 12, 1),
        weekly_schedule={},
    )
    db_session.add_all([*templates, program])
    db_session.flush()
    days = [ProgramDay(id=str(uuid4()), program_id=program.id, name=name) for name in ('Day A', 'Day B')]
    db_session.add_all(days)
    db_session.commit()

    def log(day, weight, *, template=None, program_day=None):
        instance = history['log'](day, [(weight, [])])
        session = db_session.get(Session, instance.session_id)
        session.template_id = template.id if template else None
        session.program_day_id = program_day.id if program_day else None
        db_session.commit()
        return instance

    return {**history, 'templates': templates, 'days': days, 'log_in': log}


def _compare(client, root_id, instance_id, **body):
    return client.put(f'/api/{root_id}/activity-instances/{instance_id}/progress-comparison', json={'mode': 'same_tags', **body})


@pytest.mark.integration
def test_template_and_program_day_scopes_narrow_comparisons_independently_and_together(authed_client, scoped):
    root_id, activity = scoped['root_id'], scoped['activity']
    upper, lower = scoped['templates']
    day_a, day_b = scoped['days']
    log = scoped['log_in']
    upper_a = log(0, 100, template=upper, program_day=day_a)
    upper_b = log(1, 101, template=upper, program_day=day_b)
    lower_a = log(2, 102, template=lower, program_day=day_a)
    current = log(3, 110, template=upper, program_day=day_a)

    assert _progress(authed_client, root_id, current.id)['previous_instance_id'] == lower_a.id
    template_only = _compare(authed_client, root_id, current.id, same_template=True).get_json()
    assert template_only['progress_comparison']['previous_instance_id'] == upper_b.id
    assert template_only['comparison_context']['template'] == {'id': upper.id, 'name': 'Upper', 'color': None}
    day_only = _compare(authed_client, root_id, current.id, same_program_day=True).get_json()
    assert day_only['progress_comparison']['previous_instance_id'] == lower_a.id
    both = _compare(authed_client, root_id, current.id, same_template=True, same_program_day=True).get_json()
    assert both['progress_comparison']['previous_instance_id'] == upper_a.id
    assert both['comparison_context']['remembered_for'] == 'Day A'

    url = f'/api/{root_id}/activities/{activity.id}/progress-timeline?instance_id={current.id}'
    timeline = authed_client.get(url).get_json()
    assert (timeline['total'], timeline['total_all']) == (1, 3)
    assert timeline['items'][0]['session_template_id'] == upper.id
    assert authed_client.get(f'{url}&same_program_day=false').get_json()['total'] == 2
    assert authed_client.get(f'{url}&same_template=maybe').status_code == 400


@pytest.mark.integration
def test_scope_needs_a_template_or_program_day(authed_client, scoped):
    current = scoped['log_in'](0, 100)
    response = _compare(authed_client, scoped['root_id'], current.id, same_template=True)
    assert response.status_code == 422
    assert response.get_json()['details']['code'] == 'scope_unavailable'


@pytest.mark.integration
def test_a_comparison_is_remembered_for_the_next_instance_in_the_same_template_and_day(authed_client, db_session, scoped):
    root_id, activity = scoped['root_id'], scoped['activity']
    upper, lower = scoped['templates']
    day_a = scoped['days'][0]
    log = scoped['log_in']
    heavy = _tag(authed_client, root_id, 'Heavy')
    first = log(0, 100, template=upper, program_day=day_a)
    _compare(authed_client, root_id, first.id, mode='tags', tag_ids=[heavy], same_template=True)
    remembered = db_session.query(ActivityProgressDefault).filter_by(activity_definition_id=activity.id).one()
    assert (remembered.session_template_id, remembered.program_day_id, remembered.compare_mode) == (upper.id, day_a.id, 'tags')

    # The database pre-applies it to the activity's next instance in the same template and day.
    session = Session(
        id=str(uuid4()), owner_id=db_session.get(Goal, root_id).owner_id, root_id=root_id, name='Next',
        completed=True, session_start=BASE + timedelta(days=1), template_id=upper.id, program_day_id=day_a.id,
    )
    db_session.add(session)
    db_session.commit()
    created = ActivityInstance(id=str(uuid4()), root_id=root_id, session_id=session.id, activity_definition_id=activity.id)
    db_session.add(created)
    db_session.commit()
    context = _progress(authed_client, root_id, created.id)['comparison_context']
    assert (context['mode'], context['tag_ids'], context['same_template'], context['same_program_day']) == ('tags', [heavy], True, False)

    # A different template starts plain, and resetting forgets the default.
    elsewhere = log(2, 100, template=lower, program_day=day_a)
    assert _progress(authed_client, root_id, elsewhere.id)['comparison_context']['mode'] == 'same_tags'
    _compare(authed_client, root_id, first.id)
    assert db_session.query(ActivityProgressDefault).filter_by(activity_definition_id=activity.id).count() == 0


@pytest.mark.integration
def test_remembered_tags_follow_a_merge(authed_client, db_session, scoped):
    root_id = scoped['root_id']
    upper = scoped['templates'][0]
    light = _tag(authed_client, root_id, 'Light')
    easy = _tag(authed_client, root_id, 'Easy')
    current = scoped['log_in'](0, 100, template=upper)
    _compare(authed_client, root_id, current.id, mode='tags', tag_ids=[easy])
    catalog = {tag['id']: tag for tag in authed_client.get(f'/api/{root_id}/activity-tags').get_json()['tags']}
    authed_client.post(f'/api/{root_id}/activity-tags/merge', json={
        'target_id': light, 'source_ids': [easy],
        'versions': {light: catalog[light]['version'], easy: catalog[easy]['version']},
    })
    db_session.expire_all()
    remembered = db_session.query(ActivityProgressDefault).one()
    assert [tag.id for tag in remembered.compare_tags] == [light]


@pytest.mark.integration
def test_progress_series_plots_scoped_history_then_the_current_instance(authed_client, db_session, scoped):
    root_id, activity, metric = scoped['root_id'], scoped['activity'], scoped['metric']
    upper, lower = scoped['templates']
    log = scoped['log_in']
    older = log(0, 90, template=upper)
    log(1, 95, template=lower)
    newer = log(2, 100, template=upper)
    current = log(3, 110, template=upper)
    _compare(authed_client, root_id, current.id, same_template=True)

    url = f'/api/{root_id}/activities/{activity.id}/progress-series?instance_id={current.id}'
    series = authed_client.get(url).get_json()
    assert [row['id'] for row in series['instances']] == [older.id, newer.id, current.id]
    assert series['current_instance_id'] == current.id
    assert series['chart']['source'] == 'activity'
    assert series['chart']['condition']['measure'] == 'sets'
    assert series['chart']['condition']['rules'][0]['metric_definition_id'] == metric.id
    limited = authed_client.get(f'{url}&limit=1').get_json()
    assert [row['id'] for row in limited['instances']] == [newer.id, current.id]
    assert limited['truncated'] is True
    assert len(authed_client.get(f'{url}&same_template=false').get_json()['instances']) == 4
