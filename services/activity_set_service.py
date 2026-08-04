from __future__ import annotations

from collections.abc import Iterable

from models import ActivitySet, MetricDefinition, MetricValue, SplitDefinition


class ActivitySetValidationError(ValueError):
    pass


def _normalize_status(raw_set: dict) -> str:
    status = str(raw_set.get("status") or "").strip().lower()
    if status in {"planned", "active", "completed", "skipped", "unfinished"}:
        return status
    return "completed" if raw_set.get("completed") else "planned"


def _nonnegative_int(value, field_name: str) -> int:
    if isinstance(value, bool):
        raise ActivitySetValidationError(f"{field_name} must be a non-negative integer")
    try:
        normalized = int(value or 0)
    except (TypeError, ValueError) as exc:
        raise ActivitySetValidationError(f"{field_name} must be a non-negative integer") from exc
    if normalized < 0:
        raise ActivitySetValidationError(f"{field_name} must be a non-negative integer")
    return normalized


def _metric_key(raw_metric: dict):
    return (
        raw_metric.get("metric_id") or raw_metric.get("metric_definition_id"),
        raw_metric.get("split_id") or raw_metric.get("split_definition_id"),
    )


def replace_activity_sets(db_session, instance, raw_sets: Iterable[dict] | None) -> list[ActivitySet]:
    """Synchronize stable normalized set rows and their metric values.

    Existing IDs are preserved when supplied by the client. Missing rows are
    removed only when they are not linked to a circuit occurrence.
    """
    if raw_sets is None:
        return list(instance.sets or [])
    if not isinstance(raw_sets, list):
        raise ActivitySetValidationError("sets must be a list")

    allowed_metrics = {
        row.id: row
        for row in db_session.query(MetricDefinition).filter(
            MetricDefinition.activity_id == instance.activity_definition_id,
            MetricDefinition.deleted_at.is_(None),
        )
    }
    allowed_splits = {
        row.id
        for row in db_session.query(SplitDefinition).filter(
            SplitDefinition.activity_id == instance.activity_definition_id,
            SplitDefinition.deleted_at.is_(None),
        )
    }
    existing_by_id = {row.id: row for row in (instance.sets or [])}
    retained_ids = set()
    normalized_rows = []

    for sort_order, raw_set in enumerate(raw_sets):
        if not isinstance(raw_set, dict):
            raise ActivitySetValidationError(f"sets[{sort_order}] must be an object")
        requested_id = raw_set.get("id")
        row = existing_by_id.get(requested_id) if requested_id else None
        if requested_id and row is None:
            collision = db_session.get(ActivitySet, requested_id)
            if collision is not None:
                raise ActivitySetValidationError(f"sets[{sort_order}].id does not belong to this activity instance")
        if row is None:
            row = ActivitySet(activity_instance=instance)
            if requested_id:
                row.id = requested_id
            db_session.add(row)
        row.sort_order = sort_order
        row.status = _normalize_status(raw_set)
        row.duration_seconds = _nonnegative_int(raw_set.get("duration_seconds"), f"sets[{sort_order}].duration_seconds")
        notes = raw_set.get("notes")
        row.notes = notes if isinstance(notes, str) and notes.strip() else None
        db_session.flush()

        seen_metric_keys = set()
        next_metrics = []
        existing_metrics = {
            (metric.metric_definition_id, metric.split_definition_id): metric
            for metric in (row.metric_values or [])
        }
        for metric_index, raw_metric in enumerate(raw_set.get("metrics") or []):
            if not isinstance(raw_metric, dict):
                raise ActivitySetValidationError(
                    f"sets[{sort_order}].metrics[{metric_index}] must be an object"
                )
            metric_id, split_id = _metric_key(raw_metric)
            raw_value = raw_metric.get("value")
            if raw_value is None or (isinstance(raw_value, str) and not raw_value.strip()):
                continue
            key = (metric_id, split_id)
            if not metric_id or metric_id not in allowed_metrics:
                raise ActivitySetValidationError(
                    f"sets[{sort_order}].metrics[{metric_index}] does not belong to this activity"
                )
            if split_id and split_id not in allowed_splits:
                raise ActivitySetValidationError(
                    f"sets[{sort_order}].metrics[{metric_index}].split_id does not belong to this activity"
                )
            if key in seen_metric_keys:
                raise ActivitySetValidationError(
                    f"sets[{sort_order}] contains a duplicate metric/split result"
                )
            try:
                value = float(raw_value)
            except (TypeError, ValueError) as exc:
                raise ActivitySetValidationError(
                    f"sets[{sort_order}].metrics[{metric_index}].value must be numeric"
                ) from exc
            metric = existing_metrics.pop(key, None) or MetricValue(
                activity_instance_id=instance.id,
                activity_set_id=row.id,
                metric_definition_id=metric_id,
                split_definition_id=split_id,
            )
            metric.activity_instance_id = instance.id
            metric.activity_set_id = row.id
            metric.value = value
            next_metrics.append(metric)
            seen_metric_keys.add(key)
        for stale_metric in existing_metrics.values():
            db_session.delete(stale_metric)
        row.metric_values = next_metrics
        retained_ids.add(row.id)
        normalized_rows.append(row)

    for stale_row in existing_by_id.values():
        if stale_row.id in retained_ids:
            continue
        if getattr(stale_row, "circuit_member", None):
            raise ActivitySetValidationError("Circuit result sets cannot be removed from the activity editor")
        db_session.delete(stale_row)

    instance.sets = normalized_rows
    return normalized_rows
