"""Program-day goals, bounded by the program's goals (services/program_focus.py)."""

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from models import Goal, Program, ProgramDay, program_block_goals, program_goals
from models.goal import program_day_goals
from services.goal_service import GoalService, sync_goal_targets
from services.program_focus import DAY_GOAL_OUT_OF_SCOPE, FocusScopes, resolve_focus_scopes
from services.program_service_errors import ProgramServiceValidationError
from services.programs import ProgramService

START = date(2026, 11, 2)


@pytest.fixture
def tree(db_session, sample_goal_hierarchy):
    """ultimate → long_term → {mid_term → short_term, mid_b → short_b}; other sits beside long_term."""
    goals = dict(sample_goal_hierarchy)
    root_id = goals['ultimate'].id

    def add(name, parent_id):
        goal = Goal(id=str(uuid.uuid4()), name=name, parent_id=parent_id, root_id=root_id, created_at=datetime.now(timezone.utc))
        db_session.add(goal)
        db_session.flush()
        return goal

    goals['mid_b'] = add('Mid B', goals['long_term'].id)
    goals['short_b'] = add('Short B', goals['mid_b'].id)
    goals['other'] = add('Other', root_id)
    db_session.commit()
    return {key: goal.id for key, goal in goals.items()}


@pytest.fixture
def program(db_session, tree):
    program = Program(
        id=str(uuid.uuid4()), root_id=tree['ultimate'], name='Focus Program',
        start_date=START, end_date=START + timedelta(days=27), weekly_schedule=[],
    )
    db_session.add(program)
    db_session.flush()
    db_session.execute(program_goals.insert().values(program_id=program.id, goal_id=tree['long_term']))
    db_session.commit()
    return program


def _create_block(db_session, program, offset=0, length=14, name='Block', **extra):
    return ProgramService.create_block(db_session, program.root_id, program.id, {
        'name': name,
        'start_date': (START + timedelta(days=offset)).isoformat(),
        'end_date': (START + timedelta(days=offset + length - 1)).isoformat(),
        **extra,
    })


def _add_day(db_session, program, goal_ids=None, **data):
    payload = {'name': data.pop('name', 'Day'), **data}
    if goal_ids is not None:
        payload['goal_ids'] = goal_ids
    return ProgramService.create_program_day(db_session, program.root_id, program.id, payload)


def _active_day_goals(db_session, day_id):
    return sorted(db_session.execute(select(program_day_goals.c.goal_id).where(
        program_day_goals.c.program_day_id == day_id,
        program_day_goals.c.deleted_at.is_(None),
    )).scalars())


def _error(excinfo):
    return excinfo.value.payload, excinfo.value.status_code


# ---------------------------------------------------------------- scopes

def test_day_scope_is_its_goals_else_the_program_goals(db_session, program, tree):
    focused = _add_day(db_session, program, [tree['mid_term']], name='Focused')
    open_day = _add_day(db_session, program, name='Open', day_of_week=['Tuesday'])

    scopes = resolve_focus_scopes(db_session, program.root_id, program.id)

    assert scopes.program_goal_ids == {tree[key] for key in ('long_term', 'mid_term', 'short_term', 'mid_b', 'short_b')}
    assert scopes.day_scope(focused['id']) == {tree['mid_term'], tree['short_term']}
    assert scopes.day_scope(open_day['id']) == scopes.program_goal_ids
    assert scopes.day_scope(None) == scopes.program_goal_ids
    assert scopes.violations() == frozenset()


def test_deleted_goals_do_not_count_as_day_goals(db_session, program, tree):
    day = _add_day(db_session, program, [tree['mid_b']])
    db_session.get(Goal, tree['mid_b']).deleted_at = datetime.now(timezone.utc)
    db_session.commit()

    scopes = resolve_focus_scopes(db_session, program.root_id, program.id)

    assert scopes.day_scope(day['id']) == scopes.program_goal_ids


def test_violations_flag_day_goals_outside_the_program_goals():
    scopes = FocusScopes(
        program_goal_ids=frozenset({'a'}),
        day_seed_ids={'day': frozenset({'a', 'b'})},
        day_goal_ids={'day': frozenset({'a', 'b'})},
    )

    assert {(item.day_id, item.goal_id) for item in scopes.violations()} == {('day', 'b')}


# ---------------------------------------------------------------- blocks carry no goals

def test_blocks_neither_need_nor_store_goals(db_session, program, tree):
    block = _create_block(db_session, program, goal_ids=[tree['mid_term']])

    assert 'goal_ids' not in block
    stored = db_session.execute(select(program_block_goals.c.goal_id).where(
        program_block_goals.c.program_block_id == block['id'],
    )).all()
    assert stored == []


# ---------------------------------------------------------------- day goals

def test_day_goals_are_optional(db_session, program):

    assert _add_day(db_session, program)['goal_ids'] == []


def test_day_goals_must_sit_within_the_program_goals(db_session, program, tree):

    with pytest.raises(ProgramServiceValidationError) as excinfo:
        _add_day(db_session, program, [tree['short_term'], tree['other']])

    payload, status = _error(excinfo)
    assert status == 400
    assert payload['code'] == DAY_GOAL_OUT_OF_SCOPE
    assert payload['goal_ids'] == [tree['other']]


def test_day_can_focus_on_several_lineages(db_session, program, tree):

    day = _add_day(db_session, program, [tree['mid_term'], tree['short_b']])

    assert sorted(day['goal_ids']) == sorted([tree['mid_term'], tree['short_b']])


def test_update_day_goals_replaces_and_revives_soft_deleted_rows(db_session, program, tree):
    day = _add_day(db_session, program, [tree['mid_term']])
    update = lambda goal_ids: ProgramService.update_program_day(  # noqa: E731
        db_session, program.root_id, program.id, day['id'], {'goal_ids': goal_ids},
    )

    update([tree['mid_b']])
    assert _active_day_goals(db_session, day['id']) == [tree['mid_b']]
    update([tree['mid_term'], tree['mid_b']])
    assert _active_day_goals(db_session, day['id']) == sorted([tree['mid_term'], tree['mid_b']])
    update([])
    assert _active_day_goals(db_session, day['id']) == []


def test_duplicated_days_keep_their_goals(db_session, program, tree):
    source = _add_day(db_session, program, [tree['short_b']], name='Copy me', day_of_week=['Friday'])

    copy = ProgramService.duplicate_program_day(db_session, program.root_id, program.id, source['id'])

    assert _active_day_goals(db_session, copy['id']) == [tree['short_b']]


def test_attach_goal_to_day_needs_only_a_program_goal(db_session, program, tree):
    day = _add_day(db_session, program)

    result = ProgramService.attach_goal_to_day(
        db_session, program.root_id, program.id, day['id'], {'goal_id': tree['short_term']},
    )

    assert result['goal_ids'] == [tree['short_term']]
    with pytest.raises(ProgramServiceValidationError) as excinfo:
        ProgramService.attach_goal_to_day(
            db_session, program.root_id, program.id, day['id'], {'goal_id': tree['other']},
        )
    assert _error(excinfo)[0]['code'] == DAY_GOAL_OUT_OF_SCOPE


# ---------------------------------------------------------------- narrowing program goals

def test_narrowing_program_goals_reports_stranded_day_goals_until_confirmed(db_session, program, tree):
    kept = _add_day(db_session, program, [tree['short_term']], name='Kept')
    stranded = _add_day(db_session, program, [tree['short_b'], tree['short_term']], name='Stranded', day_of_week=['Tuesday'])

    with pytest.raises(ProgramServiceValidationError) as excinfo:
        ProgramService.update_program(db_session, program.root_id, program.id, {'selectedGoals': [tree['mid_term']]})

    payload, status = _error(excinfo)
    assert status == 409
    assert payload['code'] == DAY_GOAL_OUT_OF_SCOPE
    assert payload['conflicts'] == [{
        'kind': 'day', 'day_id': stranded['id'], 'name': 'Stranded',
        'goal_id': tree['short_b'], 'goal_name': 'Short B',
    }]
    db_session.rollback()
    assert _active_day_goals(db_session, stranded['id']) == sorted([tree['short_b'], tree['short_term']])

    ProgramService.update_program(db_session, program.root_id, program.id, {
        'selectedGoals': [tree['mid_term']], 'prune_day_goals': True,
    })

    assert _active_day_goals(db_session, stranded['id']) == [tree['short_term']]
    assert _active_day_goals(db_session, kept['id']) == [tree['short_term']]


def test_legacy_out_of_scope_day_goals_do_not_block_unrelated_program_edits(db_session, program, tree):
    day = _add_day(db_session, program, [tree['short_term']])
    db_session.execute(program_day_goals.insert().values(program_day_id=day['id'], goal_id=tree['other']))
    db_session.commit()

    updated = ProgramService.update_program(db_session, program.root_id, program.id, {
        'selectedGoals': [tree['long_term'], tree['mid_b']],
    })

    assert sorted(updated['goal_ids']) == sorted([tree['long_term'], tree['mid_b']])


# ---------------------------------------------------------------- goal deadlines

def test_fractal_goal_create_caps_child_deadline_at_parent(db_session, tree, test_user):
    parent = db_session.get(Goal, tree['mid_term'])
    parent.deadline = datetime.combine(START + timedelta(days=5), datetime.min.time())
    db_session.commit()
    service = GoalService(db_session, sync_targets=sync_goal_targets)
    base = {'name': 'Child', 'type': 'ShortTermGoal', 'parent_id': parent.id}

    _, error, status = service.create_fractal_goal(
        tree['ultimate'], test_user.id, {**base, 'deadline': (START + timedelta(days=6)).isoformat()},
    )
    assert status == 400
    assert error['parent_deadline'] == (START + timedelta(days=5)).isoformat()

    created, error, status = service.create_fractal_goal(
        tree['ultimate'], test_user.id, {**base, 'deadline': (START + timedelta(days=5)).isoformat()},
    )
    assert status == 201 and error is None
    assert created.deadline.date() == START + timedelta(days=5)
