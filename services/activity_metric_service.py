from sqlalchemy import func

from models import FractalMetricDefinition, Goal, MetricDefinition, validate_root_goal, utc_now
from services.events import Event, Events, event_bus
from services.quota_service import QuotaService
from services.service_types import JsonDict, ServiceResult


ALLOWED_PROGRESS_AGGREGATIONS = {'last', 'sum', 'max', 'yield'}


def normalize_progress_aggregation(value):
    if value in (None, ''):
        return None
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    return normalized or None


class ActivityMetricService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _validate_owned_root(self, root_id, current_user_id) -> tuple[Goal | None, tuple[str, int] | None]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, ("Fractal not found or access denied", 404)
        return root, None

    def _get_active_fractal_metric(self, root_id, metric_id) -> FractalMetricDefinition | None:
        return self.db_session.query(FractalMetricDefinition).filter(
            FractalMetricDefinition.id == metric_id,
            FractalMetricDefinition.root_id == root_id,
            FractalMetricDefinition.deleted_at.is_(None),
        ).first()

    def _activity_count_for_metric(self, metric_id):
        return self.db_session.query(func.count(MetricDefinition.id)).filter(
            MetricDefinition.fractal_metric_id == metric_id,
            MetricDefinition.deleted_at.is_(None),
        ).scalar() or 0

    def _validate_progress_aggregation(self, raw_value, field_name):
        aggregation = normalize_progress_aggregation(raw_value)
        if aggregation not in ALLOWED_PROGRESS_AGGREGATIONS and aggregation is not None:
            return None, (
                f"{field_name} must be one of: " + ", ".join(sorted(ALLOWED_PROGRESS_AGGREGATIONS)),
                400,
            )
        return aggregation, None

    @staticmethod
    def _numbers_equal(left, right):
        return abs(float(left) - float(right)) < 0.000001

    @classmethod
    def _validate_metric_constraints(
        cls,
        *,
        input_type,
        default_value=None,
        predefined_values=None,
        min_value=None,
        max_value=None,
    ):
        if min_value is not None and max_value is not None and min_value > max_value:
            return "Min value cannot be greater than max value", 400

        values_to_check = [
            ("Default value", default_value),
            ("Min value", min_value),
            ("Max value", max_value),
            *[
                (f"Predefined value {index + 1}", value)
                for index, value in enumerate(predefined_values or [])
            ],
        ]
        for label, value in values_to_check:
            if value is None:
                continue
            if input_type == 'integer' and int(value) != float(value):
                return f"{label} must be a whole number for integer metrics", 400
            if input_type == 'duration' and value < 0:
                return f"{label} cannot be negative for duration metrics", 400

        if default_value is not None:
            if min_value is not None and default_value < min_value:
                return "Default value cannot be less than min value", 400
            if max_value is not None and default_value > max_value:
                return "Default value cannot be greater than max value", 400

        if predefined_values:
            unique_values = {round(float(value), 6) for value in predefined_values}
            if len(unique_values) != len(predefined_values):
                return "Predefined values cannot contain duplicates", 400

            for value in predefined_values:
                if min_value is not None and value < min_value:
                    return "Predefined values cannot be less than min value", 400
                if max_value is not None and value > max_value:
                    return "Predefined values cannot be greater than max value", 400

            if default_value is not None and not any(cls._numbers_equal(value, default_value) for value in predefined_values):
                return "Default value must be one of the predefined values", 400
            if min_value is not None and not any(cls._numbers_equal(value, min_value) for value in predefined_values):
                return "Min value must be included in the predefined values", 400
            if max_value is not None and not any(cls._numbers_equal(value, max_value) for value in predefined_values):
                return "Max value must be included in the predefined values", 400

        return None

    def list_fractal_metrics(self, root_id, current_user_id) -> ServiceResult[list[FractalMetricDefinition]]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        metrics = self.db_session.query(FractalMetricDefinition).filter(
            FractalMetricDefinition.root_id == root_id,
            FractalMetricDefinition.deleted_at.is_(None),
        ).order_by(
            FractalMetricDefinition.sort_order,
            FractalMetricDefinition.created_at,
        ).all()

        for metric in metrics:
            metric._activity_count = self._activity_count_for_metric(metric.id)

        return metrics, None, 200

    def create_fractal_metric(self, root_id, current_user_id, data) -> ServiceResult[FractalMetricDefinition]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        quota_service = QuotaService(self.db_session)
        _, quota_error, quota_status = quota_service.check_available(current_user_id, "metrics")
        if quota_error:
            return None, quota_error, quota_status

        name = (data.get('name') or '').strip()
        unit = (data.get('unit') or '').strip()
        if not name:
            return None, "Name is required", 400
        if not unit:
            return None, "Unit is required", 400

        existing = self.db_session.query(FractalMetricDefinition).filter(
            FractalMetricDefinition.root_id == root_id,
            FractalMetricDefinition.name == name,
            FractalMetricDefinition.unit == unit,
            FractalMetricDefinition.deleted_at.is_(None),
        ).first()
        if existing:
            return None, "A metric with this name and unit already exists in this fractal", 409

        max_order = self.db_session.query(func.max(FractalMetricDefinition.sort_order)).filter(
            FractalMetricDefinition.root_id == root_id,
            FractalMetricDefinition.deleted_at.is_(None),
        ).scalar()

        input_type = data.get('input_type', 'number')
        if input_type not in ('number', 'integer', 'duration'):
            return None, "input_type must be 'number', 'integer', or 'duration'", 400

        default_progress_aggregation, aggregation_error = self._validate_progress_aggregation(
            data.get('default_progress_aggregation'),
            "default_progress_aggregation",
        )
        if aggregation_error:
            return None, *aggregation_error

        constraint_error = self._validate_metric_constraints(
            input_type=input_type,
            default_value=data.get('default_value'),
            predefined_values=data.get('predefined_values'),
            min_value=data.get('min_value'),
            max_value=data.get('max_value'),
        )
        if constraint_error:
            return None, *constraint_error
        _, storage_error, storage_status = quota_service.check_storage_available(
            current_user_id,
            QuotaService._payload_size(
                name,
                unit,
                data.get('description'),
                data.get('predefined_values'),
                data.get('default_progress_aggregation'),
            ),
        )
        if storage_error:
            return None, storage_error, storage_status

        metric = FractalMetricDefinition(
            root_id=root_id,
            name=name,
            unit=unit,
            is_multiplicative=data.get('is_multiplicative', True),
            is_additive=data.get('is_additive', True),
            input_type=input_type,
            default_value=data.get('default_value'),
            higher_is_better=data.get('higher_is_better'),
            predefined_values=data.get('predefined_values'),
            min_value=data.get('min_value'),
            max_value=data.get('max_value'),
            description=(data.get('description') or '').strip() or None,
            default_progress_aggregation=default_progress_aggregation,
            sort_order=data.get('sort_order') if data.get('sort_order') is not None else (max_order or 0) + 1,
        )
        self.db_session.add(metric)
        self.db_session.commit()
        self.db_session.refresh(metric)
        metric._activity_count = 0

        event_bus.emit(Event(Events.FRACTAL_METRIC_CREATED, {
            'metric_id': metric.id,
            'name': metric.name,
            'root_id': root_id,
        }, source='activity_service.create_fractal_metric'))

        return metric, None, 201

    def update_fractal_metric(self, root_id, metric_id, current_user_id, data) -> ServiceResult[FractalMetricDefinition]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        metric = self._get_active_fractal_metric(root_id, metric_id)
        if not metric:
            return None, "Metric not found", 404
        old_storage_size = QuotaService._payload_size(
            metric.name,
            metric.unit,
            metric.description,
            metric.predefined_values,
            metric.default_progress_aggregation,
        )

        if 'name' in data or 'unit' in data:
            name = (data.get('name') or metric.name).strip()
            unit = (data.get('unit') or metric.unit).strip()
            if not name:
                return None, "Name is required", 400
            if not unit:
                return None, "Unit is required", 400
            conflict = self.db_session.query(FractalMetricDefinition).filter(
                FractalMetricDefinition.root_id == root_id,
                FractalMetricDefinition.name == name,
                FractalMetricDefinition.unit == unit,
                FractalMetricDefinition.id != metric_id,
                FractalMetricDefinition.deleted_at.is_(None),
            ).first()
            if conflict:
                return None, "A metric with this name and unit already exists in this fractal", 409
            metric.name = name
            metric.unit = unit

        next_input_type = data.get('input_type', metric.input_type)
        if next_input_type not in ('number', 'integer', 'duration'):
            return None, "input_type must be 'number', 'integer', or 'duration'", 400

        constraint_error = self._validate_metric_constraints(
            input_type=next_input_type,
            default_value=data.get('default_value', metric.default_value),
            predefined_values=data.get('predefined_values', metric.predefined_values),
            min_value=data.get('min_value', metric.min_value),
            max_value=data.get('max_value', metric.max_value),
        )
        if constraint_error:
            return None, *constraint_error
        next_storage_size = QuotaService._payload_size(
            data.get('name', metric.name),
            data.get('unit', metric.unit),
            data.get('description', metric.description),
            data.get('predefined_values', metric.predefined_values),
            data.get('default_progress_aggregation', metric.default_progress_aggregation),
        )
        _, storage_error, storage_status = QuotaService(self.db_session).check_storage_available(
            current_user_id,
            max(0, next_storage_size - old_storage_size),
        )
        if storage_error:
            return None, storage_error, storage_status

        if 'is_multiplicative' in data:
            metric.is_multiplicative = data['is_multiplicative']
        if 'is_additive' in data:
            metric.is_additive = data['is_additive']
        if 'input_type' in data:
            metric.input_type = next_input_type
        if 'default_progress_aggregation' in data:
            default_progress_aggregation, aggregation_error = self._validate_progress_aggregation(
                data.get('default_progress_aggregation'),
                "default_progress_aggregation",
            )
            if aggregation_error:
                return None, *aggregation_error
            metric.default_progress_aggregation = default_progress_aggregation
        if 'default_value' in data:
            metric.default_value = data['default_value']
        if 'higher_is_better' in data:
            metric.higher_is_better = data['higher_is_better']
        if 'predefined_values' in data:
            metric.predefined_values = data['predefined_values']
        if 'min_value' in data:
            metric.min_value = data['min_value']
        if 'max_value' in data:
            metric.max_value = data['max_value']
        if 'description' in data:
            metric.description = (data.get('description') or '').strip() or None
        if 'sort_order' in data and data.get('sort_order') is not None:
            metric.sort_order = data['sort_order']

        self.db_session.commit()
        self.db_session.refresh(metric)

        metric._activity_count = self._activity_count_for_metric(metric.id)

        progress_affecting_keys = {'higher_is_better', 'default_progress_aggregation', 'is_multiplicative'}
        if progress_affecting_keys.intersection(data.keys()):
            from services.progress_service import ProgressService
            ps = ProgressService(self.db_session)
            affected_activity_ids = [
                row[0] for row in self.db_session.query(MetricDefinition.activity_id).filter(
                    MetricDefinition.fractal_metric_id == metric_id,
                    MetricDefinition.deleted_at.is_(None),
                ).distinct().all()
            ]
            for activity_id in affected_activity_ids:
                ps.recompute_progress_for_activity(activity_id, root_id)

        event_bus.emit(Event(Events.FRACTAL_METRIC_UPDATED, {
            'metric_id': metric.id,
            'name': metric.name,
            'root_id': root_id,
            'updated_fields': list(data.keys()),
        }, source='activity_service.update_fractal_metric'))

        return metric, None, 200

    def delete_fractal_metric(self, root_id, metric_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        metric = self._get_active_fractal_metric(root_id, metric_id)
        if not metric:
            return None, "Metric not found", 404

        activity_count = self._activity_count_for_metric(metric_id)

        metric.deleted_at = utc_now()
        self.db_session.commit()

        event_bus.emit(Event(Events.FRACTAL_METRIC_DELETED, {
            'metric_id': metric.id,
            'name': metric.name,
            'root_id': root_id,
        }, source='activity_service.delete_fractal_metric'))

        return {"message": "Metric deleted", "activity_count": activity_count}, None, 200
