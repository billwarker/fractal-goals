import json
import uuid
from datetime import date, datetime, time, timedelta, timezone

import pytest

from models import (
    ActivityInstance,
    Program,
    ProgramBlock,
    ProgramDay,
    ProgramDayOccurrenceSchedule,
    ProgramDayTemplate,
    ProgramSessionPlan,
    Session,
    SessionTemplate,
    User,
)
from services.plan_sections import merge_template_changes, typed_template_sections
from services.program_session_plans import CANDIDATE_LOOKBACK_DAYS, MAX_OCCURRENCE_WINDOW_DAYS
from tests.conftest import session_headers_for


def _plan(weight, reps, *values, notes=None):
    plan = {'schema': 1, 'sets': [
        {'metrics': [
            {'metric_id': weight.id, 'split_id': None, 'value': load},
            {'metric_id': reps.id, 'split_id': None, 'value': count},
        ], 'notes': None}
        for load, count in values
    ]}
    if notes:
        plan['notes'] = notes
    return plan


@pytest.fixture
def plan_world(db_session, test_user, sample_goal_hierarchy, sample_activity_definition):
    """A weekly 'Upper A' day on Mondays using one Bench template.

    ``mondays`` are the next four Mondays (plannable); ``past_mondays`` are the two before
    this week's, which are read-only history.
    """
    root = sample_goal_hierarchy['ultimate']
    today = datetime.now(timezone.utc).date()
    this_monday = today - timedelta(days=today.weekday())
    first_monday = this_monday - timedelta(days=14)
    last_day = this_monday + timedelta(days=7 * 4 + 6)
    program = Program(
        root_id=root.id, name='Strength',
        start_date=datetime.combine(first_monday, time.min),
        end_date=datetime.combine(last_day, time.max),
        weekly_schedule={},
    )
    db_session.add(program)
    db_session.flush()
    block = ProgramBlock(program_id=program.id, name='Block 1', start_date=first_monday, end_date=last_day)
    db_session.add(block)
    db_session.flush()
    by_name = {metric.name: metric for metric in sample_activity_definition.metric_definitions}
    template = SessionTemplate(
        id=str(uuid.uuid4()), name='Bench Day', root_id=root.id,
        template_data=json.dumps({'session_type': 'normal', 'sections': [{
            'name': 'Main',
            'items': [{
                'type': 'activity', 'activity_definition_id': sample_activity_definition.id,
                'name': 'Bench Press', 'item_key': 'bench',
                'prescription': _plan(by_name['Weight'], by_name['Reps'], (100, 5)),
            }],
        }]}),
    )
    db_session.add(template)
    day = ProgramDay(program_id=block.program_id, name='Upper A', day_of_week=['Monday'])
    db_session.add(day)
    db_session.flush()
    db_session.add(ProgramDayTemplate(program_day_id=day.id, session_template_id=template.id, is_required=True, order=0))
    db_session.commit()
    mondays = [this_monday + timedelta(days=7 * week) for week in range(1, 5)]
    past_mondays = [first_monday, first_monday + timedelta(days=7)]
    return {
        'root': root, 'program': program, 'block': block, 'day': day, 'template': template,
        'mondays': mondays, 'past_mondays': past_mondays, 'weight': by_name['Weight'], 'reps': by_name['Reps'],
        'activity': sample_activity_definition,
    }


def _plan_url(world, plan_date, suffix=''):
    return (
        f"/api/{world['root'].id}/programs/{world['program'].id}/days/{world['day'].id}"
        f"/plans/{world['template'].id}/{plan_date.isoformat()}{suffix}"
    )


def _day_plans(client, world, plan_date):
    response = client.get(
        f"/api/{world['root'].id}/programs/{world['program'].id}/days/{world['day'].id}/plans"
        f"?date={plan_date.isoformat()}"
    )
    assert response.status_code == 200, response.get_json()
    return response.get_json()['plans'][0]


def _occurrences(client, world, query=''):
    """The world's program day dates from the program-wide occurrence listing."""
    response = client.get(f"/api/{world['root'].id}/programs/{world['program'].id}/plan-occurrences{query}")
    assert response.status_code == 200, response.get_json()
    [day] = [entry for entry in response.get_json()['days'] if entry['day_id'] == world['day'].id]
    return day['dates']


def _save(client, world, plan_date, sections, row_version=None):
    body = {'sections': sections}
    if row_version is not None:
        body['row_version'] = row_version
    return client.put(_plan_url(world, plan_date), json=body)


def _with_values(sections, world, *values):
    updated = json.loads(json.dumps(sections))
    updated[0]['items'][0]['prescription'] = _plan(world['weight'], world['reps'], *values)
    return updated


def test_unplanned_occurrence_is_seeded_from_template_without_storing(authed_client, db_session, plan_world):
    entry = _day_plans(authed_client, plan_world, plan_world['mondays'][0])

    assert entry['source'] == 'template'
    assert entry['plan_id'] is None and entry['row_version'] is None
    assert entry['sections'][0]['items'][0]['prescription']['sets'][0]['metrics'][0]['value'] == 100
    assert db_session.query(ProgramSessionPlan).count() == 0


def test_week_two_seeds_from_week_one_and_keeps_week_one_as_ghost_values(authed_client, plan_world):
    week1, week2, week3 = plan_world['mondays'][:3]
    seed = _day_plans(authed_client, plan_world, week1)
    saved = _save(authed_client, plan_world, week1, _with_values(seed['sections'], plan_world, (105, 5), (105, 5)))
    assert saved.status_code == 200, saved.get_json()

    entry = _day_plans(authed_client, plan_world, week2)
    assert entry['source'] == 'previous_plan'
    assert entry['seeded_from_date'] == week1.isoformat()
    assert len(entry['sections'][0]['items'][0]['prescription']['sets']) == 2
    assert entry['previous']['date'] == week1.isoformat()

    # Seeding skips the unplanned week in between and uses the latest stored plan.
    assert _day_plans(authed_client, plan_world, week3)['seeded_from_date'] == week1.isoformat()


def test_save_uses_optimistic_concurrency(authed_client, plan_world):
    monday = plan_world['mondays'][0]
    sections = _day_plans(authed_client, plan_world, monday)['sections']
    created = _save(authed_client, plan_world, monday, _with_values(sections, plan_world, (105, 5))).get_json()

    stale_create = _save(authed_client, plan_world, monday, sections)
    assert stale_create.status_code == 409

    updated = _save(authed_client, plan_world, monday, _with_values(sections, plan_world, (110, 3)),
                    row_version=created['row_version'])
    assert updated.status_code == 200
    assert updated.get_json()['row_version'] == created['row_version'] + 1

    stale_update = _save(authed_client, plan_world, monday, sections, row_version=created['row_version'])
    assert stale_update.status_code == 409


def test_plan_keeps_template_sections_and_rejects_foreign_metrics(authed_client, plan_world):
    monday = plan_world['mondays'][0]
    sections = _day_plans(authed_client, plan_world, monday)['sections']

    renamed = json.loads(json.dumps(sections))
    renamed[0]['name'] = 'Something else'
    assert _save(authed_client, plan_world, monday, renamed).status_code == 400

    foreign = json.loads(json.dumps(sections))
    foreign[0]['items'][0]['prescription'] = {'schema': 1, 'sets': [
        {'metrics': [{'metric_id': str(uuid.uuid4()), 'value': 1}]},
    ]}
    response = _save(authed_client, plan_world, monday, foreign)
    assert response.status_code == 400
    assert 'does not belong' in response.get_json()['error']


def test_plan_rejects_dates_that_are_not_occurrences(authed_client, plan_world):
    tuesday = plan_world['mondays'][0] + timedelta(days=1)
    response = authed_client.get(
        f"/api/{plan_world['root'].id}/programs/{plan_world['program'].id}/days/{plan_world['day'].id}"
        f"/plans?date={tuesday.isoformat()}"
    )
    assert response.status_code == 404
    assert _save(authed_client, plan_world, tuesday, [{'name': 'Main', 'items': []}]).status_code == 404


def test_reset_falls_back_to_seed(authed_client, db_session, plan_world):
    monday = plan_world['mondays'][1]
    sections = _day_plans(authed_client, plan_world, monday)['sections']
    _save(authed_client, plan_world, monday, _with_values(sections, plan_world, (120, 1)))

    response = authed_client.delete(_plan_url(plan_world, monday))

    assert response.status_code == 200
    assert response.get_json()['source'] == 'template'
    assert db_session.query(ProgramSessionPlan).filter(ProgramSessionPlan.deleted_at.is_(None)).count() == 0


def test_dormant_plans_neither_show_nor_seed(authed_client, db_session, plan_world):
    week1, week2 = plan_world['mondays'][:2]
    sections = _day_plans(authed_client, plan_world, week1)['sections']
    _save(authed_client, plan_world, week1, _with_values(sections, plan_world, (140, 1)))
    # The day moves from Mondays to one explicit date: week 1's plan becomes dormant.
    day = plan_world['day']
    day.day_of_week = []
    db_session.add(ProgramDayOccurrenceSchedule(program_day_id=day.id, date=week2))
    db_session.commit()

    entry = _day_plans(authed_client, plan_world, week2)
    occurrences = _occurrences(authed_client, plan_world)

    assert entry['source'] == 'template'
    assert [row['date'] for row in occurrences] == [week2.isoformat()]


def test_occurrence_strip_reports_plan_states(authed_client, db_session, test_user, plan_world):
    week1, week2 = plan_world['mondays'][:2]
    sections = _day_plans(authed_client, plan_world, week1)['sections']
    week1_plan = _save(authed_client, plan_world, week1, _with_values(sections, plan_world, (100, 5))).get_json()
    _save(authed_client, plan_world, week2, _with_values(sections, plan_world, (105, 5)))
    db_session.add(Session(owner_id=test_user.id, root_id=plan_world['root'].id, name='Bench',
                           template_id=plan_world['template'].id, program_session_plan_id=week1_plan['plan_id']))
    db_session.commit()

    states = {row['date']: row['templates'][0]['state'] for row in _occurrences(authed_client, plan_world)}
    assert [states[monday.isoformat()] for monday in plan_world['mondays']] == ['executed', 'planned', 'seeded', 'seeded']
    assert states[plan_world['past_mondays'][0].isoformat()] == 'seeded'


def test_occurrence_window_covers_the_program_and_caps_very_long_ones():
    from services.program_session_plans import ProgramSessionPlanService as Service

    today = date(2026, 9, 27)
    short = Program(start_date=datetime(2026, 9, 1), end_date=datetime(2026, 10, 31))
    assert Service._occurrence_window(short, today) == (date(2026, 9, 1), date(2026, 10, 31))

    long = Program(start_date=datetime(2025, 1, 1), end_date=datetime(2027, 12, 31))
    start, end = Service._occurrence_window(long, today)
    assert (end - start).days + 1 == MAX_OCCURRENCE_WINDOW_DAYS
    assert start <= today <= end

    ending_soon = Program(start_date=datetime(2024, 1, 1), end_date=datetime(2026, 10, 1))
    start, end = Service._occurrence_window(ending_soon, today)
    assert end == date(2026, 10, 1) and (end - start).days + 1 == MAX_OCCURRENCE_WINDOW_DAYS

def test_session_from_virtual_plan_materializes_it_and_snapshots_values(
    authed_client, db_session, plan_world,
):
    monday = plan_world['mondays'][1]
    response = authed_client.post(f"/api/{plan_world['root'].id}/sessions", json={
        'name': 'Bench Day',
        'template_id': plan_world['template'].id,
        'plan_ref': {'program_day_id': plan_world['day'].id, 'date': monday.isoformat()},
    })
    assert response.status_code == 201, response.get_json()
    created = response.get_json()

    plan = db_session.query(ProgramSessionPlan).one()
    assert created['program_session_plan_id'] == plan.id
    assert created['attributes']['session_data']['program_session_plan']['date'] == monday.isoformat()
    instance = db_session.query(ActivityInstance).filter_by(session_id=created['id']).one()
    assert instance.prescription['sets'][0]['metrics'][0]['value'] == 100
    assert len(instance.sets) == 1


def test_editing_a_plan_after_execution_never_changes_the_session(authed_client, db_session, plan_world):
    monday = plan_world['mondays'][0]
    sections = _day_plans(authed_client, plan_world, monday)['sections']
    saved = _save(authed_client, plan_world, monday, _with_values(sections, plan_world, (110, 5), (110, 5))).get_json()
    created = authed_client.post(f"/api/{plan_world['root'].id}/sessions", json={
        'name': 'Bench Day', 'template_id': plan_world['template'].id,
        'program_session_plan_id': saved['plan_id'],
    }).get_json()

    _save(authed_client, plan_world, monday, _with_values(sections, plan_world, (200, 1)),
          row_version=saved['row_version'])

    instance = db_session.query(ActivityInstance).filter_by(session_id=created['id']).one()
    assert [s['metrics'][0]['value'] for s in instance.prescription['sets']] == [110, 110]
    assert len(instance.sets) == 2


def test_session_rejects_plan_of_another_template(authed_client, db_session, plan_world):
    other = SessionTemplate(id=str(uuid.uuid4()), name='Other', root_id=plan_world['root'].id,
                            template_data=json.dumps({'session_type': 'normal', 'sections': [{'name': 'Main', 'items': []}]}))
    db_session.add(other)
    db_session.commit()
    monday = plan_world['mondays'][0]
    sections = _day_plans(authed_client, plan_world, monday)['sections']
    saved = _save(authed_client, plan_world, monday, sections).get_json()

    response = authed_client.post(f"/api/{plan_world['root'].id}/sessions", json={
        'name': 'Mismatch', 'template_id': other.id, 'program_session_plan_id': saved['plan_id'],
    })

    assert response.status_code == 400


def test_candidates_offer_today_then_unexecuted_plans_within_lookback(authed_client, db_session, plan_world):
    template = plan_world['template']
    today = plan_world['mondays'][3]
    inside = today - timedelta(days=CANDIDATE_LOOKBACK_DAYS)  # a Monday: boundary is inclusive
    outside = inside - timedelta(days=1)  # the Sunday before, scheduled explicitly
    db_session.add(ProgramDayOccurrenceSchedule(program_day_id=plan_world['day'].id, date=outside))
    db_session.commit()
    for plan_date in (inside, outside):
        sections = _day_plans(authed_client, plan_world, plan_date)['sections']
        assert _save(authed_client, plan_world, plan_date, sections).status_code == 200
    assert db_session.query(ProgramSessionPlan).count() == 2

    response = authed_client.get(
        f"/api/{plan_world['root'].id}/session-plans/candidates?template_id={template.id}&date={today.isoformat()}"
    )

    candidates = response.get_json()['candidates']
    assert [(row['date'], row['is_today'], row['plan_id'] is None) for row in candidates] == [
        (today.isoformat(), True, True),
        (inside.isoformat(), False, False),
    ]


def test_pull_template_changes_keeps_planned_values_and_plan_added_items(authed_client, db_session, plan_world):
    monday = plan_world['mondays'][0]
    sections = _day_plans(authed_client, plan_world, monday)['sections']
    planned = _with_values(sections, plan_world, (150, 2))
    planned[0]['items'].append({
        'type': 'activity', 'activity_definition_id': plan_world['activity'].id,
        'name': 'Bench Press (paused)', 'added_in_plan': True,
    })
    saved = _save(authed_client, plan_world, monday, planned).get_json()
    template = plan_world['template']
    data = json.loads(template.template_data)
    data['sections'][0]['items'].insert(0, {
        'type': 'activity', 'activity_definition_id': plan_world['activity'].id,
        'name': 'Warm-up bench', 'item_key': 'warmup',
    })
    template.template_data = json.dumps(data)
    template.revision = 2
    db_session.commit()
    assert _day_plans(authed_client, plan_world, monday)['template_changed'] is True

    response = authed_client.post(_plan_url(plan_world, monday, '/pull-template'),
                                  json={'row_version': saved['row_version']})

    assert response.status_code == 200, response.get_json()
    entry = response.get_json()
    items = entry['sections'][0]['items']
    assert [item['name'] for item in items] == ['Warm-up bench', 'Bench Press', 'Bench Press (paused)']
    assert items[1]['prescription']['sets'][0]['metrics'][0]['value'] == 150
    assert entry['template_changed'] is False


def test_merge_template_changes_drops_removed_template_items():
    plan_sections = [{'name': 'Main', 'items': [{'type': 'activity', 'item_key': 'gone', 'prescription': {'notes': 'x'}}]}]
    template_sections = [{'name': 'Main', 'items': [{'type': 'activity', 'item_key': 'new'}]}]

    assert merge_template_changes(plan_sections, template_sections) == template_sections


def test_other_users_cannot_read_or_write_plans(client, db_session, plan_world):
    intruder = User(id=str(uuid.uuid4()), username='intruder', email='intruder@example.com',
                    terms_accepted_version='1.0', terms_accepted_at=datetime.now(timezone.utc),
                    privacy_accepted_version='1.0', privacy_accepted_at=datetime.now(timezone.utc))
    intruder.set_password('Password123')
    db_session.add(intruder)
    db_session.commit()
    headers = session_headers_for(intruder)
    monday = plan_world['mondays'][0]
    base = f"/api/{plan_world['root'].id}/programs/{plan_world['program'].id}/days/{plan_world['day'].id}"

    assert client.get(f"{base}/plans?date={monday}", headers=headers).status_code == 404
    assert client.get(
        f"/api/{plan_world['root'].id}/programs/{plan_world['program'].id}/plan-occurrences", headers=headers,
    ).status_code == 404
    assert client.put(_plan_url(plan_world, monday), headers=headers,
                      json={'sections': [{'name': 'Main', 'items': []}]}).status_code == 404
    assert client.delete(_plan_url(plan_world, monday), headers=headers).status_code == 404
    assert client.get(
        f"/api/{plan_world['root'].id}/session-plans/candidates?template_id={plan_world['template'].id}&date={monday}",
        headers=headers,
    ).status_code == 404


def test_deleting_the_program_day_cascades_plans(authed_client, db_session, plan_world):
    monday = plan_world['mondays'][0]
    _save(authed_client, plan_world, monday, _day_plans(authed_client, plan_world, monday)['sections'])
    db_session.query(ProgramDayTemplate).filter_by(program_day_id=plan_world['day'].id).delete()
    db_session.query(ProgramDay).filter_by(id=plan_world['day'].id).delete()
    db_session.commit()

    assert db_session.query(ProgramSessionPlan).count() == 0


def test_occurrences_report_canonical_status_and_credited_sessions(authed_client, db_session, test_user, plan_world):
    week1, week2 = plan_world['past_mondays'][-1], plan_world['mondays'][0]
    started = datetime.combine(week1, time(12), tzinfo=timezone.utc)
    session = Session(
        owner_id=test_user.id, root_id=plan_world['root'].id, name='Bench done',
        template_id=plan_world['template'].id, completed=True,
        session_start=started, session_end=started + timedelta(hours=1),
        completed_at=started + timedelta(hours=1),
    )
    db_session.add(session)
    db_session.commit()

    dates = {row['date']: row for row in _occurrences(authed_client, plan_world, '?timezone=UTC')}
    assert dates[week1.isoformat()]['program_day_completed'] is True
    assert dates[week1.isoformat()]['closed'] is True
    assert [item['name'] for item in dates[week1.isoformat()]['sessions']] == ['Bench done']
    assert dates[week2.isoformat()]['program_day_completed'] is False
    assert dates[week2.isoformat()]['sessions'] == []


def test_invalid_timezone_is_rejected(authed_client, plan_world):
    response = authed_client.get(
        f"/api/{plan_world['root'].id}/programs/{plan_world['program'].id}/plan-occurrences?timezone=Not/AZone"
    )
    assert response.status_code == 400


def test_legacy_activity_lists_keep_circuits_and_stable_keys():
    template = SessionTemplate(template_data=json.dumps({'sections': [{'name': 'Exercises', 'activities': [
        {'type': 'circuit', 'circuit_definition_id': 'circ-1'},
        {'activity_id': 'act-1', 'name': 'Shoulder Rehab', 'type': 'activity'},
        'act-2',
    ]}]}))

    items = typed_template_sections(template)[0]['items']

    assert items == [
        {'type': 'circuit', 'circuit_definition_id': 'circ-1', 'item_key': 'legacy-0-0'},
        {'type': 'activity', 'activity_definition_id': 'act-1', 'name': 'Shoulder Rehab', 'item_key': 'legacy-0-1'},
        {'type': 'activity', 'activity_definition_id': 'act-2', 'item_key': 'legacy-0-2'},
    ]
    assert typed_template_sections(template)[0]['items'] == items


def test_day_plans_list_the_sessions_that_completed_each_template(authed_client, db_session, test_user, plan_world):
    week1 = plan_world['past_mondays'][-1]
    started = datetime.combine(week1, time(12), tzinfo=timezone.utc)
    session = Session(
        owner_id=test_user.id, root_id=plan_world['root'].id, name='Bench done',
        template_id=plan_world['template'].id, completed=True,
        session_start=started, session_end=started + timedelta(hours=1), completed_at=started + timedelta(hours=1),
    )
    db_session.add(session)
    db_session.commit()
    base = f"/api/{plan_world['root'].id}/programs/{plan_world['program'].id}/days/{plan_world['day'].id}/plans"

    entry = authed_client.get(f"{base}?date={week1.isoformat()}&timezone=UTC").get_json()['plans'][0]

    assert entry['logged_sessions'] == [{'id': session.id, 'name': 'Bench done', 'completed': True}]
    future = plan_world['mondays'][3]
    assert authed_client.get(f"{base}?date={future.isoformat()}&timezone=UTC").get_json()['plans'][0]['logged_sessions'] == []

def test_past_program_days_are_read_only(authed_client, plan_world):
    past = plan_world['past_mondays'][-1]
    entry = _day_plans(authed_client, plan_world, past)

    save = authed_client.put(_plan_url(plan_world, past) + '?timezone=UTC', json={'sections': entry['sections']})
    reset = authed_client.delete(_plan_url(plan_world, past) + '?timezone=UTC')
    pull = authed_client.post(_plan_url(plan_world, past, '/pull-template') + '?timezone=UTC', json={})

    assert [response.status_code for response in (save, reset, pull)] == [409, 409, 409]
    assert "can't be re-planned" in save.get_json()['error']
    # The next upcoming date stays plannable.
    upcoming = plan_world['mondays'][0]
    assert _save(authed_client, plan_world, upcoming, _day_plans(authed_client, plan_world, upcoming)['sections']).status_code == 200


def test_plan_writes_reject_an_invalid_timezone(authed_client, plan_world):
    upcoming = plan_world['mondays'][0]
    sections = _day_plans(authed_client, plan_world, upcoming)['sections']
    response = authed_client.put(_plan_url(plan_world, upcoming) + '?timezone=Not/AZone', json={'sections': sections})
    assert response.status_code == 400
    assert response.get_json()['error'] == 'Invalid timezone'


@pytest.fixture
def optional_world(db_session, plan_world):
    """``plan_world`` plus an optional 'Accessories' template on the same Monday day."""
    accessories = SessionTemplate(
        id=str(uuid.uuid4()), name='Accessories', root_id=plan_world['root'].id,
        template_data=json.dumps({'session_type': 'normal', 'sections': [{
            'name': 'Main',
            'items': [{
                'type': 'activity', 'activity_definition_id': plan_world['activity'].id,
                'name': 'Curls', 'item_key': 'curls',
            }],
        }]}),
    )
    db_session.add(accessories)
    db_session.flush()
    db_session.add(ProgramDayTemplate(
        program_day_id=plan_world['day'].id, session_template_id=accessories.id, is_required=False, order=1,
    ))
    db_session.commit()
    return {**plan_world, 'template': accessories, 'required_template': plan_world['template']}


def _all_day_plans(client, world, plan_date):
    response = client.get(
        f"/api/{world['root'].id}/programs/{world['program'].id}/days/{world['day'].id}/plans"
        f"?date={plan_date.isoformat()}"
    )
    assert response.status_code == 200, response.get_json()
    return {entry['template']['id']: entry for entry in response.get_json()['plans']}


def test_optional_templates_start_unloaded_and_required_ones_loaded(authed_client, optional_world):
    plans = _all_day_plans(authed_client, optional_world, optional_world['mondays'][0])

    assert plans[optional_world['required_template'].id]['is_loaded'] is True
    optional = plans[optional_world['template'].id]
    assert optional['is_required'] is False
    assert optional['is_loaded'] is False
    assert optional['plan_id'] is None


def test_loading_an_optional_template_stores_its_seed_idempotently(authed_client, db_session, optional_world):
    monday = optional_world['mondays'][0]

    response = authed_client.post(_plan_url(optional_world, monday, '/load'))
    assert response.status_code == 201, response.get_json()
    loaded = response.get_json()
    assert loaded['is_loaded'] is True
    assert loaded['plan_id']
    assert loaded['sections'][0]['items'][0]['item_key'] == 'curls'

    again = authed_client.post(_plan_url(optional_world, monday, '/load'))
    assert again.status_code == 200
    assert again.get_json()['plan_id'] == loaded['plan_id']
    assert db_session.query(ProgramSessionPlan).filter_by(
        session_template_id=optional_world['template'].id, deleted_at=None,
    ).count() == 1
    assert _all_day_plans(authed_client, optional_world, monday)[optional_world['template'].id]['is_loaded'] is True


def test_removing_a_loaded_optional_template_unloads_it(authed_client, optional_world):
    monday = optional_world['mondays'][0]
    assert authed_client.post(_plan_url(optional_world, monday, '/load')).status_code == 201

    removed = authed_client.delete(_plan_url(optional_world, monday))
    assert removed.status_code == 200
    assert removed.get_json()['is_loaded'] is False
    assert _all_day_plans(authed_client, optional_world, monday)[optional_world['template'].id]['is_loaded'] is False


def test_loading_rejects_required_templates_and_past_dates(authed_client, optional_world):
    required_world = {**optional_world, 'template': optional_world['required_template']}
    required = authed_client.post(_plan_url(required_world, optional_world['mondays'][0], '/load'))
    assert required.status_code == 400

    past = authed_client.post(_plan_url(optional_world, optional_world['past_mondays'][0], '/load'))
    assert past.status_code == 409
