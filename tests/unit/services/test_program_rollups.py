"""Pure per-date rollups (services/program_rollups.py)."""

import json
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

from services.program_rollups import (
    block_weeks,
    build_date_records,
    consistency_rollup,
    longest_streak,
    status_counts,
)

START = date(2026, 11, 2)


@pytest.mark.parametrize('length,expected', [
    (1, [(1, 0, 0, True)]),
    (7, [(1, 0, 6, False)]),
    (8, [(1, 0, 6, False), (2, 7, 7, True)]),
    (13, [(1, 0, 6, False), (2, 7, 12, True)]),
    (14, [(1, 0, 6, False), (2, 7, 13, False)]),
])
def test_block_weeks_count_from_block_start_and_mark_partial_last_week(length, expected):
    weeks = block_weeks(START, START + timedelta(days=length - 1))

    assert [
        (week.index, (week.start - START).days, (week.end - START).days, week.partial) for week in weeks
    ] == expected


CASES = json.loads((Path(__file__).resolve().parents[2] / 'fixtures' / 'block_weeks_cases.json').read_text())['cases']


@pytest.mark.parametrize('case', CASES, ids=[case['name'] for case in CASES])
def test_block_weeks_match_the_shared_client_cases(case):
    weeks = block_weeks(
        date.fromisoformat(case['start']), date.fromisoformat(case['end']), case['week_start_day'],
    )

    assert [[week.start.isoformat(), week.end.isoformat(), week.partial] for week in weeks] == case['weeks']
    assert [week.index for week in weeks] == list(range(1, len(weeks) + 1))


def test_block_weeks_need_a_valid_range():
    assert block_weeks(None, START) == []
    assert block_weeks(START, START - timedelta(days=1)) == []


def _fact(offset, *, met=True, manual=None, closed=True, scheduled=True):
    met = met and manual != 'rest'
    state = 'rest' if manual == 'rest' else (
        'scheduled_met' if met else ('scheduled_missed' if closed else 'scheduled_pending')
    )
    return {
        'date': START + timedelta(days=offset),
        'state': state,
        'manual_status': manual,
        'scheduled': scheduled,
        'closed': closed,
        'counts_as_success': met,
        'counts_toward_adherence': manual != 'rest',
        'occurrences': [{
            'block': SimpleNamespace(id='block'),
            'program_day': SimpleNamespace(id='heavy'),
        }] if scheduled else [],
    }


def test_rest_days_leave_consistency_and_missed_days_count_against_it():
    records = build_date_records([
        _fact(0, manual='rest'),
        _fact(1, met=False),
        _fact(2),
        _fact(3, met=False, closed=False),
        _fact(4, scheduled=False),
    ])

    assert [record.status for record in records] == ['rest', 'missed', 'complete', 'scheduled']
    assert records[0].block_id == 'block' and records[0].program_day_ids == ('heavy',)
    assert consistency_rollup(records) == {'met_days': 1, 'scheduled_days_observed': 2, 'rate': 0.5}


def test_a_manual_complete_counts_as_met():
    records = build_date_records([{**_fact(0, met=True), 'state': 'scheduled_partial', 'manual_status': 'complete'}])

    assert records[0].status == 'complete'
    assert consistency_rollup(records)['met_days'] == 1


def test_status_counts_include_the_total_scheduled():
    records = build_date_records([
        _fact(0), _fact(1, met=False), _fact(2, manual='rest'), _fact(3, met=False, closed=False), _fact(4),
    ])

    assert status_counts(records) == {'complete': 2, 'missed': 1, 'rest': 1, 'pending': 1, 'scheduled': 5}


@pytest.mark.parametrize('pattern,expected', [
    ('', 0),
    ('ccc', 3),
    ('ccmcc', 2),
    ('ccrcc', 4),
    ('cmcccrcsc', 5),
    ('mmm', 0),
])
def test_longest_streak_bridges_rest_and_pending_days_but_not_misses(pattern, expected):
    kinds = {
        'c': {},
        'm': {'met': False},
        'r': {'manual': 'rest'},
        's': {'met': False, 'closed': False},
    }
    records = build_date_records([_fact(offset, **kinds[kind]) for offset, kind in enumerate(pattern)])

    # Order must not matter.
    assert longest_streak(list(reversed(records))) == expected


def test_empty_rollups_report_no_rate():
    assert consistency_rollup([]) == {'met_days': 0, 'scheduled_days_observed': 0, 'rate': None}
    assert status_counts([]) == {'complete': 0, 'missed': 0, 'rest': 0, 'pending': 0, 'scheduled': 0}
