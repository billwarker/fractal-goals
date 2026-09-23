from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest

from models import (
    CalendarPeriod,
    Goal,
    Program,
    ProgramBlock,
    ProgramDay,
    ProgramDayTemplate,
    Session,
    SessionTemplate,
    User,
)


@pytest.fixture
def period_world(db_session, test_user, sample_ultimate_goal):
    """A program scheduled every day for the past week, with one day completed."""
    root = sample_ultimate_goal
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=7)
    end = today + timedelta(days=7)
    program = Program(
        root_id=root.id, name="Streak program",
        start_date=datetime.combine(start, time.min), end_date=datetime.combine(end, time.max),
        weekly_schedule={},
    )
    db_session.add(program)
    db_session.flush()
    block = ProgramBlock(program_id=program.id, name="Block", start_date=start, end_date=end)
    template = SessionTemplate(id=str(uuid4()), name="Daily", root_id=root.id, template_data="{}")
    db_session.add_all([block, template])
    db_session.flush()
    day = ProgramDay(
        block_id=block.id, name="Every day",
        day_of_week=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    )
    db_session.add(day)
    db_session.flush()
    db_session.add(ProgramDayTemplate(program_day_id=day.id, session_template_id=template.id, is_required=True, order=0))
    met_date = today - timedelta(days=3)
    db_session.add(Session(
        owner_id=test_user.id, root_id=root.id, name="Daily", completed=True,
        template_id=template.id, program_id=program.id, program_day_id=day.id,
        session_start=datetime.combine(met_date, time(12), tzinfo=timezone.utc),
        completed_at=datetime.combine(met_date, time(13), tzinfo=timezone.utc),
    ))
    db_session.commit()
    return {"root": root, "program": program, "today": today, "start": start, "met_date": met_date}


def _url(world, suffix=""):
    return f"/api/{world['root'].id}/calendar-periods{suffix}"


def _days(client, world, start, end):
    payload = client.get(
        f"/api/{world['root'].id}/programs/{world['program'].id}/day-read-model"
        f"?range_start={start}&range_end={end}&timezone=UTC"
    ).get_json()
    return payload, {day["date"]: day for day in payload["days"]}


@pytest.mark.integration
class TestCalendarPeriodsApi:
    def test_period_lifecycle_protects_streaks_and_restores_automatic_state(
        self, authed_client, db_session, period_world, monkeypatch,
    ):
        emitted = []
        monkeypatch.setattr("services.calendar_periods.event_bus.emit", emitted.append)
        today = period_world["today"]
        first, last = today - timedelta(days=5), today - timedelta(days=2)
        created = authed_client.post(_url(period_world), json={
            "name": "Lisbon", "kind": "vacation",
            "start_date": first.isoformat(), "end_date": last.isoformat(),
        })
        assert created.status_code == 201
        period = created.get_json()
        assert period | {"id": None} == {
            "id": None, "name": "Lisbon", "kind": "vacation", "start_date": first.isoformat(),
            "end_date": last.isoformat(), "protects_streaks": True, "notes": None,
        }

        payload, days = _days(authed_client, period_world, period_world["start"], today)
        assert payload["schema_version"] == 5
        assert [item["id"] for item in payload["periods"]] == [period["id"]]
        assert days[first.isoformat()]["state"] == "rest"
        assert days[first.isoformat()]["status_source"] == "period"
        assert days[first.isoformat()]["period_id"] == period["id"]
        assert days[period_world["met_date"].isoformat()]["state"] == "scheduled_met"
        assert days[(first - timedelta(days=1)).isoformat()]["state"] == "scheduled_missed"
        assert payload["range_summary"]["period_rest_dates"] == 3

        metrics = authed_client.get(
            f"/api/{period_world['root'].id}/programs/{period_world['program'].id}/metrics"
            f"?range_start={period_world['start']}&range_end={today}&timezone=UTC"
        ).get_json()
        assert metrics["calculation_version"] == 6
        assert metrics["adherence"]["period_rest_days"] == 3
        assert [item["id"] for item in metrics["periods"]] == [period["id"]]
        metric_states = {day["date"]: day["state"] for day in metrics["days"]}
        assert all(metric_states[key] == day["state"] for key, day in days.items() if key in metric_states)

        informational = authed_client.put(_url(period_world, f"/{period['id']}"), json={"protects_streaks": False})
        assert informational.status_code == 200
        _payload, days = _days(authed_client, period_world, first, first)
        assert days[first.isoformat()]["state"] == "scheduled_missed"
        assert days[first.isoformat()]["period_ids"] == [period["id"]]

        deleted = authed_client.delete(_url(period_world, f"/{period['id']}"))
        assert deleted.status_code == 200
        _payload, days = _days(authed_client, period_world, first, first)
        assert days[first.isoformat()]["period_ids"] == []
        assert db_session.get(CalendarPeriod, period["id"]).deleted_at is not None
        assert authed_client.get(
            _url(period_world, f"?start={first}&end={last}")
        ).get_json() == []
        assert [event.name for event in emitted] == [
            "calendar_period.created", "calendar_period.updated", "calendar_period.deleted",
        ]
        assert emitted[0].data["calendar_period_id"] == period["id"]

    def test_future_period_is_planned_rest_and_reported_to_day_options(self, authed_client, period_world):
        today = period_world["today"]
        assert authed_client.post(_url(period_world), json={
            "name": "Trip", "kind": "travel",
            "start_date": today.isoformat(), "end_date": (today + timedelta(days=3)).isoformat(),
        }).status_code == 201

        _payload, days = _days(authed_client, period_world, today, today + timedelta(days=3))
        assert all(day["state"] == "rest" for day in days.values())
        options = authed_client.get(
            f"/api/{period_world['root'].id}/programs/day-options?date={today}&timezone=UTC"
        ).get_json()
        assert options[0]["time_off"]["name"] == "Trip"

    @pytest.mark.parametrize("body", [
        {"name": "Reversed", "start_date": "2026-09-10", "end_date": "2026-09-01"},
        {"name": "Too long", "start_date": "2026-01-01", "end_date": "2027-01-02"},
        {"name": "Bad kind", "kind": "party", "start_date": "2026-09-01", "end_date": "2026-09-02"},
        {"name": "x" * 121, "start_date": "2026-09-01", "end_date": "2026-09-02"},
        {"name": "Bad date", "start_date": "2026-9-1", "end_date": "2026-09-02"},
        {"name": "Extra", "start_date": "2026-09-01", "end_date": "2026-09-02", "program_id": "p"},
    ])
    def test_create_rejects_invalid_periods(self, authed_client, period_world, body):
        assert authed_client.post(_url(period_world), json=body).status_code == 400

    def test_update_and_list_validate_ranges(self, authed_client, period_world):
        period = authed_client.post(_url(period_world), json={
            "name": "Week", "start_date": "2026-09-01", "end_date": "2026-09-07",
        }).get_json()
        reversed_update = authed_client.put(_url(period_world, f"/{period['id']}"), json={"end_date": "2026-08-01"})
        assert reversed_update.status_code == 400
        assert authed_client.get(_url(period_world, "?start=2026-09-01&end=bad")).status_code == 400
        assert authed_client.get(_url(period_world, "?start=2026-09-10&end=2026-09-01")).status_code == 400
        listed = authed_client.get(_url(period_world, "?start=2026-09-07&end=2026-09-30")).get_json()
        assert [item["id"] for item in listed] == [period["id"]]
        assert authed_client.get(_url(period_world, "?start=2026-09-08&end=2026-09-30")).get_json() == []

    def test_periods_are_tenant_isolated(self, authed_client, db_session, period_world):
        outsider = User(id=str(uuid4()), username="period-outsider", email="period-outsider@example.com")
        outsider.set_password("Password123")
        other_root = Goal(id=str(uuid4()), root_id=None, owner_id=outsider.id, name="Other", description="")
        other_root.root_id = other_root.id
        db_session.add_all([outsider, other_root])
        db_session.flush()
        foreign = CalendarPeriod(
            root_id=other_root.id, owner_id=outsider.id, name="Private",
            start_date=date(2026, 9, 1), end_date=date(2026, 9, 2),
        )
        db_session.add(foreign)
        db_session.commit()
        body = {"name": "Mine", "start_date": "2026-09-01", "end_date": "2026-09-02"}

        assert authed_client.post(f"/api/{other_root.id}/calendar-periods", json=body).status_code == 404
        assert authed_client.get(
            f"/api/{other_root.id}/calendar-periods?start=2026-09-01&end=2026-09-02"
        ).status_code == 404
        assert authed_client.put(_url(period_world, f"/{foreign.id}"), json={"name": "Stolen"}).status_code == 404
        assert authed_client.delete(_url(period_world, f"/{foreign.id}")).status_code == 404
        assert db_session.get(CalendarPeriod, foreign.id).name == "Private"
