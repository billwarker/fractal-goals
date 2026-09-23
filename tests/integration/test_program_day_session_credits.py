import json
import uuid
from datetime import datetime, time, timedelta, timezone

import pytest
from sqlalchemy import event

from models import (
    ActivityDefinition,
    ActivityInstance,
    Program,
    ProgramBlock,
    ProgramDay,
    ProgramDaySessionCredit,
    ProgramDayTemplate,
    Session,
    SessionTemplate,
    activity_goal_associations,
)
from models.program import program_goals
from services.program_day_read_model_service import ProgramDayReadModelService


def _template(db_session, root_id, name, color):
    template = SessionTemplate(
        id=str(uuid.uuid4()), name=name, root_id=root_id,
        template_data=json.dumps({"template_color": color, "sections": []}),
    )
    db_session.add(template)
    return template


def _activity(db_session, root_id, name, goal_id=None):
    activity = ActivityDefinition(id=str(uuid.uuid4()), root_id=root_id, name=name)
    db_session.add(activity)
    db_session.flush()
    if goal_id:
        db_session.execute(activity_goal_associations.insert().values(
            activity_id=activity.id, goal_id=goal_id,
        ))
    return activity


def _session(db_session, owner_id, root_id, day_value, *, name, template=None, program_id=None,
             completed=True, hour=12, activity=None, seconds=0):
    started = datetime.combine(day_value, time(hour), tzinfo=timezone.utc)
    session = Session(
        owner_id=owner_id, root_id=root_id, name=name, completed=completed,
        template_id=template.id if template else None, program_id=program_id,
        session_start=started, session_end=started + timedelta(seconds=seconds or 60),
        total_duration_seconds=seconds or 60,
        completed_at=started + timedelta(seconds=seconds or 60) if completed else None,
    )
    db_session.add(session)
    db_session.flush()
    if activity:
        db_session.add(ActivityInstance(
            session_id=session.id, root_id=root_id, activity_definition_id=activity.id,
            completed=True, duration_seconds=seconds, time_stop=started + timedelta(seconds=seconds),
        ))
    return session


@pytest.fixture
def credit_world(db_session, test_user, sample_goal_hierarchy):
    """A program with one closed scheduled day needing two templates, and a mixed day of work."""
    root = sample_goal_hierarchy["ultimate"]
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)
    program = Program(
        root_id=root.id, name="Planche",
        start_date=datetime.combine(yesterday - timedelta(days=3), time.min),
        end_date=datetime.combine(today + timedelta(days=7), time.max),
        weekly_schedule={},
    )
    other_program = Program(
        root_id=root.id, name="Other",
        start_date=datetime.combine(yesterday, time.min),
        end_date=datetime.combine(today, time.max),
        weekly_schedule={},
    )
    db_session.add_all([program, other_program])
    db_session.flush()
    db_session.execute(program_goals.insert().values(
        program_id=program.id, goal_id=sample_goal_hierarchy["mid_term"].id,
    ))
    block = ProgramBlock(
        program_id=program.id, name="Month 1",
        start_date=yesterday - timedelta(days=3), end_date=today + timedelta(days=7),
    )
    db_session.add(block)
    db_session.flush()
    planned = _template(db_session, root.id, "Planche Focus", "#336699")
    second = _template(db_session, root.id, "Handstand", "#993366")
    unrelated = _template(db_session, root.id, "Run", "#669933")
    days = {}
    for label, value in (("yesterday", yesterday), ("today", today)):
        day = ProgramDay(block_id=block.id, date=value, name=f"Day {label}")
        db_session.add(day)
        db_session.flush()
        db_session.add_all([
            ProgramDayTemplate(program_day_id=day.id, session_template_id=planned.id, is_required=True, order=0),
            ProgramDayTemplate(program_day_id=day.id, session_template_id=second.id, is_required=True, order=1),
        ])
        days[label] = day
    aligned_activity = _activity(db_session, root.id, "Planche lean", sample_goal_hierarchy["mid_term"].id)
    unaligned_activity = _activity(db_session, root.id, "Jog")
    matched = _session(
        db_session, test_user.id, root.id, yesterday, name="Planche Focus", template=planned,
        hour=9, activity=aligned_activity, seconds=600,
    )
    off_plan = _session(
        db_session, test_user.id, root.id, yesterday, name="Run", template=unrelated,
        hour=11, activity=unaligned_activity, seconds=300,
    )
    other = _session(
        db_session, test_user.id, root.id, yesterday, name="Other program", template=second,
        program_id=other_program.id, hour=13,
    )
    db_session.commit()
    return {
        "root": root, "program": program, "block": block, "days": days,
        "today": today, "yesterday": yesterday,
        "templates": {"planned": planned, "second": second, "unrelated": unrelated},
        "sessions": {"matched": matched, "off_plan": off_plan, "other": other},
        "activities": {"aligned": aligned_activity},
        "goals": sample_goal_hierarchy,
    }


def _detail(client, world, day_value):
    response = client.get(
        f"/api/{world['root'].id}/programs/{world['program'].id}/day-read-model"
        f"?range_start={day_value}&range_end={day_value}&detail_date={day_value}&timezone=UTC"
    )
    assert response.status_code == 200
    return response.get_json()


def _put_credit(client, world, **body):
    return client.put(
        f"/api/{world['root'].id}/programs/{world['program'].id}/day-session-credits",
        json={"timezone": "UTC", "date": world["yesterday"].isoformat(), **body},
    )


@pytest.mark.integration
class TestProgramDayReviewSummary:
    def test_detail_lists_every_session_with_relation_credit_and_alignment(self, authed_client, credit_world):
        payload = _detail(authed_client, credit_world, credit_world["yesterday"].isoformat())
        detail = payload["detail"]
        sessions = {item["id"]: item for item in detail["sessions"]}
        matched = sessions[credit_world["sessions"]["matched"].id]
        off_plan = sessions[credit_world["sessions"]["off_plan"].id]
        other = sessions[credit_world["sessions"]["other"].id]

        assert payload["schema_version"] == 5
        assert detail["state"] == "scheduled_partial"
        assert detail["can_edit_credits"] is True
        assert (matched["relation"], matched["credit"]["source"]) == ("credited", "template_match")
        assert matched["credit_options"] == []
        assert matched["alignment"]["aligned_seconds"] == 600
        assert matched["alignment"]["goal_ids"] == [credit_world["goals"]["mid_term"].id]
        assert (off_plan["relation"], off_plan["credit"]) == ("off_plan", None)
        assert [option["template_id"] for option in off_plan["credit_options"]] == [
            credit_world["templates"]["second"].id,
        ]
        assert off_plan["alignment"]["aligned_seconds"] == 0
        assert other["relation"] == "other_program"
        assert detail["occurrences"][0]["credits"] == [{
            "session_id": credit_world["sessions"]["matched"].id,
            "template_id": credit_world["templates"]["planned"].id,
            "source": "template_match",
        }]
        assert "summary" not in detail
        day = payload["days"][0]
        assert day["completed_sessions"] == [
            {"id": credit_world["sessions"]["matched"].id, "name": "Planche Focus"},
            {"id": credit_world["sessions"]["off_plan"].id, "name": "Run"},
            {"id": credit_world["sessions"]["other"].id, "name": "Handstand"},
        ]

    def test_day_sessions_are_cursor_paged_in_effective_order(
        self, db_session, test_user, credit_world
    ):
        for index in range(3):
            _session(
                db_session, test_user.id, credit_world["root"].id, credit_world["yesterday"],
                name=f"Extra {index}", hour=15 + index,
            )
        db_session.commit()
        service = ProgramDayReadModelService(db_session)
        day_value = credit_world["yesterday"].isoformat()
        first, _error, _status = service.get(
            credit_world["root"].id, credit_world["program"].id, test_user.id,
            range_start=day_value, range_end=day_value, timezone_name="UTC",
            detail_date=day_value, session_limit=2,
        )
        second, _error, _status = service.get(
            credit_world["root"].id, credit_world["program"].id, test_user.id,
            range_start=day_value, range_end=day_value, timezone_name="UTC",
            detail_date=day_value, session_limit=2,
            session_cursor=first["detail"]["sessions_page"]["next_cursor"],
        )

        assert first["detail"]["sessions_page"]["has_more"] is True
        first_ids = [item["id"] for item in first["detail"]["sessions"]]
        second_ids = [item["id"] for item in second["detail"]["sessions"]]
        assert len(first_ids) == len(second_ids) == 2
        assert not set(first_ids) & set(second_ids)
        assert first_ids[0] == credit_world["sessions"]["matched"].id

    def test_unscheduled_past_date_lists_sessions_without_credit_actions(
        self, authed_client, db_session, test_user, credit_world
    ):
        quiet_day = credit_world["yesterday"] - timedelta(days=2)
        _session(
            db_session, test_user.id, credit_world["root"].id, quiet_day, name="Planche Focus",
            template=credit_world["templates"]["planned"], activity=credit_world["activities"]["aligned"],
            seconds=120,
        )
        db_session.commit()

        payload = _detail(authed_client, credit_world, quiet_day.isoformat())
        detail = payload["detail"]

        assert detail["scheduled"] is False
        assert detail["can_edit_credits"] is False
        assert detail["sessions"][0]["alignment"]["aligned_ratio"] == 1
        assert detail["sessions"][0]["relation"] == "off_plan"
        assert detail["sessions"][0]["credit_options"] == []
        assert payload["days"][0]["completed_sessions"][0]["name"] == "Planche Focus"

    def test_range_days_list_only_completed_sessions_and_nothing_for_future_dates(
        self, authed_client, db_session, test_user, credit_world
    ):
        _session(
            db_session, test_user.id, credit_world["root"].id, credit_world["yesterday"],
            name="Still open", completed=False, hour=20,
        )
        db_session.commit()
        start = credit_world["yesterday"].isoformat()
        end = (credit_world["today"] + timedelta(days=2)).isoformat()

        days = authed_client.get(
            f"/api/{credit_world['root'].id}/programs/{credit_world['program'].id}/day-read-model"
            f"?range_start={start}&range_end={end}&timezone=UTC"
        ).get_json()["days"]

        assert len(days[0]["completed_sessions"]) == 3
        assert all(day["completed_sessions"] == [] for day in days[2:])

    def test_detail_query_count_is_independent_of_session_count(self, db_session, test_user, credit_world):
        def count_statements():
            statements = []
            engine = db_session.get_bind()

            def capture(_conn, _cursor, statement, _params, _context, _many):
                statements.append(statement)

            event.listen(engine, "before_cursor_execute", capture)
            try:
                day_value = credit_world["yesterday"].isoformat()
                _payload, error, status = ProgramDayReadModelService(db_session).get(
                    credit_world["root"].id, credit_world["program"].id, test_user.id,
                    range_start=day_value, range_end=day_value, timezone_name="UTC",
                    detail_date=day_value,
                )
                assert (error, status) == (None, 200)
            finally:
                event.remove(engine, "before_cursor_execute", capture)
            db_session.expire_all()
            return len(statements)

        baseline = count_statements()
        for index in range(6):
            _session(
                db_session, test_user.id, credit_world["root"].id, credit_world["yesterday"],
                name=f"Load {index}", template=credit_world["templates"]["planned"],
                activity=credit_world["activities"]["aligned"], seconds=60, hour=14,
            )
        db_session.commit()

        assert count_statements() == baseline
        # Includes one batched load of explicit occurrence schedules and one of calendar periods.
        assert baseline <= 34


@pytest.mark.integration
class TestProgramDaySessionCredits:
    def test_manual_credit_satisfies_the_day_then_automatic_restores_it(self, authed_client, credit_world):
        off_plan_id = credit_world["sessions"]["off_plan"].id
        response = _put_credit(
            authed_client, credit_world, session_id=off_plan_id, disposition="credit",
            template_id=credit_world["templates"]["second"].id,
        )
        assert response.status_code == 200
        body = response.get_json()
        assert body["disposition"] == "credit"
        credited = next(item for item in body["day"]["detail"]["sessions"] if item["id"] == off_plan_id)
        assert credited["credit"]["source"] == "manual"
        assert body["day"]["detail"]["state"] == "scheduled_met"

        repeat = _put_credit(
            authed_client, credit_world, session_id=off_plan_id, disposition="credit",
            template_id=credit_world["templates"]["second"].id,
        )
        assert repeat.status_code == 200

        yesterday = credit_world["yesterday"].isoformat()
        metrics = authed_client.get(
            f"/api/{credit_world['root'].id}/programs/{credit_world['program'].id}/metrics"
            f"?range_start={yesterday}&range_end={yesterday}&timezone=UTC"
        ).get_json()
        assert metrics["calculation_version"] == 6
        assert metrics["days"][0]["state"] == "scheduled_met"

        restored = _put_credit(authed_client, credit_world, session_id=off_plan_id, disposition="automatic")
        assert restored.status_code == 200
        assert restored.get_json()["day"]["detail"]["state"] == "scheduled_partial"

    def test_exclusion_removes_an_automatic_credit_only(self, authed_client, db_session, credit_world):
        refused = _put_credit(
            authed_client, credit_world,
            session_id=credit_world["sessions"]["off_plan"].id, disposition="exclude",
        )
        assert refused.status_code == 400
        assert refused.get_json()["code"] == "no_automatic_credit"

        excluded = _put_credit(
            authed_client, credit_world,
            session_id=credit_world["sessions"]["matched"].id, disposition="exclude",
        )
        assert excluded.status_code == 200
        detail = excluded.get_json()["day"]["detail"]
        matched = next(item for item in detail["sessions"] if item["id"] == credit_world["sessions"]["matched"].id)
        assert (matched["relation"], matched["excluded"]) == ("off_plan", True)
        assert detail["state"] == "scheduled_missed"
        assert db_session.query(ProgramDaySessionCredit).filter_by(
            program_id=credit_world["program"].id, disposition="exclude",
        ).count() == 1

    @pytest.mark.parametrize(
        ("case", "code"),
        [
            ("future", "future_date"),
            ("wrong_date", "session_not_on_date"),
            ("incomplete", "session_incomplete"),
            ("not_scheduled", "not_scheduled"),
            ("template", "template_not_scheduled"),
        ],
    )
    def test_ineligible_credits_are_rejected(self, authed_client, db_session, test_user, credit_world, case, code):
        session_id = credit_world["sessions"]["off_plan"].id
        date_value = credit_world["yesterday"]
        template_id = credit_world["templates"]["second"].id
        if case == "future":
            date_value = credit_world["today"] + timedelta(days=1)
        elif case == "wrong_date":
            date_value = credit_world["today"]
        elif case == "incomplete":
            session_id = _session(
                db_session, test_user.id, credit_world["root"].id, credit_world["yesterday"],
                name="Open", completed=False,
            ).id
            db_session.commit()
        elif case == "not_scheduled":
            date_value = credit_world["yesterday"] - timedelta(days=1)
            session_id = _session(
                db_session, test_user.id, credit_world["root"].id, date_value, name="Quiet day",
            ).id
            db_session.commit()
        elif case == "template":
            template_id = credit_world["templates"]["unrelated"].id

        response = _put_credit(
            authed_client, credit_world, date=date_value.isoformat(), session_id=session_id,
            disposition="credit", template_id=template_id,
        )

        assert response.status_code == 400
        assert response.get_json()["code"] == code
        assert db_session.query(ProgramDaySessionCredit).count() == 0

    def test_payload_validation_and_hidden_resources(self, authed_client, credit_world):
        missing_template = _put_credit(
            authed_client, credit_world, session_id=credit_world["sessions"]["off_plan"].id,
            disposition="credit",
        )
        assert missing_template.status_code == 400
        stray_template = _put_credit(
            authed_client, credit_world, session_id=credit_world["sessions"]["off_plan"].id,
            disposition="exclude", template_id=credit_world["templates"]["second"].id,
        )
        assert stray_template.status_code == 400
        malformed_date = _put_credit(
            authed_client, credit_world, date="2026-9-01",
            session_id=credit_world["sessions"]["off_plan"].id, disposition="automatic",
        )
        assert malformed_date.status_code == 400
        unknown_session = _put_credit(
            authed_client, credit_world, session_id=str(uuid.uuid4()), disposition="automatic",
        )
        assert unknown_session.status_code == 404
        unknown_program = authed_client.put(
            f"/api/{credit_world['root'].id}/programs/{uuid.uuid4()}/day-session-credits",
            json={
                "timezone": "UTC", "date": credit_world["yesterday"].isoformat(),
                "session_id": credit_world["sessions"]["off_plan"].id, "disposition": "automatic",
            },
        )
        assert unknown_program.status_code == 404

    def test_day_options_reflect_template_matched_sessions(self, authed_client, db_session, test_user, credit_world):
        _session(
            db_session, test_user.id, credit_world["root"].id, credit_world["today"],
            name="Planche Focus", template=credit_world["templates"]["planned"], hour=0,
        )
        db_session.commit()

        options = authed_client.get(
            f"/api/{credit_world['root'].id}/programs/day-options"
            f"?date={credit_world['today'].isoformat()}&timezone=UTC"
        ).get_json()
        row = next(item for item in options if item["day_id"] == credit_world["days"]["today"].id)

        assert row["completed_template_ids"] == [credit_world["templates"]["planned"].id]
        assert row["completed_session_count"] == 1
