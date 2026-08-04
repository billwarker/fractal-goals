"""Low-level primitives for normalized set/metric result data."""
from typing import Any, Optional

def load_instance_sets(instance) -> list:
    """Return API-shaped set payloads from relational rows."""
    normalized_sets = getattr(instance, "sets", None)
    if normalized_sets:
        from services.serializers import serialize_activity_set

        return [serialize_activity_set(row) for row in normalized_sets]
    return []


def resolve_metric_id(metric_dict: dict) -> Optional[Any]:
    """Resolve a set-metric entry's id, tolerating both key spellings.

    Persisted set metrics use either `metric_id` or `metric_definition_id`
    depending on when/how they were written; callers should not care which.
    """
    if not isinstance(metric_dict, dict):
        return None
    return metric_dict.get("metric_id") or metric_dict.get("metric_definition_id")
