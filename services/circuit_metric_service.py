from models import ActivityInstance, MetricDefinition, MetricValue, SplitDefinition
from services.serializers import serialize_metric_definition, serialize_split_definition


class CircuitMetricService:
    """Own immutable circuit activity schemas and nested result metric writes."""

    def __init__(self, db_session):
        self.db_session = db_session

    @staticmethod
    def snapshot_activity_schema(activity):
        return {
            "id": activity.id,
            "name": activity.name,
            "has_sets": bool(activity.has_sets),
            "has_metrics": bool(activity.has_metrics),
            "has_splits": bool(activity.has_splits),
            "metric_definitions": [
                serialize_metric_definition(metric)
                for metric in sorted(
                    activity.metric_definitions,
                    key=lambda row: (row.sort_order or 0, row.created_at, row.id),
                )
                if not metric.deleted_at
            ],
            "split_definitions": [
                serialize_split_definition(split)
                for split in sorted(
                    activity.split_definitions,
                    key=lambda row: (row.order, row.created_at, row.id),
                )
                if not split.deleted_at
            ],
        }

    def replace_member_metrics(self, member, raw_metrics):
        instance_id = member.activity_instance_id or member.run_slot.activity_instance_id
        instance = self.db_session.get(ActivityInstance, instance_id)
        schema = member.run_slot.activity_schema or {}
        has_metric_snapshot = isinstance(schema.get("metric_definitions"), list)
        has_split_snapshot = isinstance(schema.get("split_definitions"), list)
        allowed_metrics = {
            row.get("id") for row in schema.get("metric_definitions", []) if row.get("id")
        }
        allowed_splits = {
            row.get("id") for row in schema.get("split_definitions", []) if row.get("id")
        }
        if not has_metric_snapshot:
            allowed_metrics = {
                row.id for row in self.db_session.query(MetricDefinition).filter(
                    MetricDefinition.activity_id == instance.activity_definition_id,
                    MetricDefinition.deleted_at.is_(None),
                )
            }
        if not has_split_snapshot:
            allowed_splits = {
                row.id for row in self.db_session.query(SplitDefinition).filter(
                    SplitDefinition.activity_id == instance.activity_definition_id,
                    SplitDefinition.deleted_at.is_(None),
                )
            }

        seen = set()
        normalized = []
        for index, raw_metric in enumerate(raw_metrics or []):
            metric_id = raw_metric.get("metric_id") or raw_metric.get("metric_definition_id")
            split_id = raw_metric.get("split_id") or raw_metric.get("split_definition_id")
            if metric_id not in allowed_metrics:
                raise ValueError(f"members.metrics[{index}] does not belong to this activity")
            if split_id and split_id not in allowed_splits:
                raise ValueError(f"members.metrics[{index}].split_id does not belong to this activity")
            key = (metric_id, split_id)
            if key in seen:
                raise ValueError("Corrected metrics contain a duplicate metric/split result")
            try:
                value = float(raw_metric.get("value"))
            except (TypeError, ValueError) as exc:
                raise ValueError(f"members.metrics[{index}].value must be numeric") from exc
            seen.add(key)
            normalized.append((metric_id, split_id, value))

        query = self.db_session.query(MetricValue).filter(
            MetricValue.activity_instance_id == instance_id,
        )
        if member.activity_set_id:
            query = query.filter(MetricValue.activity_set_id == member.activity_set_id)
        else:
            query = query.filter(MetricValue.activity_set_id.is_(None))
        existing_by_key = {
            (row.metric_definition_id, row.split_definition_id): row
            for row in query.all()
        }
        for metric_id, split_id, value in normalized:
            existing = existing_by_key.pop((metric_id, split_id), None)
            if existing:
                existing.value = value
            else:
                self.db_session.add(MetricValue(
                    activity_instance_id=instance_id,
                    activity_set_id=member.activity_set_id,
                    metric_definition_id=metric_id,
                    split_definition_id=split_id,
                    value=value,
                ))
        for omitted in existing_by_key.values():
            self.db_session.delete(omitted)
