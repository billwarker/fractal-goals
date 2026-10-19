from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from models import Goal, Program, ProgramBlock, ProgramDay, program_goals, program_day_goals
from models import Session, ActivityInstance
import services.completion_handlers as completion_handlers
from services.completion_handlers import (
    handle_activity_metrics_updated,
    handle_activity_instance_updated,
)
from services._completion_programs import _check_parent_completion
from services.events import Event, Events
from services.programs import ProgramService
from services._session_lifecycle_common import _parse_iso_datetime_strict
from services.session_service import SessionService


@pytest.mark.unit
class TestSessionServiceHelpers:
    def test_extract_activity_definition_id_from_supported_shapes(self):
        assert SessionService._extract_activity_definition_id("activity-1") == "activity-1"
        assert SessionService._extract_activity_definition_id({"activity_id": "activity-2"}) == "activity-2"
        assert SessionService._extract_activity_definition_id({"activityDefinitionId": "activity-3"}) == "activity-3"
        assert SessionService._extract_activity_definition_id({"activity": {"id": "activity-4"}}) == "activity-4"
        assert SessionService._extract_activity_definition_id({"activity": {"activity_definition_id": "activity-5"}}) == "activity-5"
        assert SessionService._extract_activity_definition_id({"unknown": "value"}) is None

    def test_parse_iso_datetime_strict_normalizes_to_utc(self):
        parsed = _parse_iso_datetime_strict("2026-02-18T15:30:00Z")
        assert parsed.tzinfo is not None
        assert parsed == datetime(2026, 2, 18, 15, 30, tzinfo=timezone.utc)

    def test_parse_iso_datetime_strict_accepts_naive_and_rejects_non_string(self):
        naive = _parse_iso_datetime_strict("2026-02-18T15:30:00")
        assert naive.tzinfo == timezone.utc

        with pytest.raises(ValueError):
            _parse_iso_datetime_strict(123)


@pytest.mark.unit
class TestCompletionHandlersHelpers:
    def test_check_parent_completion_queues_goal_completed_event(self, db_session, sample_ultimate_goal, monkeypatch):
        parent = Goal(
            id="parent-goal",
            name="Parent Goal",
            parent_id=sample_ultimate_goal.id,
            root_id=sample_ultimate_goal.id,
            completed=False,
            completion_condition='children',
        )
        child = Goal(
            name="Child Goal",
            parent_id=parent.id,
            root_id=sample_ultimate_goal.id,
            completed=True,
        )
        db_session.add_all([parent, child])
        db_session.flush()

        emitted = []
        pending_events = []
        monkeypatch.setattr(completion_handlers.event_bus, "emit", lambda event: emitted.append(event.name))

        _check_parent_completion(db_session, parent, pending_events=pending_events)

        assert parent.completed is True
        assert emitted == []
        assert [event.name for event in pending_events] == [Events.GOAL_COMPLETED]


@pytest.mark.unit
class TestProgramServiceGoalReplacement:
    def test_replace_program_goals_replaces_existing_and_deduplicates(self, db_session, sample_ultimate_goal):
        program = Program(
            root_id=sample_ultimate_goal.id,
            name="Program A",
            description="",
            start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_date=datetime(2026, 2, 1, tzinfo=timezone.utc),
            weekly_schedule=[],
            is_active=True,
        )
        goal_a = Goal(name="Goal A", parent_id=sample_ultimate_goal.id, root_id=sample_ultimate_goal.id)
        goal_b = Goal(name="Goal B", parent_id=sample_ultimate_goal.id, root_id=sample_ultimate_goal.id)
        db_session.add_all([program, goal_a, goal_b])
        db_session.flush()

        replaced = ProgramService._replace_program_goals(
            db_session,
            program.id,
            [goal_a.id, goal_a.id, goal_b.id],
            sample_ultimate_goal.id,
        )
        replaced_ids = {g.id for g in replaced}
        assert replaced_ids == {goal_a.id, goal_b.id}

        rows = db_session.execute(
            program_goals.select().where(program_goals.c.program_id == program.id)
        ).all()
        assert len(rows) == 2

        ProgramService._replace_program_goals(
            db_session,
            program.id,
            [goal_b.id],
            sample_ultimate_goal.id,
        )
        rows = db_session.execute(
            program_goals.select().where(program_goals.c.program_id == program.id)
        ).all()
        assert len(rows) == 1
        assert rows[0].goal_id == goal_b.id

    def test_replace_day_goals_rejects_missing_goals(self, db_session, sample_ultimate_goal):
        program = Program(
            root_id=sample_ultimate_goal.id,
            name="Program B",
            description="",
            start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_date=datetime(2026, 2, 1, tzinfo=timezone.utc),
            weekly_schedule=[],
            is_active=True,
        )
        block = ProgramBlock(program=program, name="Block A")
        day = ProgramDay(program=block.program, name="Day A")
        goal = Goal(name="Goal C", parent_id=sample_ultimate_goal.id, root_id=sample_ultimate_goal.id)
        db_session.add_all([program, block, day, goal])
        db_session.flush()

        ProgramService._replace_day_goals(db_session, day, [goal.id], sample_ultimate_goal.id)
        rows = db_session.execute(
            program_day_goals.select().where(
                program_day_goals.c.program_day_id == day.id,
                program_day_goals.c.deleted_at.is_(None),
            )
        ).all()
        assert len(rows) == 1

        with pytest.raises(ValueError, match="Goals not found in this fractal"):
            ProgramService._replace_day_goals(
                db_session,
                day,
                [goal.id, "missing-goal-id"],
                sample_ultimate_goal.id,
            )


@pytest.mark.unit
class TestSessionServicePublicFlows:
    def test_update_session_marks_session_and_started_instances_complete(
        self,
        db_session,
        test_user,
        sample_ultimate_goal,
        sample_practice_session,
        sample_activity_instance,
        monkeypatch,
    ):
        service = SessionService(db_session)
        emitted = []
        monkeypatch.setattr("services.events.event_bus.emit", lambda event: emitted.append(event.name))
        sample_activity_instance.time_start = datetime.now(timezone.utc)
        db_session.commit()

        payload, error, status = service.update_session(
            sample_ultimate_goal.id,
            sample_practice_session.id,
            test_user.id,
            {"completed": True},
        )

        assert status == 200
        assert error is None
        assert payload["id"] == sample_practice_session.id

        refreshed_session = db_session.query(Session).filter_by(id=sample_practice_session.id).first()
        refreshed_instance = db_session.query(ActivityInstance).filter_by(id=sample_activity_instance.id).first()

        assert refreshed_session.completed is True
        assert refreshed_session.completed_at is not None
        assert refreshed_instance.completed is True
        assert refreshed_instance.time_start is not None
        assert refreshed_instance.time_stop is not None
        assert refreshed_instance.duration_seconds == 0
        assert Events.SESSION_UPDATED in emitted
        assert Events.SESSION_COMPLETED in emitted

    def test_update_session_rejects_invalid_datetime(self, db_session, test_user, sample_ultimate_goal, sample_practice_session):
        service = SessionService(db_session)

        payload, error, status = service.update_session(
            sample_ultimate_goal.id,
            sample_practice_session.id,
            test_user.id,
            {"session_start": 123},
        )

        assert payload is None
        assert status == 400
        assert "Invalid session_start format" in error


@pytest.mark.unit
class TestProgramServicePublicFlows:
    def test_create_program_links_selected_goals_without_touching_other_programs(self, db_session, sample_ultimate_goal):
        # Programs no longer enforce a single-active-program invariant: the
        # calendar-first programs page supports multiple concurrent programs,
        # so creating a program must leave existing programs untouched.
        existing = Program(
            root_id=sample_ultimate_goal.id,
            name="Existing",
            description="",
            start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_date=datetime(2026, 1, 31, tzinfo=timezone.utc),
            weekly_schedule=[],
            is_active=True,
        )
        selected_goal = Goal(name="Selected Goal", parent_id=sample_ultimate_goal.id, root_id=sample_ultimate_goal.id)
        db_session.add_all([existing, selected_goal])
        db_session.flush()

        created = ProgramService.create_program(
            db_session,
            sample_ultimate_goal.id,
            {
                "name": "New Program",
                "description": "desc",
                "start_date": "2026-02-01T00:00:00Z",
                "end_date": "2026-02-28T00:00:00Z",
                "weeklySchedule": [],
                "selectedGoals": [selected_goal.id],
                "is_active": True,
            },
        )
        db_session.commit()

        existing_refreshed = db_session.query(Program).filter_by(id=existing.id).first()
        new_refreshed = db_session.query(Program).filter_by(id=created["id"]).first()
        assert existing_refreshed.is_active is True
        assert new_refreshed is not None

        linked_rows = db_session.execute(
            program_goals.select().where(program_goals.c.program_id == new_refreshed.id)
        ).all()
        assert len(linked_rows) == 1
        assert linked_rows[0].goal_id == selected_goal.id

    def test_update_program_does_not_deactivate_other_programs(self, db_session, sample_ultimate_goal):
        program_a = Program(
            root_id=sample_ultimate_goal.id,
            name="Program A",
            description="",
            start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_date=datetime(2026, 1, 31, tzinfo=timezone.utc),
            weekly_schedule=[],
            is_active=True,
        )
        program_b = Program(
            root_id=sample_ultimate_goal.id,
            name="Program B",
            description="",
            start_date=datetime(2026, 2, 1, tzinfo=timezone.utc),
            end_date=datetime(2026, 2, 28, tzinfo=timezone.utc),
            weekly_schedule=[],
            is_active=False,
        )
        db_session.add_all([program_a, program_b])
        db_session.commit()

        updated = ProgramService.update_program(
            db_session,
            sample_ultimate_goal.id,
            program_b.id,
            {"name": "Program B Renamed"},
        )
        db_session.commit()

        assert updated is not None
        refreshed_a = db_session.query(Program).filter_by(id=program_a.id).first()
        refreshed_b = db_session.query(Program).filter_by(id=program_b.id).first()
        assert refreshed_a.is_active is True
        assert refreshed_b.name == "Program B Renamed"


@pytest.mark.unit
class TestCompletionHandlerPublicFlow:
    def _capture_reconciles(self, monkeypatch, fake_db):
        reconciled = []
        monkeypatch.setattr(completion_handlers, "_get_db_session", lambda: fake_db)
        monkeypatch.setattr(
            completion_handlers,
            "_reconcile_activities",
            lambda _db, root_id, activity_ids, pending_events, *, trigger: reconciled.append(
                (root_id, set(activity_ids), trigger)
            ),
        )
        return reconciled

    def test_completion_toggles_reconcile_the_instances_activity(self, monkeypatch):
        fake_db = _fake_db_session(SimpleNamespace(completed=False, root_id="root-1", activity_definition_id="act-1"))
        reconciled = self._capture_reconciles(monkeypatch, fake_db)

        handle_activity_instance_updated(Event(Events.ACTIVITY_INSTANCE_UPDATED, {
            "instance_id": "inst-1", "session_id": "session-1", "root_id": "root-1", "updated_fields": ["completed"],
        }))

        assert reconciled == [("root-1", {"act-1"}, "activity_instance_updated")]
        assert fake_db.committed is True
        assert fake_db.closed is True

    def test_non_lifecycle_fields_do_not_open_a_session(self, monkeypatch):
        monkeypatch.setattr(
            completion_handlers, "_get_db_session",
            lambda: pytest.fail("Non-lifecycle updates must not open a database session"),
        )

        handle_activity_instance_updated(Event(Events.ACTIVITY_INSTANCE_UPDATED, {
            "instance_id": "inst-1", "session_id": "session-1", "root_id": "root-1", "updated_fields": ["notes"],
        }))

    def test_metric_edits_reconcile_and_record_live_progress(self, monkeypatch):
        instance = SimpleNamespace(completed=True, root_id="root-3", activity_definition_id="act-3")
        fake_db = _fake_db_session(instance)
        reconciled = self._capture_reconciles(monkeypatch, fake_db)
        monkeypatch.setattr(
            completion_handlers.ProgressService, "get_progress_for_instance", lambda _self, instance_id: {"id": instance_id},
        )

        handle_activity_metrics_updated(Event(Events.ACTIVITY_METRICS_UPDATED, {
            "instance_id": "inst-3", "session_id": "session-3", "root_id": "root-3",
            "activity_definition_id": "act-3", "updated_fields": ["sets"],
        }))

        assert reconciled == [("root-3", {"act-3"}, "activity_metrics_updated")]
        assert completion_handlers.get_live_progress("inst-3") == {"id": "inst-3"}
        assert fake_db.committed is True


def _fake_db_session(instance):
    class _FakeQuery:
        def __init__(self, obj):
            self._obj = obj

        def filter_by(self, **_kwargs):
            return self

        def first(self):
            return self._obj

    class _FakeSession:
        def __init__(self, obj):
            self._obj = obj
            self.committed = False
            self.closed = False

        def query(self, *_args, **_kwargs):
            return _FakeQuery(self._obj)

        def get(self, *_args, **_kwargs):
            return self._obj

        def commit(self):
            self.committed = True

        def rollback(self):
            return None

        def close(self):
            self.closed = True

    return _FakeSession(instance)


@pytest.mark.unit
class TestGoalCreationEventLogging:
    def test_create_global_goal_emits_root_id_for_root_fractals(self, db_session, test_user, monkeypatch):
        """Root-fractal creation must emit GOAL_CREATED with a truthy root_id.

        services/event_logger.py silently drops events whose payload lacks a
        truthy root_id, so if this invariant regresses, new fractals lose
        their first goal.created audit row.
        """
        import services._goal_crud as goal_crud
        from services.goal_service import GoalService

        emitted = []
        monkeypatch.setattr(goal_crud.event_bus, "emit", lambda event: emitted.append(event))

        service = GoalService(db_session)
        goal, error, status = service.create_global_goal(
            test_user.id,
            {"name": "Brand New Fractal", "type": "UltimateGoal"},
        )

        assert error is None
        assert status == 201
        created_events = [event for event in emitted if event.name == Events.GOAL_CREATED]
        assert len(created_events) == 1
        assert created_events[0].data["root_id"] == goal.id
        assert created_events[0].data["root_id"] is not None
