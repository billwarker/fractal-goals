from __future__ import annotations

from models import ActivityInstance, ActivitySet
from services.circuit_timing import finish_circuit_clock


def set_circuit_results_completed(db_session, run, completed: bool) -> None:
    """Keep circuit-owned activity results aligned with their run lifecycle."""
    for circuit_round in run.rounds:
        for member in circuit_round.members:
            instance_id = member.activity_instance_id or member.run_slot.activity_instance_id
            instance = db_session.get(ActivityInstance, instance_id)
            if instance:
                instance.completed = completed
                instance.time_start = None
                instance.time_stop = None
                instance.duration_seconds = None
                instance.is_paused = False
                instance.last_paused_at = None
                instance.total_paused_seconds = 0
            if member.activity_set_id:
                activity_set = db_session.get(ActivitySet, member.activity_set_id)
                if activity_set:
                    activity_set.status = "completed" if completed else "planned"


def finalize_circuit_run(db_session, run, completed_at) -> bool:
    """Finalize a circuit in the caller's transaction; return whether it changed."""
    if run.status == "completed":
        return False
    if not run.time_start or run.time_start > completed_at:
        run.time_start = completed_at
    finish_circuit_clock(run, completed_at)
    run.status = "completed"
    run.completed_at = completed_at
    set_circuit_results_completed(db_session, run, True)
    return True


def circuit_completion_event_data(run, root_id) -> dict:
    return {
        "circuit_run_id": run.id,
        "circuit_definition_id": run.circuit_definition_id,
        "session_id": run.session_id,
        "root_id": root_id,
        "duration_seconds": run.duration_seconds,
    }
