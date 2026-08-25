from __future__ import annotations

from sqlalchemy import or_

from models import CircuitRun, SessionWorkInterval
from services.circuit_completion import (
    circuit_completion_event_data,
    finalize_circuit_run,
    set_circuit_results_completed,
)
from services.circuit_timing import parse_circuit_time
from services.events import Event, Events, event_bus
from services.serializers import serialize_circuit_run
from services.work_interval_service import WorkIntervalService, utc_now_naive


class CircuitRunTimingOperations:
    """Owns the circuit-level clock while member results remain untimed."""

    def __init__(self, owner):
        self.owner = owner
        self.db_session = owner.db_session

    def _active_conflict(self, run):
        open_interval = WorkIntervalService(self.db_session).get_open(run.session_id)
        if open_interval:
            return {
                "error": "Another session item is already accruing work time",
                "code": "active_work_exists",
                "active_work": WorkIntervalService.describe(open_interval),
            }, None, 409
        other_running = self.db_session.query(CircuitRun.id).filter(
            CircuitRun.session_id == run.session_id,
            CircuitRun.id != run.id,
            CircuitRun.status.in_(("active", "paused")),
        ).first()
        if other_running:
            return None, "Another circuit is already active in this session", 409
        return None

    def _historical_conflict(self, run, time_start, time_stop):
        if time_stop <= time_start:
            return None
        ordinary_overlap = self.db_session.query(SessionWorkInterval.id).filter(
            SessionWorkInterval.session_id == run.session_id,
            SessionWorkInterval.started_at < time_stop,
            or_(SessionWorkInterval.ended_at.is_(None), SessionWorkInterval.ended_at > time_start),
        ).first()
        if ordinary_overlap:
            return None, "Circuit timing overlaps another session item's work time", 409
        circuit_overlap = self.db_session.query(CircuitRun.id).filter(
            CircuitRun.session_id == run.session_id,
            CircuitRun.id != run.id,
            CircuitRun.time_start.is_not(None),
            CircuitRun.time_start < time_stop,
            or_(CircuitRun.time_stop.is_(None), CircuitRun.time_stop > time_start),
        ).first()
        if circuit_overlap:
            return None, "Circuit timing overlaps another circuit", 409
        return None

    def start(self, root_id, run_id, user_id):
        locked = self.owner._authorized_locked_run(root_id, run_id, user_id)
        if isinstance(locked, tuple) and len(locked) == 3:
            return locked
        run, session = locked
        if run.status == "completed":
            return None, "Completed circuits cannot be restarted", 409
        if run.status in {"active", "paused"}:
            return serialize_circuit_run(run), None, 200
        if session.is_paused:
            return None, "Resume the session before starting a circuit", 409
        conflict = self._active_conflict(run)
        if conflict:
            return conflict
        run.status = "active"
        run.time_start = utc_now_naive()
        run.time_stop = None
        run.duration_seconds = None
        self.db_session.commit()
        event_bus.emit(Event(Events.CIRCUIT_RUN_STARTED, {
            "circuit_run_id": run.id, "session_id": run.session_id, "root_id": root_id,
        }, source="circuit_service.start_run"))
        return serialize_circuit_run(self.owner._run(root_id, run.id)), None, 200

    def update(self, root_id, run_id, user_id, data):
        locked = self.owner._authorized_locked_run(root_id, run_id, user_id)
        if isinstance(locked, tuple) and len(locked) == 3:
            return locked
        run, session = locked
        try:
            time_start = parse_circuit_time(data["time_start"]) if "time_start" in data else run.time_start
            time_stop = parse_circuit_time(data["time_stop"]) if "time_stop" in data else run.time_stop
        except (TypeError, ValueError):
            return None, "Use a valid ISO date-time", 400
        now = utc_now_naive()
        if time_stop and not time_start:
            return None, "Circuit stop requires a start time", 400
        if time_start and time_stop and time_stop < time_start:
            return None, "Stop must be after start", 400
        if time_start and time_start > now:
            return None, "Circuit start cannot be in the future", 400
        if time_stop and time_stop > now:
            return None, "Circuit stop cannot be in the future", 400
        is_reset = not time_start and not time_stop
        boundary_changed = (
            ("time_start" in data and time_start != run.time_start)
            or ("time_stop" in data and time_stop != run.time_stop)
        )
        if (run.total_paused_seconds or run.is_paused) and boundary_changed and not is_reset:
            return None, (
                "Reset the circuit before changing timing that contains paused work"
            ), 409
        if session.completed and not (time_start and time_stop):
            return None, "Completed sessions cannot reset or restart circuit timers", 409
        if time_start and not time_stop:
            if session.is_paused:
                return None, "Resume the session before starting a circuit", 409
            conflict = self._active_conflict(run)
            if conflict:
                return conflict
            conflict = self._historical_conflict(run, time_start, now)
            if conflict:
                return conflict
        elif time_start and time_stop:
            conflict = self._historical_conflict(run, time_start, time_stop)
            if conflict:
                return conflict

        run.time_start = time_start
        run.time_stop = time_stop
        run.is_paused = False
        run.last_paused_at = None
        if not time_start and not time_stop:
            run.status = "planned"
            run.duration_seconds = None
            run.completed_at = None
            run.total_paused_seconds = 0
            set_circuit_results_completed(self.db_session, run, False)
        elif time_stop:
            run.status = "completed"
            run.duration_seconds = max(
                0, int((time_stop - time_start).total_seconds()) - (run.total_paused_seconds or 0)
            )
            run.completed_at = time_stop
            set_circuit_results_completed(self.db_session, run, True)
        else:
            run.status = "active"
            run.duration_seconds = None
            run.completed_at = None
            set_circuit_results_completed(self.db_session, run, False)
        self.db_session.commit()
        event_bus.emit(Event(Events.CIRCUIT_RUN_TIMING_UPDATED, {
            "circuit_run_id": run.id,
            "session_id": run.session_id,
            "root_id": root_id,
            "updated_fields": list(data.keys()),
        }, source="circuit_service.update_run_timing"))
        return serialize_circuit_run(self.owner._run(root_id, run.id)), None, 200

    def complete(self, root_id, run_id, user_id):
        locked = self.owner._authorized_locked_run(root_id, run_id, user_id)
        if isinstance(locked, tuple) and len(locked) == 3:
            return locked
        run, _session = locked
        if run.status == "completed":
            return serialize_circuit_run(run), None, 200
        now = utc_now_naive()
        if not run.time_start:
            run.time_start = now
        if run.time_start > now:
            return None, "Circuit start cannot be in the future", 409
        conflict = self._historical_conflict(run, run.time_start, now)
        if conflict:
            return conflict
        finalize_circuit_run(self.db_session, run, now)
        self.db_session.commit()
        event_bus.emit(Event(
            Events.CIRCUIT_RUN_COMPLETED,
            circuit_completion_event_data(run, root_id),
            source="circuit_service.complete_run",
        ))
        return serialize_circuit_run(self.owner._run(root_id, run.id)), None, 200
