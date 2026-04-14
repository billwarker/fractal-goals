"""
Progress Service

Computes and persists progress comparisons for activity instances.
Compares a completed activity instance against the most recent prior
completed instance of the same activity from a different session.
"""

import logging
from typing import Optional

from models import ActivityInstance, ActivityDefinition, MetricDefinition, ProgressRecord, Session
import models

logger = logging.getLogger(__name__)


def serialize_progress_record(record: ProgressRecord) -> dict:
    """Serialize a ProgressRecord to a JSON-safe dict."""
    return {
        'id': record.id,
        'activity_instance_id': record.activity_instance_id,
        'activity_definition_id': record.activity_definition_id,
        'session_id': record.session_id,
        'previous_instance_id': record.previous_instance_id,
        'is_first_instance': record.is_first_instance,
        'has_change': record.has_change,
        'has_improvement': record.has_improvement,
        'has_regression': record.has_regression,
        'comparison_type': record.comparison_type,
        'metric_comparisons': record.metric_comparisons,
        'derived_summary': record.derived_summary,
        'created_at': record.created_at.isoformat() if record.created_at else None,
    }


class ProgressService:
    def __init__(self, db_session):
        self.db = db_session

    @staticmethod
    def _coerce_numeric(value) -> Optional[float]:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _active_instances_query(self):
        return (
            self.db.query(ActivityInstance)
            .join(Session, ActivityInstance.session_id == Session.id)
            .filter(
                ActivityInstance.deleted_at == None,
                Session.deleted_at == None,
            )
        )

    def _previous_instance_query(
        self,
        activity_definition_id: str,
        root_id: str,
        exclude_session_id: str,
        before_created_at,
    ):
        return (
            self._active_instances_query()
            .filter(
                ActivityInstance.activity_definition_id == activity_definition_id,
                ActivityInstance.root_id == root_id,
                ActivityInstance.session_id != exclude_session_id,
                ActivityInstance.created_at < before_created_at,
            )
            .order_by(ActivityInstance.created_at.desc())
        )

    def get_previous_instance(
        self,
        current_instance: ActivityInstance,
    ) -> Optional[ActivityInstance]:
        """Find the most recent comparable ActivityInstance from a different session.

        Prefer completed instances for persisted comparisons, but fall back to the
        latest prior session instance with data so live hints can still show when
        historical sessions were not explicitly completed.
        """
        completed_instance = (
            self._previous_instance_query(
                current_instance.activity_definition_id,
                current_instance.root_id,
                current_instance.session_id,
                current_instance.created_at,
            )
            .filter(ActivityInstance.completed == True)
            .first()
        )
        if completed_instance:
            return completed_instance

        return (
            self._previous_instance_query(
                current_instance.activity_definition_id,
                current_instance.root_id,
                current_instance.session_id,
                current_instance.created_at,
            )
            .first()
        )

    def _get_progress_record(self, activity_instance_id: str) -> Optional[ProgressRecord]:
        return (
            self.db.query(ProgressRecord)
            .filter_by(activity_instance_id=activity_instance_id)
            .first()
        )

    def _ensure_progress_record(self, instance: ActivityInstance) -> Optional[ProgressRecord]:
        existing = self._get_progress_record(instance.id)
        if existing:
            return existing
        if not instance.completed:
            return None
        return self.compute_final_progress(instance.id)

    def _get_active_instance(self, activity_instance_id: str) -> Optional[ActivityInstance]:
        return (
            self._active_instances_query()
            .filter(ActivityInstance.id == activity_instance_id)
            .first()
        )

    def _resolve_aggregation(self, metric_def: MetricDefinition) -> str:
        """Resolve progress_aggregation: MetricDefinition -> FractalMetricDefinition -> 'last'."""
        if metric_def.progress_aggregation:
            return metric_def.progress_aggregation
        if metric_def.fractal_metric and metric_def.fractal_metric.default_progress_aggregation:
            return metric_def.fractal_metric.default_progress_aggregation
        return 'last'

    def _resolve_higher_is_better(self, metric_def: MetricDefinition) -> bool:
        """Resolve higher_is_better: FractalMetricDefinition -> True (default)."""
        if metric_def.fractal_metric and metric_def.fractal_metric.higher_is_better is not None:
            return metric_def.fractal_metric.higher_is_better
        return True

    def _extract_set_values(
        self,
        instance: ActivityInstance,
        metric_def: MetricDefinition,
    ) -> list:
        """Return a list of (set_index, numeric_value) for each set that has this metric."""
        raw_data = models._safe_load_json(instance.data, {})
        sets = raw_data.get('sets', []) if isinstance(raw_data, dict) else []
        result = []
        for set_index, s in enumerate(sets):
            for m in s.get('metrics', []):
                mid = m.get('metric_id') or m.get('metric_definition_id')
                if mid == metric_def.id:
                    v = self._coerce_numeric(m.get('value'))
                    if v is not None:
                        result.append((set_index, v))
        return result

    def _build_set_comparisons(
        self,
        current_instance: ActivityInstance,
        previous_instance: ActivityInstance,
        metric_def: MetricDefinition,
        higher_is_better: bool,
    ) -> list:
        """Build per-set comparison entries aligned by set index."""
        curr_sets = self._extract_set_values(current_instance, metric_def)
        prev_sets = self._extract_set_values(previous_instance, metric_def)
        prev_by_index = {idx: val for idx, val in prev_sets}
        result = []
        for set_index, curr_val in curr_sets:
            prev_val = prev_by_index.get(set_index)
            if prev_val is None:
                result.append({
                    'set_index': set_index,
                    'current_value': curr_val,
                    'previous_value': None,
                    'delta': None,
                    'pct_change': None,
                    'improved': False,
                    'regressed': False,
                })
                continue
            delta = curr_val - prev_val
            pct_change = (delta / prev_val * 100) if prev_val != 0 else None
            improved = (delta > 0 and higher_is_better) or (delta < 0 and not higher_is_better)
            regressed = (delta < 0 and higher_is_better) or (delta > 0 and not higher_is_better)
            result.append({
                'set_index': set_index,
                'current_value': curr_val,
                'previous_value': prev_val,
                'delta': delta,
                'pct_change': round(pct_change, 1) if pct_change is not None else None,
                'improved': improved,
                'regressed': regressed,
            })
        return result

    def _extract_metric_value(
        self,
        instance: ActivityInstance,
        metric_def: MetricDefinition,
        aggregation: str,
    ) -> Optional[float]:
        """Extract a comparable scalar value for a single metric from an instance.

        For 'last': use the flat MetricValue row.
        For 'sum' / 'max': aggregate across instance.data['sets'].
        'yield' is handled separately.
        Returns None if no data is available.
        """
        raw_data = models._safe_load_json(instance.data, {})
        sets = raw_data.get('sets', []) if isinstance(raw_data, dict) else []

        if aggregation == 'last':
            mv = next(
                (v for v in instance.metric_values if v.metric_definition_id == metric_def.id),
                None,
            )
            if mv is not None:
                return self._coerce_numeric(mv.value)

            values = []
            for s in sets:
                for m in s.get('metrics', []):
                    mid = m.get('metric_id') or m.get('metric_definition_id')
                    numeric_value = self._coerce_numeric(m.get('value'))
                    if mid == metric_def.id and numeric_value is not None:
                        values.append(numeric_value)
            return values[-1] if values else None

        # Aggregate across sets
        if not sets:
            # Fall back to flat metric value for set-less activities
            mv = next(
                (v for v in instance.metric_values if v.metric_definition_id == metric_def.id),
                None,
            )
            return self._coerce_numeric(mv.value) if mv is not None else None

        values = []
        for s in sets:
            for m in s.get('metrics', []):
                mid = m.get('metric_id') or m.get('metric_definition_id')
                numeric_value = self._coerce_numeric(m.get('value'))
                if mid == metric_def.id and numeric_value is not None:
                    values.append(numeric_value)

        if not values:
            return None

        if aggregation == 'sum':
            return sum(values)
        if aggregation == 'max':
            return max(values)
        # Unknown aggregation — fall back to last value recorded
        return values[-1]

    def _resolve_yield(self, instance: ActivityInstance, metric_defs: list):
        """Multiply ALL is_multiplicative metrics together for this instance.

        Returns (float product, list of metric_def_ids used)
        or (None, []) if fewer than 2 multiplicative metrics have data.
        """
        mult_defs = [md for md in metric_defs if md.is_multiplicative]
        if len(mult_defs) < 2:
            return None, []

        product = 1.0
        used_ids = []
        for md in mult_defs:
            aggregation = self._resolve_aggregation(md)
            val = self._extract_metric_value(instance, md, aggregation)
            if val is None:
                # A missing multiplicative metric breaks the yield calculation
                return None, []
            product *= val
            used_ids.append(md.id)

        return product, used_ids

    # ------------------------------------------------------------------
    # Comparison logic
    # ------------------------------------------------------------------

    def _build_comparison(
        self,
        current_instance: ActivityInstance,
        previous_instance: Optional[ActivityInstance],
        metric_defs: list,
    ):
        """Build metric_comparisons list and derived_summary dict.

        Returns:
            (metric_comparisons, derived_summary, has_improvement, has_regression,
             has_change, comparison_type)
        """
        if previous_instance is None:
            # First time this activity has been completed
            summary_line = "First time!"
            return (
                [],
                {'summary_line': summary_line},
                False,
                False,
                False,
                'first_instance',
            )

        # Filter to metrics with track_progress enabled
        tracked_defs = [md for md in metric_defs if md.track_progress]
        if not tracked_defs:
            return [], {'summary_line': 'No tracked metrics'}, False, False, False, None

        metric_comparisons = []
        has_improvement = False
        has_regression = False
        has_change = False

        # Yield should only be used when explicitly requested by at least one metric.
        yield_requested = any(self._resolve_aggregation(md) == 'yield' for md in tracked_defs)
        curr_yield = None
        prev_yield = None
        yield_ids = []
        if yield_requested:
            curr_yield, yield_ids = self._resolve_yield(current_instance, tracked_defs)
            prev_yield, _ = self._resolve_yield(previous_instance, tracked_defs)

        comparison_type = 'flat_metrics'

        # Check if sets are present to pick a better comparison_type label
        curr_data = models._safe_load_json(current_instance.data, {})
        curr_sets = curr_data.get('sets', []) if isinstance(curr_data, dict) else []
        if curr_sets:
            comparison_type = 'set_metrics'

        if yield_requested and curr_yield is not None and prev_yield is not None:
            comparison_type = 'yield'
            delta = curr_yield - prev_yield
            if delta != 0:
                has_change = True
            pct_change = (delta / prev_yield * 100) if prev_yield != 0 else None
            # Yield itself — higher is better by convention
            if delta > 0:
                has_improvement = True
            elif delta < 0:
                has_regression = True
            metric_comparisons.append({
                'type': 'yield',
                'metric_ids': yield_ids,
                'current_value': curr_yield,
                'previous_value': prev_yield,
                'delta': delta,
                'pct_change': round(pct_change, 1) if pct_change is not None else None,
                'improved': delta > 0,
                'regressed': delta < 0,
                'higher_is_better': True,
            })
        else:
            for md in tracked_defs:
                aggregation = self._resolve_aggregation(md)
                if aggregation == 'yield':
                    continue
                higher_is_better = self._resolve_higher_is_better(md)
                curr_val = self._extract_metric_value(current_instance, md, aggregation)
                prev_val = self._extract_metric_value(previous_instance, md, aggregation)

                if prev_val is None:
                    continue

                # For in-progress activities, keep the previous value available even
                # before the user enters anything so the UI can show a "last X" hint.
                if curr_val is None:
                    # Build per-set hints from previous instance so each set row
                    # can show its own "last N" placeholder, not just the aggregate.
                    prev_set_values = self._extract_set_values(previous_instance, md)
                    in_progress_set_comparisons = [
                        {
                            'set_index': idx,
                            'current_value': None,
                            'previous_value': val,
                            'delta': None,
                            'pct_change': None,
                            'improved': False,
                            'regressed': False,
                        }
                        for idx, val in prev_set_values
                    ]
                    metric_comparisons.append({
                        'metric_id': md.id,
                        'metric_name': md.name,
                        'unit': md.unit,
                        'aggregation': aggregation,
                        'current_value': None,
                        'previous_value': prev_val,
                        'delta': None,
                        'pct_change': None,
                        'improved': False,
                        'regressed': False,
                        'higher_is_better': higher_is_better,
                        'set_comparisons': in_progress_set_comparisons,
                    })
                    continue

                delta = curr_val - prev_val
                if delta != 0:
                    has_change = True

                pct_change = (delta / prev_val * 100) if prev_val != 0 else None

                improved = (delta > 0 and higher_is_better) or (delta < 0 and not higher_is_better)
                regressed = (delta < 0 and higher_is_better) or (delta > 0 and not higher_is_better)

                if improved:
                    has_improvement = True
                if regressed:
                    has_regression = True

                set_comparisons = self._build_set_comparisons(
                    current_instance, previous_instance, md, higher_is_better
                )

                metric_comparisons.append({
                    'metric_id': md.id,
                    'metric_name': md.name,
                    'unit': md.unit,
                    'aggregation': aggregation,
                    'current_value': curr_val,
                    'previous_value': prev_val,
                    'delta': delta,
                    'pct_change': round(pct_change, 1) if pct_change is not None else None,
                    'improved': improved,
                    'regressed': regressed,
                    'higher_is_better': higher_is_better,
                    'set_comparisons': set_comparisons,
                })

        if yield_requested and not metric_comparisons:
            return [], {'summary_line': 'Yield unavailable'}, False, False, False, 'yield'

        # Build a human-readable summary line
        summary_line = self._build_summary_line(metric_comparisons, has_improvement, has_regression, has_change, comparison_type)
        derived_summary = {
            'summary_line': summary_line,
            'improved_count': sum(1 for mc in metric_comparisons if mc.get('improved')),
            'regressed_count': sum(1 for mc in metric_comparisons if mc.get('regressed')),
        }

        return metric_comparisons, derived_summary, has_improvement, has_regression, has_change, comparison_type

    def _build_summary_line(
        self,
        metric_comparisons: list,
        has_improvement: bool,
        has_regression: bool,
        has_change: bool,
        comparison_type: Optional[str],
    ) -> str:
        if not metric_comparisons:
            return 'No comparison data'

        if comparison_type == 'first_instance':
            return 'First time!'

        if not has_change:
            return 'Same as last time'

        # For yield or single-metric: show pct change
        if comparison_type == 'yield' or len(metric_comparisons) == 1:
            mc = metric_comparisons[0]
            pct = mc.get('pct_change')
            if pct is not None:
                direction = 'up' if mc.get('improved') else 'down'
                label = mc.get('metric_name', 'Volume')
                return f"{label} {direction} {abs(pct):.1f}%"

        # Multi-metric summary
        improved = sum(1 for mc in metric_comparisons if mc.get('improved'))
        regressed = sum(1 for mc in metric_comparisons if mc.get('regressed'))
        if improved > 0 and regressed == 0:
            return 'New personal best'
        if improved > 0 and regressed > 0:
            return f'{improved} improved, {regressed} regressed'
        if regressed > 0:
            return f'{regressed} metric(s) regressed'
        return 'Mixed results'

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compute_live_comparison(self, activity_instance_id: str) -> Optional[dict]:
        """Compute a progress comparison without persisting it.

        Returns a dict with the same shape as a ProgressRecord payload,
        or None if the instance is not found.
        """
        instance = self._get_active_instance(activity_instance_id)
        if not instance:
            return None

        activity_def = self.db.query(ActivityDefinition).filter_by(
            id=instance.activity_definition_id
        ).first()
        if not activity_def:
            return None

        metric_defs = [
            md for md in activity_def.metric_definitions
            if md.deleted_at is None and md.is_active
        ]

        previous = self.get_previous_instance(instance)

        is_first_instance = previous is None

        metric_comparisons, derived_summary, has_improvement, has_regression, has_change, comparison_type = (
            self._build_comparison(instance, previous, metric_defs)
        )

        return {
            'activity_instance_id': activity_instance_id,
            'activity_definition_id': instance.activity_definition_id,
            'session_id': instance.session_id,
            'previous_instance_id': previous.id if previous else None,
            'is_first_instance': is_first_instance,
            'has_change': has_change,
            'has_improvement': has_improvement,
            'has_regression': has_regression,
            'comparison_type': comparison_type,
            'metric_comparisons': metric_comparisons,
            'derived_summary': derived_summary,
        }

    def get_progress_for_instance(self, activity_instance_id: str) -> Optional[dict]:
        """Return persisted progress when available, else compute a live comparison."""
        existing = self._get_progress_record(activity_instance_id)
        if existing:
            return serialize_progress_record(existing)
        return self.compute_live_comparison(activity_instance_id)

    def recompute_progress_for_instance(self, activity_instance_id: str) -> Optional[ProgressRecord]:
        """Replace any persisted ProgressRecord for this instance with a fresh computation."""
        existing = self._get_progress_record(activity_instance_id)
        if existing is not None:
            self.db.delete(existing)
            self.db.flush()
        return self.compute_final_progress(activity_instance_id)

    def compute_final_progress(self, activity_instance_id: str) -> Optional[ProgressRecord]:
        """Compute and persist a ProgressRecord. Idempotent.

        If a record already exists for this activity_instance_id, return it
        without recomputing. Returns the ProgressRecord or None.
        """
        existing = self._get_progress_record(activity_instance_id)
        if existing:
            return existing

        instance = self._get_active_instance(activity_instance_id)
        if not instance or not instance.completed:
            return None

        activity_def = self.db.query(ActivityDefinition).filter_by(
            id=instance.activity_definition_id
        ).first()
        if not activity_def:
            return None

        metric_defs = [
            md for md in activity_def.metric_definitions
            if md.deleted_at is None and md.is_active
        ]

        previous = self.get_previous_instance(instance)

        is_first_instance = previous is None

        metric_comparisons, derived_summary, has_improvement, has_regression, has_change, comparison_type = (
            self._build_comparison(instance, previous, metric_defs)
        )

        record = ProgressRecord(
            root_id=instance.root_id,
            activity_definition_id=instance.activity_definition_id,
            activity_instance_id=activity_instance_id,
            session_id=instance.session_id,
            previous_instance_id=previous.id if previous else None,
            is_first_instance=is_first_instance,
            has_change=has_change,
            has_improvement=has_improvement,
            has_regression=has_regression,
            comparison_type=comparison_type,
            metric_comparisons=metric_comparisons,
            derived_summary=derived_summary,
        )
        self.db.add(record)
        try:
            self.db.flush()
        except Exception:
            logger.exception("Error persisting ProgressRecord for instance %s", activity_instance_id)
            self.db.rollback()
            return None

        return record

    def compute_progress_for_session(self, session_id: str) -> None:
        """Compute and persist ProgressRecords for every completed activity instance in the session."""
        instances = (
            self._active_instances_query()
            .filter(
                ActivityInstance.session_id == session_id,
                ActivityInstance.completed == True,
            )
            .all()
        )
        for instance in instances:
            try:
                self.compute_final_progress(instance.id)
            except Exception:
                logger.exception(
                    "Error computing progress for instance %s in session %s",
                    instance.id,
                    session_id,
                )

    def recompute_progress_for_activity(self, activity_definition_id: str, root_id: str) -> None:
        """Rebuild the full persisted progress timeline for one activity definition."""
        self.db.query(ProgressRecord).filter(
            ProgressRecord.activity_definition_id == activity_definition_id,
            ProgressRecord.root_id == root_id,
        ).delete(synchronize_session=False)
        self.db.flush()

        instances = (
            self._active_instances_query()
            .filter(
                ActivityInstance.activity_definition_id == activity_definition_id,
                ActivityInstance.root_id == root_id,
                ActivityInstance.completed == True,
            )
            .order_by(ActivityInstance.created_at.asc())
            .all()
        )
        for instance in instances:
            self.compute_final_progress(instance.id)

    def get_progress_history(
        self,
        activity_definition_id: str,
        root_id: str,
        limit: int = 20,
        offset: int = 0,
        exclude_session_id: str | None = None,
    ) -> list:
        """Return paginated progress history aligned to activity history cards."""
        query = self._active_instances_query().filter(
            ActivityInstance.activity_definition_id == activity_definition_id,
            ActivityInstance.root_id == root_id,
        )
        if exclude_session_id:
            query = query.filter(ActivityInstance.session_id != exclude_session_id)

        instances = (
            query
            .order_by(ActivityInstance.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        records = []
        for instance in instances:
            if instance.completed:
                record = self._ensure_progress_record(instance)
            else:
                record = self.compute_live_comparison(instance.id)
            if record:
                records.append(record)

        return [
            serialize_progress_record(r) if isinstance(r, ProgressRecord) else r
            for r in records
        ]

    def get_progress_summary_for_session(self, session_id: str) -> list:
        """Return list of ProgressRecord dicts for all completed instances in a session."""
        instances = (
            self._active_instances_query()
            .filter(
                ActivityInstance.session_id == session_id,
                ActivityInstance.completed == True,
            )
            .order_by(ActivityInstance.created_at.desc())
            .all()
        )

        records = []
        for instance in instances:
            record = self._ensure_progress_record(instance)
            if record:
                records.append(record)

        return [serialize_progress_record(r) for r in records]
