import json
import uuid
from datetime import date, datetime, time, timedelta, timezone

import pytest

from models import (
    Program,
    ProgramBlock,
    ProgramDay,
    ProgramDayTemplate,
    Session,
    SessionTemplate,
)

# Fields both the feed and the single-program read model derive from the same facts.
PARITY_FIELDS = (
    "date", "state", "automatic_state", "status_source", "manual_status", "scheduled",
    "closed", "counts_toward_adherence", "counts_as_success", "breaks_chain",
    "requirements_met", "completed_template_count", "chain_role", "run_length_at_date",
    "occurrence_count", "block_ids",
)


def _template(db_session, root_id, name, color):
    template = SessionTemplate(
        id=str(uuid.uuid4()), name=name, root_id=root_id,
        template_data=json.dumps({"template_color": color, "sections": []}),
    )
    db_session.add(template)
    return template


def _session(db_session, owner_id, root_id, day_value, *, name, template=None, program_id=None, hour=12):
    started = datetime.combine(day_value, time(hour), tzinfo=timezone.utc)
    session = Session(
        owner_id=owner_id, root_id=root_id, name=name, completed=True,
        template_id=template.id if template else None, program_id=program_id,
        session_start=started, session_end=started + timedelta(minutes=30),
        total_duration_seconds=1800, completed_at=started + timedelta(minutes=30),
    )
    db_session.add(session)
    db_session.flush()
    return session


def _program(db_session, root_id, name, start, end, template, weekdays):
    program = Program(
        root_id=root_id, name=name, color="#123456",
        start_date=datetime.combine(start, time.min),
        end_date=datetime.combine(end, time.max),
        weekly_schedule={},
    )
    db_session.add(program)
    db_session.flush()
    block = ProgramBlock(program_id=program.id, name=f"{name} block", start_date=start, end_date=end, color="#abcdef")
    db_session.add(block)
    db_session.flush()
    day = ProgramDay(block_id=block.id, name=f"{name} day", day_of_week=weekdays)
    db_session.add(day)
    db_session.flush()
    db_session.add(ProgramDayTemplate(program_day_id=day.id, session_template_id=template.id, is_required=True, order=0))
    return program, block, day


@pytest.fixture
def feed_world(db_session, test_user, sample_goal_hierarchy):
    """Two programs in consecutive months that share a template, plus an off-program session."""
    root = sample_goal_hierarchy["ultimate"]
    today = datetime.now(timezone.utc).date()
    month_start = today.replace(day=1) - timedelta(days=62)
    month_start = month_start.replace(day=1)
    next_month = (month_start + timedelta(days=32)).replace(day=1)
    template = _template(db_session, root.id, "Strength", "#336699")
    every_day = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    first, _first_block, first_day = _program(
        db_session, root.id, "First", month_start, next_month + timedelta(days=4), template, every_day,
    )
    second, _second_block, second_day = _program(
        db_session, root.id, "Second", next_month, next_month + timedelta(days=27), template, every_day,
    )
    overlap_day = next_month + timedelta(days=2)
    shared = _session(db_session, test_user.id, root.id, overlap_day, name="Strength", template=template)
    loose = _session(db_session, test_user.id, root.id, month_start + timedelta(days=5), name="Walk")
    db_session.commit()
    return {
        "root": root, "first": first, "second": second, "template": template,
        "first_day": first_day, "second_day": second_day,
        "month_start": month_start, "next_month": next_month,
        "overlap_day": overlap_day, "shared": shared, "loose": loose,
    }


def _feed(client, root_id, start, end, tz="UTC"):
    return client.get(
        f"/api/{root_id}/programs/calendar-feed?range_start={start}&range_end={end}&timezone={tz}"
    )


def _month_end(value: date) -> date:
    return (value.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)


@pytest.mark.integration
class TestProgramCalendarFeed:
    def test_returns_every_overlapping_program_and_nothing_outside_the_range(self, authed_client, feed_world):
        start = feed_world["next_month"]
        payload = _feed(authed_client, feed_world["root"].id, start, _month_end(start)).get_json()

        assert payload["schema_version"] == 1
        assert {item["id"] for item in payload["programs"]} == {feed_world["first"].id, feed_world["second"].id}
        assert {item["program_id"] for item in payload["blocks"]} == {feed_world["first"].id, feed_world["second"].id}
        for day in payload["program_days"]:
            program = feed_world["first"] if day["program_id"] == feed_world["first"].id else feed_world["second"]
            assert program.start_date.date().isoformat() <= day["date"] <= program.end_date.date().isoformat()
            assert start.isoformat() <= day["date"] <= _month_end(start).isoformat()

        earlier = feed_world["month_start"]
        first_only = _feed(authed_client, feed_world["root"].id, earlier, earlier + timedelta(days=6)).get_json()
        assert [item["id"] for item in first_only["programs"]] == [feed_world["first"].id]

    def test_day_facts_match_the_single_program_read_model(self, authed_client, feed_world):
        start = feed_world["next_month"]
        end = _month_end(start)
        feed = _feed(authed_client, feed_world["root"].id, start, end).get_json()
        for program in (feed_world["first"], feed_world["second"]):
            read_model = authed_client.get(
                f"/api/{feed_world['root'].id}/programs/{program.id}/day-read-model"
                f"?range_start={start}&range_end={end}&timezone=UTC"
            ).get_json()
            expected = {day["date"]: day for day in read_model["days"]}
            feed_days = [day for day in feed["program_days"] if day["program_id"] == program.id]
            assert feed_days
            for day in feed_days:
                assert {key: day[key] for key in PARITY_FIELDS} == {
                    key: expected[day["date"]][key] for key in PARITY_FIELDS
                }

    def test_occurrence_ribbons_are_light_and_evaluated(self, authed_client, feed_world):
        start = feed_world["next_month"]
        payload = _feed(authed_client, feed_world["root"].id, start, _month_end(start)).get_json()
        overlap = [
            day for day in payload["program_days"]
            if day["date"] == feed_world["overlap_day"].isoformat()
        ]
        assert {day["program_id"] for day in overlap} == {feed_world["first"].id, feed_world["second"].id}
        for day in overlap:
            (occurrence,) = day["occurrences"]
            assert occurrence["requirements_met"] is True
            assert occurrence["templates"] == [{
                "id": feed_world["template"].id, "name": "Strength", "color": "#336699", "is_required": True,
            }]
            assert "template_data" not in json.dumps(occurrence)

    def test_sessions_are_listed_once_with_credits_unioned_across_programs(self, authed_client, feed_world):
        start = feed_world["next_month"]
        payload = _feed(authed_client, feed_world["root"].id, start, _month_end(start)).get_json()
        (day,) = [
            item for item in payload["completed_session_days"]
            if item["date"] == feed_world["overlap_day"].isoformat()
        ]
        (session,) = day["completed_sessions"]
        assert session["id"] == feed_world["shared"].id
        assert session["program_day_ids"] == sorted([feed_world["first_day"].id, feed_world["second_day"].id])

    def test_sessions_appear_without_any_program(self, authed_client, db_session, test_user, feed_world):
        quiet = feed_world["month_start"] - timedelta(days=90)
        _session(db_session, test_user.id, feed_world["root"].id, quiet, name="Solo")
        db_session.commit()
        payload = _feed(authed_client, feed_world["root"].id, quiet, quiet + timedelta(days=6)).get_json()

        assert payload["programs"] == []
        assert payload["program_days"] == []
        assert [s["name"] for d in payload["completed_session_days"] for s in d["completed_sessions"]] == ["Solo"]

    def test_unchanged_chunk_revalidates_with_304(self, authed_client, client, auth_headers, feed_world):
        start = feed_world["next_month"]
        first = _feed(authed_client, feed_world["root"].id, start, _month_end(start))
        assert first.headers["Cache-Control"] == "private, no-cache"
        etag = first.headers["ETag"]
        again = client.get(
            f"/api/{feed_world['root'].id}/programs/calendar-feed"
            f"?range_start={start}&range_end={_month_end(start)}&timezone=UTC",
            headers={**auth_headers, "If-None-Match": etag},
        )
        assert again.status_code == 304

    @pytest.mark.parametrize("query, code", [
        ("range_start=2026-01-01&range_end=2026-03-15&timezone=UTC", 400),
        ("range_start=2026-02-01&range_end=2026-01-01&timezone=UTC", 400),
        ("range_start=bad&range_end=2026-01-01&timezone=UTC", 400),
        ("range_start=2026-01-01&range_end=2026-01-31", 400),
        ("range_start=2026-01-01&range_end=2026-01-31&timezone=Not/AZone", 400),
    ])
    def test_rejects_invalid_ranges(self, authed_client, feed_world, query, code):
        response = authed_client.get(f"/api/{feed_world['root'].id}/programs/calendar-feed?{query}")
        assert response.status_code == code

    def test_hides_other_users_roots(self, authed_client):
        response = _feed(authed_client, str(uuid.uuid4()), "2026-01-01", "2026-01-31")
        assert response.status_code == 404
