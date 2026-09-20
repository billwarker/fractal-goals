"""Build and defer the domain events emitted when a session is created."""

from services import Event, Events, event_bus


def publish_session_creation_events(session, root_id, circuit_runs, pending_events=None):
    events = [Event(Events.SESSION_CREATED, {
        "session_id": session.id,
        "session_name": session.name,
        "root_id": root_id,
        "goal_ids": [goal.id for goal in session.goals],
    }, source="session_service.create_session")]
    events.extend(
        Event(Events.CIRCUIT_RUN_CREATED, {
            "circuit_run_id": run["id"],
            "circuit_definition_id": run.get("circuit_definition_id"),
            "session_id": session.id,
            "root_id": root_id,
        }, source="session_service.create_session")
        for run in circuit_runs
    )
    if pending_events is None:
        for event in events:
            event_bus.emit(event)
    else:
        pending_events.extend(events)
