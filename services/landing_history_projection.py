"""Bounded public projection of authenticated goal timeline entries."""

from services.service_types import JsonDict


def compact_landing_timeline_payload(payload):
    if not isinstance(payload, dict):
        return payload

    allowed_keys = {
        "id",
        "name",
        "content",
        "notes",
        "created_at",
        "completed",
        "completed_at",
        "goal_id",
        "goal_name",
        "type",
        "level",
        "level_id",
        "level_name",
        "is_smart",
        "activity_definition_id",
        "activity_id",
        "activity_name",
        "definition_name",
        "activity_group_id",
        "activity_group_name",
        "session_id",
        "session_name",
        "session_date",
        "duration_seconds",
        "metric_values",
        "metrics",
        "progress_comparison",
        "target_value",
        "value",
        "operator",
        "unit",
        "time_scope",
        "start_date",
        "end_date",
        "completed_session_id",
        "completed_instance_id",
    }
    compacted = {
        key: value
        for key, value in payload.items()
        if key in allowed_keys and value is not None
    }
    if isinstance(compacted.get("notes"), str):
        compacted["notes"] = compacted["notes"][:1000]
    return compacted


def compact_landing_timeline_entry(entry: JsonDict) -> JsonDict:
    if not isinstance(entry, dict):
        return entry

    compacted = {
        key: entry.get(key)
        for key in (
            "id",
            "type",
            "category",
            "event_type",
            "entity_type",
            "entity_id",
            "relationship",
            "source_goal_id",
            "source_goal_name",
            "title",
            "subtitle",
            "timestamp",
        )
        if entry.get(key) is not None
    }
    payload = compact_landing_timeline_payload(entry.get("payload"))
    if payload:
        compacted["payload"] = payload
    return compacted
