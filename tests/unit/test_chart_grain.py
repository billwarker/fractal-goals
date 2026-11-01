import json
from datetime import date
from pathlib import Path

import pytest

from services.chart_grain import bucket_count, bucket_start, resolve_grain

CASES = json.loads((Path(__file__).parents[1] / 'fixtures' / 'chart_grain_cases.json').read_text())


def _day(value):
    return date.fromisoformat(value)


@pytest.mark.parametrize('case', CASES['bucket_start'])
def test_bucket_start(case):
    assert bucket_start(_day(case['day']), case['grain']).isoformat() == case['expected']


@pytest.mark.parametrize('case', CASES['bucket_count'])
def test_bucket_count(case):
    assert bucket_count(_day(case['first']), _day(case['last']), case['grain']) == case['expected']


@pytest.mark.parametrize('case', CASES['resolve_grain'])
def test_resolve_grain(case):
    assert resolve_grain(case['requested'], _day(case['first']), _day(case['last']), case['budget']) == case['expected']
