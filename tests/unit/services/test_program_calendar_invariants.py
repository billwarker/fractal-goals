"""Program calendar invariants: blocks never overlap, and a date holds one program day."""

import uuid
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from models import Program, ProgramBlock, ProgramDay, ProgramDayOccurrenceSchedule
from services.program_calendar_invariants import (
    BLOCK_INVALID_DATES,
    BLOCK_OVERLAP,
    DAY_DATE_CONFLICT,
    find_program_day_date_conflicts,
)
from services.program_service_errors import ProgramServiceValidationError
from services.programs import ProgramService

# A fixed Monday keeps weekday expectations stable.
START = date(2026, 11, 2)


@pytest.fixture
def program(db_session, sample_goal_hierarchy):
    program = Program(
        id=str(uuid.uuid4()),
        root_id=sample_goal_hierarchy['ultimate'].id,
        name='Calendar Program',
        start_date=START,
        end_date=START + timedelta(days=27),
        weekly_schedule=[],
        is_active=True,
    )
    db_session.add(program)
    db_session.commit()
    return program


def _root(program):
    return program.root_id


def _block(db_session, program, offset, length, name='Block'):
    block = ProgramBlock(
        program_id=program.id,
        name=name,
        start_date=START + timedelta(days=offset),
        end_date=START + timedelta(days=offset + length - 1),
    )
    db_session.add(block)
    db_session.commit()
    return block


def _error(excinfo):
    return excinfo.value.payload, excinfo.value.status_code


# ---------------------------------------------------------------- blocks

def test_create_block_rejects_overlap_with_inclusive_edges(db_session, program):
    _block(db_session, program, 0, 7, name='Week 1')

    with pytest.raises(ProgramServiceValidationError) as excinfo:
        ProgramService.create_block(db_session, _root(program), program.id, {
            'name': 'Week 2',
            'start_date': (START + timedelta(days=6)).isoformat(),
            'end_date': (START + timedelta(days=13)).isoformat(),
        })

    payload, status = _error(excinfo)
    assert status == 409
    assert payload['code'] == BLOCK_OVERLAP
    assert payload['conflicts'][0]['name'] == 'Week 1'
    assert 'Week 1' in payload['error']


def test_create_block_allows_adjacent_blocks(db_session, program):
    _block(db_session, program, 0, 7, name='Week 1')

    created = ProgramService.create_block(db_session, _root(program), program.id, {
        'name': 'Week 2',
        'start_date': (START + timedelta(days=7)).isoformat(),
        'end_date': (START + timedelta(days=13)).isoformat(),
    })

    assert created['name'] == 'Week 2'


def test_update_block_rejects_moving_onto_a_sibling(db_session, program):
    _block(db_session, program, 0, 7, name='Week 1')
    week_two = _block(db_session, program, 7, 7, name='Week 2')

    with pytest.raises(ProgramServiceValidationError) as excinfo:
        ProgramService.update_block(db_session, _root(program), program.id, week_two.id, {
            'start_date': (START + timedelta(days=3)).isoformat(),
        })

    assert _error(excinfo)[1] == 409


def test_update_block_without_date_changes_skips_date_checks(db_session, program):
    week_one = _block(db_session, program, 0, 7, name='Week 1')

    updated = ProgramService.update_block(db_session, _root(program), program.id, week_one.id, {'name': 'Renamed'})

    assert updated['name'] == 'Renamed'


@pytest.mark.parametrize('start_offset,end_offset', [(-1, 5), (20, 30)])
def test_block_must_stay_inside_its_program(db_session, program, start_offset, end_offset):
    with pytest.raises(ProgramServiceValidationError) as excinfo:
        ProgramService.create_block(db_session, _root(program), program.id, {
            'name': 'Outside',
            'start_date': (START + timedelta(days=start_offset)).isoformat(),
            'end_date': (START + timedelta(days=end_offset)).isoformat(),
        })

    payload, status = _error(excinfo)
    assert status == 400
    assert payload['code'] == BLOCK_INVALID_DATES


def test_block_end_must_not_precede_start(db_session, program):
    with pytest.raises(ProgramServiceValidationError, match='on or after'):
        ProgramService.create_block(db_session, _root(program), program.id, {
            'name': 'Backwards',
            'start_date': (START + timedelta(days=5)).isoformat(),
            'end_date': START.isoformat(),
        })


def test_program_date_change_cannot_strand_a_block(db_session, program):
    _block(db_session, program, 14, 7, name='Week 3')

    with pytest.raises(ProgramServiceValidationError, match='Week 3'):
        ProgramService.update_program(db_session, _root(program), program.id, {
            'start_date': START.isoformat(),
            'end_date': (START + timedelta(days=15)).isoformat(),
        })


def test_database_rejects_overlapping_blocks_even_without_the_service(db_session, program):
    _block(db_session, program, 0, 7)
    savepoint = db_session.begin_nested()
    db_session.add(ProgramBlock(
        program_id=program.id, name='Sneaky',
        start_date=START + timedelta(days=3), end_date=START + timedelta(days=9),
    ))
    with pytest.raises(Exception, match='ex_program_blocks_no_overlap'):
        db_session.flush()
    savepoint.rollback()


# ---------------------------------------------------------------- program days

def _add_day(db_session, program, block, **data):
    return ProgramService.add_block_day(db_session, _root(program), program.id, block.id, data)['days'][0]


def test_two_weekly_days_cannot_share_a_weekday(db_session, program):
    block = _block(db_session, program, 0, 14)
    _add_day(db_session, program, block, name='Upper', day_of_week=['Monday'])

    with pytest.raises(ProgramServiceValidationError) as excinfo:
        _add_day(db_session, program, block, name='Lower', day_of_week=['Monday', 'Thursday'])

    payload, status = _error(excinfo)
    assert status == 409
    assert payload['code'] == DAY_DATE_CONFLICT
    assert payload['conflicts'][0]['date'] == START.isoformat()
    assert {row['day_name'] for row in payload['conflicts']} == {'Upper', 'Lower'}
    assert payload['conflict_count'] == 2
    assert 'Upper and Lower' in payload['error']
    db_session.rollback()
    assert db_session.query(ProgramDay).filter_by(block_id=block.id).count() == 1


def test_weekly_day_conflicts_with_another_days_specific_date(db_session, program):
    block = _block(db_session, program, 0, 14)
    _add_day(db_session, program, block, name='Test Day', scheduled_dates=[(START + timedelta(days=2)).isoformat()])

    with pytest.raises(ProgramServiceValidationError, match='only one program day'):
        _add_day(db_session, program, block, name='Wednesday', day_of_week=['Wednesday'])


def test_update_day_scheduled_dates_cannot_land_on_an_occupied_date(db_session, program):
    block = _block(db_session, program, 0, 14)
    _add_day(db_session, program, block, name='Upper', day_of_week=['Monday'])
    other = _add_day(db_session, program, block, name='Extra')

    with pytest.raises(ProgramServiceValidationError) as excinfo:
        ProgramService.update_block_day(db_session, _root(program), program.id, block.id, other['id'], {
            'scheduled_dates': [(START + timedelta(days=7)).isoformat()],
        })

    assert _error(excinfo)[0]['code'] == DAY_DATE_CONFLICT


def test_schedule_block_day_rejects_a_date_another_day_owns(db_session, program):
    block = _block(db_session, program, 0, 14)
    _add_day(db_session, program, block, name='Upper', day_of_week=['Monday'])
    reusable = _add_day(db_session, program, block, name='Reusable')

    with pytest.raises(ProgramServiceValidationError):
        ProgramService.schedule_block_day(db_session, _root(program), program.id, block.id, reusable['id'], {
            'date': START.isoformat(),
        })

    db_session.rollback()
    assert db_session.query(ProgramDayOccurrenceSchedule).filter_by(program_day_id=reusable['id']).count() == 0


def test_schedule_block_day_allows_a_free_date(db_session, program):
    block = _block(db_session, program, 0, 14)
    _add_day(db_session, program, block, name='Upper', day_of_week=['Monday'])
    reusable = _add_day(db_session, program, block, name='Reusable')

    scheduled = ProgramService.schedule_block_day(db_session, _root(program), program.id, block.id, reusable['id'], {
        'date': (START + timedelta(days=1)).isoformat(),
    })

    assert scheduled['date'] == (START + timedelta(days=1)).isoformat()


def test_cascade_conflict_in_a_later_block_rolls_back_the_whole_write(db_session, program):
    first = _block(db_session, program, 0, 7, name='Week 1')
    second = _block(db_session, program, 7, 7, name='Week 2')
    _add_day(db_session, program, second, name='Existing Monday', day_of_week=['Monday'])

    with pytest.raises(ProgramServiceValidationError):
        ProgramService.add_block_day(db_session, _root(program), program.id, first.id, {
            'name': 'Cascaded Monday', 'day_of_week': ['Monday'], 'cascade': True,
        })

    db_session.rollback()
    assert db_session.query(ProgramDay).filter_by(name='Cascaded Monday').count() == 0


def test_copy_block_day_onto_an_occupied_weekday_is_rejected(db_session, program):
    first = _block(db_session, program, 0, 7, name='Week 1')
    second = _block(db_session, program, 7, 7, name='Week 2')
    source = _add_day(db_session, program, first, name='Upper', day_of_week=['Monday'])
    # Copy overwrites the target block's day with the same day_number (the filler).
    _add_day(db_session, program, second, name='Filler')
    _add_day(db_session, program, second, name='Other', day_of_week=['Monday'])

    with pytest.raises(ProgramServiceValidationError):
        ProgramService.copy_block_day(db_session, _root(program), program.id, first.id, source['id'], {
            'target_mode': 'all',
        })


def test_extending_a_block_reactivates_dormant_dates_and_is_checked(db_session, program):
    block = _block(db_session, program, 0, 21)
    _add_day(db_session, program, block, name='Extra', scheduled_dates=[(START + timedelta(days=14)).isoformat()])
    ProgramService.update_block(db_session, _root(program), program.id, block.id, {
        'end_date': (START + timedelta(days=13)).isoformat(),
    })
    # The Extra date (a Monday) is now outside the block and dormant, so Mondays are free.
    _add_day(db_session, program, block, name='Upper', day_of_week=['Monday'])

    with pytest.raises(ProgramServiceValidationError) as excinfo:
        ProgramService.update_block(db_session, _root(program), program.id, block.id, {
            'end_date': (START + timedelta(days=20)).isoformat(),
        })

    payload, status = _error(excinfo)
    assert status == 409
    assert payload['code'] == DAY_DATE_CONFLICT
    assert payload['conflicts'][0]['date'] == (START + timedelta(days=14)).isoformat()


def test_unrelated_edits_still_save(db_session, program):
    block = _block(db_session, program, 0, 14)
    upper = _add_day(db_session, program, block, name='Upper', day_of_week=['Monday'])
    _add_day(db_session, program, block, name='Lower', day_of_week=['Thursday'])

    updated = ProgramService.update_block_day(db_session, _root(program), program.id, block.id, upper['id'], {
        'name': 'Upper A',
    })

    assert updated['name'] == 'Upper A'


# ---------------------------------------------------------------- pure

def _calendar(*days, start=START, length=14):
    return SimpleNamespace(blocks=[SimpleNamespace(
        id='block', name='Block', start_date=start, end_date=start + timedelta(days=length - 1),
        days=list(days),
    )])


def _day(day_id, *, day_of_week=None, dates=(), legacy=None):
    return SimpleNamespace(
        id=day_id, name=day_id, day_number=None, date=legacy, day_of_week=day_of_week,
        occurrence_schedules=[SimpleNamespace(date=value) for value in dates],
    )


def test_conflicts_are_empty_for_disjoint_schedules():
    calendar = _calendar(_day('mon', day_of_week=['Monday']), _day('tue', dates=[START + timedelta(days=1)]))

    assert find_program_day_date_conflicts(calendar, START, START + timedelta(days=13)) == []


def test_conflicts_list_every_definition_on_a_double_booked_date():
    calendar = _calendar(_day('mon', day_of_week=['Monday']), _day('extra', dates=[START + timedelta(days=7)]))

    conflicts = find_program_day_date_conflicts(calendar, START, START + timedelta(days=13))

    assert [(row['date'], row['day_id']) for row in conflicts] == [
        ((START + timedelta(days=7)).isoformat(), 'mon'),
        ((START + timedelta(days=7)).isoformat(), 'extra'),
    ]
