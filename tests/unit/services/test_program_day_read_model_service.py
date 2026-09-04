from datetime import date, datetime, timedelta, timezone
import json
from types import SimpleNamespace

import pytest

from services.program_day_read_model_service import ProgramDayReadModelService
from services.program_metrics_service import MAX_WINDOW_DAYS


def test_day_review_session_summary_excludes_activity_detail():
    started_at = datetime(2026, 9, 1, 14, 0, tzinfo=timezone.utc)
    ended_at = datetime(2026, 9, 1, 14, 20, tzinfo=timezone.utc)
    session = SimpleNamespace(
        id="session-1",
        name="Daily practice",
        template_id="template-1",
        program_day_id="day-1",
        session_start=started_at,
        session_end=ended_at,
        completed_at=started_at,
        total_duration_seconds=1200,
        duration_minutes=20,
        completed=True,
        is_paused=False,
        template=SimpleNamespace(
            id="template-1",
            name="Daily practice",
            template_data=json.dumps({"template_color": "#336699"}),
        ),
        activity_instances=[SimpleNamespace(id="activity-that-must-not-leak")],
    )

    payload = ProgramDayReadModelService._serialize_session(session)

    assert payload["id"] == "session-1"
    assert payload["total_duration_seconds"] == 1200
    assert payload["session_start"] == "2026-09-01T14:00:00Z"
    assert payload["session_end"] == "2026-09-01T14:20:00Z"
    assert payload["template"] == {
        "id": "template-1",
        "name": "Daily practice",
        "color": "#336699",
    }
    assert "activity_summaries" not in payload
    assert "has_more_activity_summaries" not in payload


def test_chain_context_is_bounded_and_reports_when_prior_history_is_truncated():
    requested_start = date(2026, 9, 1)
    requested_end = date(2026, 9, 3)

    chain_start, chain_end, truncated = ProgramDayReadModelService._resolve_chain_window(
        date(2020, 1, 1), date(2026, 12, 31), requested_start, requested_end
    )

    expected_lookback = MAX_WINDOW_DAYS - 4
    assert chain_start == requested_start - timedelta(days=expected_lookback)
    assert chain_end == requested_end + timedelta(days=1)
    assert truncated is True
    assert (chain_end - chain_start).days + 1 == MAX_WINDOW_DAYS


def test_chain_context_never_expands_a_maximum_request_past_the_limit():
    requested_start = date(2026, 1, 1)
    requested_end = requested_start + timedelta(days=MAX_WINDOW_DAYS - 1)

    chain_start, chain_end, truncated = ProgramDayReadModelService._resolve_chain_window(
        date(2020, 1, 1), date(2030, 1, 1), requested_start, requested_end
    )

    assert (chain_start, chain_end, truncated) == (
        requested_start,
        requested_end,
        True,
    )


def test_chain_context_keeps_a_recent_program_start_and_the_requested_range():
    requested_start = date(2026, 9, 1)
    requested_end = date(2026, 9, 3)

    chain_start, chain_end, truncated = ProgramDayReadModelService._resolve_chain_window(
        date(2026, 8, 1), date(2026, 8, 31), requested_start, requested_end
    )

    assert chain_start == date(2026, 8, 1)
    assert chain_end == requested_end
    assert truncated is False


def test_session_pagination_matches_a_full_merge_of_interleaved_streams():
    start = datetime(2026, 9, 1, tzinfo=timezone.utc)

    def session(identifier, minute):
        return SimpleNamespace(
            id=identifier,
            session_start=start + timedelta(minutes=minute),
            completed_at=None,
            created_at=None,
        )

    linked = [(session(f"linked-{index:03}", index * 2), "day-1") for index in range(80)]
    other = [session(f"other-{index:03}", index * 2 + 1) for index in range(151)]
    complete_merge = linked + [(item, None) for item in other]
    complete_merge.sort(
        key=lambda entry: ProgramDayReadModelService._session_sort_key(entry[0])
    )

    for offset, limit in ((0, 23), (37, 23), (129, 23), (220, 23)):
        page, has_more = ProgramDayReadModelService._paginate_session_entries(
            linked,
            other[:offset + limit + 1],
            offset,
            limit,
        )
        expected = complete_merge[offset:offset + limit]

        assert [(item.id, day_id) for item, day_id in page] == [
            (item.id, day_id) for item, day_id in expected
        ]
        assert has_more is (len(complete_merge) > offset + len(expected))


@pytest.mark.parametrize("offset", [0, 1, 20, 999])
def test_session_cursor_round_trips_non_negative_offsets(offset):
    cursor = ProgramDayReadModelService._encode_cursor(offset)
    assert ProgramDayReadModelService._decode_cursor(cursor) == offset


@pytest.mark.parametrize(
    "cursor",
    ["not-base64", "c2Vzc2lvbnM6LTE", "d3Jvbmc6MQ", "c2Vzc2lvbnM6bmFu"],
)
def test_session_cursor_rejects_malformed_negative_and_wrong_prefix_values(cursor):
    with pytest.raises(ValueError, match="Invalid cursor"):
        ProgramDayReadModelService._decode_cursor(cursor)


def test_session_pagination_uses_timestamp_then_id_for_stable_ties():
    timestamp = datetime(2026, 9, 1, tzinfo=timezone.utc)
    linked = [(SimpleNamespace(
        id="b", session_start=timestamp, completed_at=None, created_at=None,
    ), "day-1")]
    other = [SimpleNamespace(
        id="a", session_start=timestamp, completed_at=None, created_at=None,
    )]

    page, has_more = ProgramDayReadModelService._paginate_session_entries(
        linked, other, offset=0, limit=1
    )

    assert [(session.id, day_id) for session, day_id in page] == [("a", None)]
    assert has_more is True
