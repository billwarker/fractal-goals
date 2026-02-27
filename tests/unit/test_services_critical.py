from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from models import Goal, Program, ProgramBlock, program_goals, program_block_goals
from models import Session, ActivityInstance
import services.completion_handlers as completion_handlers
from services.completion_handlers import (
    _check_metric_value,
    _check_metrics_meet_target,
    _evaluate_threshold_target,
    _evaluate_sum_target,
    _evaluate_frequency_target,
    handle_activity_instance_updated,
)
from services.events import Event, Events
from services.programs import ProgramService
from services.session_service import SessionService, _parse_iso_datetime_strict


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
    def test_check_metric_value_operators(self):
        assert _check_metric_value(10, 10, ">=") is True
        assert _check_metric_value(10, 9, ">=") is False
        assert _check_metric_value(10, 9, "<=") is True
        assert _check_metric_value(10, 10.0005, "==") is True
        assert _check_metric_value(10, 11, ">") is True
        assert _check_metric_value(10, 9, "<") is True
        assert _check_metric_value(10, 10, "??") is False

    def test_check_metrics_meet_target_requires_all_target_metrics(self):
        target_metrics = [
            {"metric_id": "m1", "value": 10, "operator": ">="},
            {"metric_id": "m2", "value": 5, "operator": ">="},
        ]
        actual_ok = [
            {"metric_id": "m1", "value": 10},
            {"metric_id": "m2", "value": 7},
        ]
        actual_missing = [{"metric_id": "m1", "value": 12}]
        assert _check_metrics_meet_target(target_metrics, actual_ok) is True
        assert _check_metrics_meet_target(target_metrics, actual_missing) is False

    def test_evaluate_threshold_target_checks_sets_and_flat_metrics(self):
        target = {
            "activity_id": "act-1",
            "metrics": [{"metric_id": "m1", "value": 100, "operator": ">="}],
        }
        instances_by_activity = {
            "act-1": [
                {"sets": [{"metrics": [{"metric_id": "m1", "value": 95}]}], "metrics": []},
                {"sets": [], "metrics": [{"metric_id": "m1", "value": 105}]},
            ]
        }
        assert _evaluate_threshold_target(target, instances_by_activity) is True

    def test_evaluate_sum_and_frequency_targets(self):
        class MetricValueStub:
            def __init__(self, metric_definition_id, value):
                self.metric_definition_id = metric_definition_id
                self.value = value

        class ActivityInstanceStub:
            def __init__(self, session_id, data, metric_values):
                self.session_id = session_id
                self.data = data
                self.metric_values = metric_values

        instances = [
            ActivityInstanceStub(
                "s1",
                {"sets": [{"metrics": [{"metric_id": "m1", "value": 30}]}]},
                [MetricValueStub("m1", 20)],
            ),
            ActivityInstanceStub(
                "s2",
                {"sets": [{"metrics": [{"metric_id": "m1", "value": 40}]}]},
                [MetricValueStub("m1", 15)],
            ),
        ]

        target = {"metrics": [{"metric_id": "m1", "value": 100, "operator": ">="}]}
        met, current, required = _evaluate_sum_target(target, instances)
        assert met is True
        assert current == 105.0
        assert required == 100.0

        freq_met, freq_count = _evaluate_frequency_target({"frequency_count": 2}, instances)
        assert freq_met is True
        assert freq_count == 2


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

    def test_replace_block_goals_rejects_missing_goals(self, db_session, sample_ultimate_goal):
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
        goal = Goal(name="Goal C", parent_id=sample_ultimate_goal.id, root_id=sample_ultimate_goal.id)
        db_session.add_all([program, block, goal])
        db_session.flush()

        ProgramService._replace_block_goals(
            db_session,
            block.id,
            [goal.id],
            sample_ultimate_goal.id,
        )
        rows = db_session.execute(
            program_block_goals.select().where(program_block_goals.c.program_block_id == block.id)
        ).all()
        assert len(rows) == 1

        with pytest.raises(ValueError, match="Goals not found in this fractal"):
            ProgramService._replace_block_goals(
                db_session,
                block.id,
                [goal.id, "missing-goal-id"],
                sample_ultimate_goal.id,
            )


@pytest.mark.unit
class TestSessionServicePublicFlows:
    def test_update_session_marks_session_and_instances_complete(
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
        monkeypatch.setattr("services.session_service.event_bus.emit", lambda event: emitted.append(event.name))

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
    def test_create_program_deactivates_existing_active_program(self, db_session, sample_ultimate_goal):
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
        assert existing_refreshed.is_active is False
        assert new_refreshed.is_active is True

        linked_rows = db_session.execute(
            program_goals.select().where(program_goals.c.program_id == new_refreshed.id)
        ).all()
        assert len(linked_rows) == 1
        assert linked_rows[0].goal_id == selected_goal.id

    def test_update_program_activates_target_and_deactivates_others(self, db_session, sample_ultimate_goal):
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
            {"is_active": True},
        )
        db_session.commit()

        assert updated is not None
        refreshed_a = db_session.query(Program).filter_by(id=program_a.id).first()
        refreshed_b = db_session.query(Program).filter_by(id=program_b.id).first()
        assert refreshed_a.is_active is False
        assert refreshed_b.is_active is True


@pytest.mark.unit
class TestCompletionHandlerPublicFlow:
    def test_handle_activity_instance_updated_reverts_when_marked_incomplete(self, monkeypatch):
        instance = SimpleNamespace(completed=False)
        fake_db = _fake_db_session(instance)
        reverted = []

        monkeypatch.setattr(completion_handlers, "_get_db_session", lambda: fake_db)
        monkeypatch.setattr(
            completion_handlers,
            "_revert_achievements_for_instance",
            lambda _db, instance_id: reverted.append(instance_id),
        )

        handle_activity_instance_updated(
            Event(
                Events.ACTIVITY_INSTANCE_UPDATED,
                {"instance_id": "inst-1", "session_id": "session-1", "root_id": "root-1", "updated_fields": []},
            )
        )

        assert reverted == ["inst-1"]
        assert fake_db.committed is True
        assert fake_db.closed is True

    def test_handle_activity_instance_updated_evaluates_when_completed_field_toggled(self, monkeypatch):
        instance = SimpleNamespace(completed=True)
        fake_db = _fake_db_session(instance)
        evaluated = []

        monkeypatch.setattr(completion_handlers, "_get_db_session", lambda: fake_db)
        monkeypatch.setattr(
            completion_handlers,
            "_run_evaluation_for_instance",
            lambda _db, inst, session_id, root_id: evaluated.append((inst, session_id, root_id)),
        )

        handle_activity_instance_updated(
            Event(
                Events.ACTIVITY_INSTANCE_UPDATED,
                {
                    "instance_id": "inst-2",
                    "session_id": "session-2",
                    "root_id": "root-2",
                    "updated_fields": ["completed"],
                },
            )
        )

        assert len(evaluated) == 1
        assert evaluated[0][1] == "session-2"
        assert evaluated[0][2] == "root-2"
        assert fake_db.committed is True
        assert fake_db.closed is True


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

        def commit(self):
            self.committed = True

        def rollback(self):
            return None

        def close(self):
            self.closed = True

    return _FakeSession(instance)
