"""Low-level primitives for reading set/metric data off an ActivityInstance.

Both progress_service (configurable aggregations) and completion_handlers
(target threshold evaluation) read the same persisted instance JSON shape:
`{"sets": [{"metrics": [{"metric_id"|"metric_definition_id", "value"}]}]}`.

The aggregation *semantics* in those two services are intentionally different
and stay where they are; this module only centralizes the repeated parsing
idioms (JSON-load + sets extraction, metric-id resolution) that were copy-pasted
across ~15 call sites (audit P1-9).
"""
from typing import Any, Optional

import models


def load_instance_sets(instance) -> list:
    """Return the `sets` list persisted on an instance's JSON `data`, or []."""
    raw_data = models._safe_load_json(instance.data, {})
    if not isinstance(raw_data, dict):
        return []
    sets = raw_data.get("sets", [])
    return sets if isinstance(sets, list) else []


def resolve_metric_id(metric_dict: dict) -> Optional[Any]:
    """Resolve a set-metric entry's id, tolerating both key spellings.

    Persisted set metrics use either `metric_id` or `metric_definition_id`
    depending on when/how they were written; callers should not care which.
    """
    if not isinstance(metric_dict, dict):
        return None
    return metric_dict.get("metric_id") or metric_dict.get("metric_definition_id")
