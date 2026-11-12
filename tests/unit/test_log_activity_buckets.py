from datetime import date
from zoneinfo import ZoneInfo

import pytest

from services.log_service import _bucket_starts, event_domain


@pytest.mark.parametrize("prefix, domain", [
    ("goal", "goals"),
    ("session", "sessions"),
    ("activity_instance", "sessions"),
    ("activity_set", "sessions"),
    ("activity", "activities"),
    ("activity_tag_family", "activities"),
    ("fractal_metric", "activities"),
    ("program_day", "programs"),
    ("note", "notes"),
    ("user", "other"),
    ("", "other"),
])
def test_event_domain(prefix, domain):
    assert event_domain(prefix) == domain


def test_daily_buckets_cover_the_range_inclusive():
    starts = _bucket_starts(date(2026, 1, 30), date(2026, 2, 2), "day", ZoneInfo("UTC"))
    assert [start.isoformat() for start in starts] == [
        "2026-01-30T00:00:00", "2026-01-31T00:00:00", "2026-02-01T00:00:00", "2026-02-02T00:00:00",
    ]


def test_hourly_buckets_merge_the_repeated_hour_when_clocks_go_back():
    # Toronto fell back on 2026-11-01: 01:00 happens twice, and the day lasts 25 real hours.
    starts = _bucket_starts(date(2026, 11, 1), date(2026, 11, 1), "hour", ZoneInfo("America/Toronto"))
    assert len(starts) == 24
    assert len(set(starts)) == 24
