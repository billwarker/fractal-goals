"""Program metrics v9: per-block status counts, consistency, streaks, and goals due."""

import uuid
from datetime import date, datetime, timezone

import pytest

from models import Program, ProgramBlock, ProgramDay, ProgramDayOccurrenceSchedule, ProgramDayStatusOverride, ProgramDayTemplate, Session, program_goals
from services.program_metrics_service import CALCULATION_VERSION, ProgramMetricsService
from services.programs import ProgramService


def _when(day, hour=12):
    return datetime(2026, 9, day, hour, tzinfo=timezone.utc)


@pytest.fixture
def world(db_session, sample_goal_hierarchy, sample_session_template, test_user):
    goals = sample_goal_hierarchy
    root_id = goals['ultimate'].id
    # Program goals are long_term and its descendants; the root itself is outside them.
    goals['short_term'].deadline = datetime(2026, 9, 5)
    goals['short_term'].completed = True
    goals['mid_term'].deadline = datetime(2026, 9, 10)
    goals['ultimate'].deadline = datetime(2026, 9, 3)
    program = Program(
        id=str(uuid.uuid4()), root_id=root_id, name='Block metrics', weekly_schedule=[],
        start_date=datetime(2026, 9, 1), end_date=datetime(2026, 9, 28),
    )
    db_session.add(program)
    db_session.flush()
    db_session.execute(program_goals.insert().values(program_id=program.id, goal_id=goals['long_term'].id))
    db_session.commit()

    strength = ProgramService.create_block(db_session, root_id, program.id, {
        'name': 'Strength', 'start_date': '2026-09-01', 'end_date': '2026-09-10',
    })
    heavy = ProgramService.create_program_day(db_session, root_id, program.id, {
        'name': 'Heavy', 'scheduled_dates': ['2026-09-02', '2026-09-08', '2026-09-09', '2026-09-10'],
        'template_ids': [sample_session_template.id],
    })
    later = ProgramBlock(program_id=program.id, name='Later', start_date=date(2026, 9, 11), end_date=date(2026, 9, 20))
    db_session.add(later)
    db_session.flush()
    later_day = ProgramDay(program_id=later.program_id, name='Old', occurrence_schedules=[ProgramDayOccurrenceSchedule(date=date(2026, 9, 12))])
    db_session.add(later_day)
    db_session.flush()
    db_session.add(ProgramDayTemplate(program_day_id=later_day.id, session_template_id=sample_session_template.id, is_required=True, order=0))

    def log(day_id, block_id, day_of_month):
        db_session.add(Session(
            owner_id=test_user.id, root_id=root_id, name='Logged', completed=True,
            program_id=program.id, program_block_id=block_id, program_day_id=day_id,
            template_id=sample_session_template.id,
            session_start=_when(day_of_month, 10), session_end=_when(day_of_month, 11), completed_at=_when(day_of_month, 11),
        ))

    log(heavy['id'], strength['id'], 2)
    log(heavy['id'], strength['id'], 8)
    db_session.add(ProgramDayStatusOverride(program_id=program.id, date=date(2026, 9, 10), status='rest'))
    log(later_day.id, later.id, 12)
    db_session.commit()

    payload, error, status = ProgramMetricsService(db_session).get_program_metrics(
        root_id, program.id, test_user.id, timezone_name='UTC', as_of=date(2026, 9, 20),
    )
    assert (error, status) == (None, 200)
    def recompute():
        payload, error, status = ProgramMetricsService(db_session).get_program_metrics(
            root_id, program.id, test_user.id, timezone_name='UTC', as_of=date(2026, 9, 20),
        )
        assert (error, status) == (None, 200)
        return payload

    return {
        'payload': payload, 'strength': strength, 'later': later, 'recompute': recompute,
        'root_id': root_id, 'program': program,
    }


def _block(payload, block_id):
    return next(row for row in payload['blocks'] if row['block_id'] == str(block_id))


def test_block_rows_report_status_counts_consistency_streak_and_goals(world):
    payload = world['payload']
    block = _block(payload, world['strength']['id'])

    assert payload['calculation_version'] == CALCULATION_VERSION == 9
    assert 'alignment' not in payload
    assert block['status_counts'] == {'complete': 2, 'missed': 1, 'rest': 1, 'pending': 0, 'scheduled': 4}
    assert block['consistency'] == {'met_days': 2, 'scheduled_days_observed': 3, 'rate': 0.666667}
    # Sep 2 and 8 form a run; the Sep 9 miss ends it before the Sep 10 rest day.
    assert block['longest_streak'] == 2
    # short_term (done) and mid_term fall inside the block; the root is not a program goal.
    assert block['goals'] == {'due': 2, 'completed': 1}
    assert 'alignment' not in block


def test_weeks_and_program_days_report_consistency(world):
    block = _block(world['payload'], world['strength']['id'])

    assert [(week['index'], week['start'], week['end'], week['partial']) for week in block['weeks']] == [
        (1, '2026-09-01', '2026-09-07', False),
        (2, '2026-09-08', '2026-09-10', True),
    ]
    assert block['weeks'][0]['consistency']['rate'] == 1.0
    assert block['weeks'][1]['consistency'] == {'met_days': 1, 'scheduled_days_observed': 2, 'rate': 0.5}
    [heavy] = block['program_days']
    assert (heavy['scheduled_occurrences'], heavy['completed_occurrences']) == (4, 2)
    assert heavy['consistency']['rate'] == 0.666667


def test_blocks_without_goals_due_and_the_current_block(world):
    payload = world['payload']
    later = _block(payload, world['later'].id)

    assert later['goals'] == {'due': 0, 'completed': 0}
    assert later['status_counts']['complete'] == 1
    assert payload['current_block']['block_id'] == world['later'].id
    assert (payload['current_block']['week_index'], payload['current_block']['week_count']) == (2, 2)
    assert payload['consistency']['at_risk_today'] is False
    assert payload['consistency']['next_scheduled_date'] is None


def test_tracked_weeks_start_on_the_chosen_weekday(world, db_session):
    # Sep 1, 2026 is a Tuesday; weeks starting on Sunday make Week 1 Sep 1-5.
    ProgramService.update_block(db_session, world['root_id'], world['program'].id, world['strength']['id'], {
        'track_weeks': True, 'week_start_day': 6,
    })
    block = _block(world['recompute'](), world['strength']['id'])

    assert [(week['index'], week['start'], week['end'], week['partial']) for week in block['weeks']] == [
        (1, '2026-09-01', '2026-09-05', True),
        (2, '2026-09-06', '2026-09-10', True),
    ]
    assert block['weeks'][0]['consistency']['rate'] == 1.0
    assert block['weeks'][1]['consistency'] == {'met_days': 1, 'scheduled_days_observed': 2, 'rate': 0.5}
