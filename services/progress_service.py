"""
Progress Service

Computes and persists progress comparisons for activity instances.
Compares a completed activity instance against the most recent prior
completed instance of the same activity from a different session.
"""

import logging
from typing import Optional

from models import ActivityInstance, ActivityDefinition, MetricDefinition, ProgressRecord, Session, Goal
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

    def _get_root_progress_settings(self, root_id: str) -> dict:
        """Return progress_settings dict for the root goal, or {} if not set."""
        root = self.db.query(Goal).filter_by(id=root_id).first()
        if root and root.progress_settings and isinstance(root.progress_settings, dict):
            return root.progress_settings
        return {}

    def _is_progress_enabled(self, root_id: str) -> bool:
        """Return False only if progress_settings.enabled is explicitly False."""
        settings = self._get_root_progress_settings(root_id)
        return settings.get('enabled', True) is not False

    def _resolve_configured_aggregation(self, metric_def: MetricDefinition, activity_def=None, root_progress_settings=None) -> Optional[str]:
        """Return a legacy explicitly-configured aggregation, if one exists."""
        if activity_def and getattr(activity_def, 'progress_aggregation', None):
            return activity_def.progress_aggregation
        if metric_def.progress_aggregation:
            return metric_def.progress_aggregation
        if metric_def.fractal_metric and metric_def.fractal_metric.default_progress_aggregation:
            return metric_def.fractal_metric.default_progress_aggregation
        if root_progress_settings and root_progress_settings.get('default_aggregation'):
            return root_progress_settings['default_aggregation']
        return None

    def _resolve_aggregation(
        self,
        metric_def: MetricDefinition,
        metric_defs: Optional[list] = None,
        activity_def=None,
        root_progress_settings=None,
        has_sets: bool = False,
    ) -> str:
        """Resolve comparison mode from legacy config when present, else auto-derive it from metric flags."""
        configured = self._resolve_configured_aggregation(metric_def, activity_def, root_progress_settings)
        if configured:
            return configured

        if not has_sets:
            return 'last'

        has_best_set_anchor = any(md.is_best_set_metric for md in (metric_defs or []))

        if metric_def.is_best_set_metric or (has_best_set_anchor and not metric_def.is_multiplicative):
            return 'max'

        if metric_def.is_multiplicative:
            # Multiplicative metrics participate in the activity-level yield comparison.
            # Keep per-metric hints on the raw metric values rather than duplicating yield.
            return 'last'

        if self._resolve_is_additive(metric_def):
            return 'sum'

        return 'max'

    def _resolve_higher_is_better(self, metric_def: MetricDefinition) -> bool:
        """Resolve higher_is_better: FractalMetricDefinition -> True (default)."""
        if metric_def.fractal_metric and metric_def.fractal_metric.higher_is_better is not None:
            return metric_def.fractal_metric.higher_is_better
        return True

    def _resolve_is_additive(self, metric_def: MetricDefinition) -> bool:
        """Resolve is_additive: FractalMetricDefinition -> True (default)."""
        if metric_def.fractal_metric and metric_def.fractal_metric.is_additive is not None:
            return metric_def.fractal_metric.is_additive
        return True

    def _find_best_set_index(
        self,
        instance: ActivityInstance,
        metric_defs: list,
    ) -> Optional[int]:
        """Return the index of the best set, determined by the is_best_set_metric metric.

        The best set is the one that is "best" for the flagged metric, respecting
        its higher_is_better setting.
        If no metric is flagged, falls back to the first metric in the list.
        If no sets exist, returns None.
        """
        raw_data = models._safe_load_json(instance.data, {})
        sets = raw_data.get('sets', []) if isinstance(raw_data, dict) else []
        if not sets:
            return None

        anchor = next((md for md in metric_defs if md.is_best_set_metric), None)
        if anchor is None:
            anchor = metric_defs[0] if metric_defs else None
        if anchor is None:
            return None

        higher_is_better = self._resolve_higher_is_better(anchor)
        best_index = None
        best_val = None
        for set_index, s in enumerate(sets):
            for m in s.get('metrics', []):
                mid = m.get('metric_id') or m.get('metric_definition_id')
                if mid == anchor.id:
                    v = self._coerce_numeric(m.get('value'))
                    if v is None:
                        continue
                    if (
                        best_val is None
                        or (higher_is_better and v > best_val)
                        or (not higher_is_better and v < best_val)
                    ):
                        best_val = v
                        best_index = set_index
        return best_index

    def _build_best_set_comparison(
        self,
        current_instance: ActivityInstance,
        previous_instance: ActivityInstance,
        metric_def: MetricDefinition,
        higher_is_better: bool,
        all_metric_defs: list,
    ) -> list:
        """Build a single comparison aligned to the current best-set row."""
        current_best_index = self._find_best_set_index(current_instance, all_metric_defs or [metric_def])
        previous_best_index = self._find_best_set_index(previous_instance, all_metric_defs or [metric_def])

        if current_best_index is None or previous_best_index is None:
            return []

        current_value = self._extract_metric_value(current_instance, metric_def, 'max', all_metric_defs)
        previous_value = self._extract_metric_value(previous_instance, metric_def, 'max', all_metric_defs)
        if current_value is None or previous_value is None:
            return []

        delta = current_value - previous_value
        pct_change = (delta / previous_value * 100) if previous_value != 0 else None
        improved = (delta > 0 and higher_is_better) or (delta < 0 and not higher_is_better)
        regressed = (delta < 0 and higher_is_better) or (delta > 0 and not higher_is_better)
        return [{
            'set_index': current_best_index,
            'comparison_basis': 'best_set',
            'previous_set_index': previous_best_index,
            'current_value': current_value,
            'previous_value': previous_value,
            'delta': delta,
            'pct_change': round(pct_change, 1) if pct_change is not None else None,
            'improved': improved,
            'regressed': regressed,
        }]

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
        aggregation: str = 'last',
        all_metric_defs: Optional[list] = None,
    ) -> list:
        """Build per-set comparison entries aligned by set index."""
        if aggregation == 'max':
            return self._build_best_set_comparison(
                current_instance,
                previous_instance,
                metric_def,
                higher_is_better,
                all_metric_defs or [metric_def],
            )

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
        all_metric_defs: Optional[list] = None,
    ) -> Optional[float]:
        """Extract a comparable scalar value for a single metric from an instance.

        For 'last': last set value (or flat row for no-set activities).
        For 'sum': sum across sets for additive metrics; last set for non-additive.
        For 'max': value from the best set, determined by the is_best_set_metric
                   flag across all_metric_defs. Falls back to per-metric max when
                   all_metric_defs is not provided.
        'yield' is handled separately via _resolve_yield.
        Returns None if no data is available.
        """
        raw_data = models._safe_load_json(instance.data, {})
        sets = raw_data.get('sets', []) if isinstance(raw_data, dict) else []

        if aggregation == 'last':
            # For set-based activities always read from sets so the value
            # reflects the last set actually entered, not a stale flat row.
            if sets:
                values = []
                for s in sets:
                    for m in s.get('metrics', []):
                        mid = m.get('metric_id') or m.get('metric_definition_id')
                        numeric_value = self._coerce_numeric(m.get('value'))
                        if mid == metric_def.id and numeric_value is not None:
                            values.append(numeric_value)
                return values[-1] if values else None

            mv = next(
                (v for v in instance.metric_values if v.metric_definition_id == metric_def.id),
                None,
            )
            return self._coerce_numeric(mv.value) if mv is not None else None

        # Aggregate across sets
        if not sets:
            # Fall back to flat metric value for set-less activities
            mv = next(
                (v for v in instance.metric_values if v.metric_definition_id == metric_def.id),
                None,
            )
            return self._coerce_numeric(mv.value) if mv is not None else None

        if aggregation == 'max':
            # Use the best set index so all metrics are read from the same set.
            # This ensures "best set weight" and "best set reps" refer to the
            # same set, not independent per-metric peaks.
            best_index = self._find_best_set_index(instance, all_metric_defs or [metric_def])
            if best_index is not None:
                s = sets[best_index]
                for m in s.get('metrics', []):
                    mid = m.get('metric_id') or m.get('metric_definition_id')
                    if mid == metric_def.id:
                        return self._coerce_numeric(m.get('value'))
            # No best set found — fall back to per-metric max
            values = []
            for s in sets:
                for m in s.get('metrics', []):
                    mid = m.get('metric_id') or m.get('metric_definition_id')
                    v = self._coerce_numeric(m.get('value'))
                    if mid == metric_def.id and v is not None:
                        values.append(v)
            return max(values) if values else None

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
            if not self._resolve_is_additive(metric_def):
                # Non-additive metrics (e.g. weight) cannot be meaningfully summed
                # across sets — fall back to last set value.
                return values[-1]
            return sum(values)
        # Unknown aggregation — fall back to last value recorded
        return values[-1]

    def _compute_auto_aggregations(self, instance: ActivityInstance, metric_defs: list) -> dict:
        """Compute all meaningful aggregations automatically from metric types.

        Returns a dict with:
          - additive_totals: {metric_id: total} for additive metrics
          - yield_per_set: [{set_index, yield}] for multiplicative metrics (if 2+)
          - total_yield: float sum of per-set yields (if multiplicative)
          - best_set_index: index of the best set (None if no sets)
          - best_set_yield: yield value of the best set (None if not multiplicative)
          - best_set_values: {metric_id: value} for all metrics in the best set
        """
        raw_data = models._safe_load_json(instance.data, {})
        sets = raw_data.get('sets', []) if isinstance(raw_data, dict) else []

        result = {
            'additive_totals': {},
            'yield_per_set': [],
            'total_yield': None,
            'best_set_index': None,
            'best_set_yield': None,
            'best_set_values': {},
        }

        if not metric_defs:
            return result

        mult_defs = [md for md in metric_defs if md.is_multiplicative]
        has_multiplicative = len(mult_defs) >= 2

        # --- Additive totals ---
        for md in metric_defs:
            if md.is_multiplicative or not self._resolve_is_additive(md):
                continue
            if sets:
                values = []
                for s in sets:
                    for m in s.get('metrics', []):
                        mid = m.get('metric_id') or m.get('metric_definition_id')
                        v = self._coerce_numeric(m.get('value'))
                        if mid == md.id and v is not None:
                            values.append(v)
                if values:
                    result['additive_totals'][md.id] = sum(values)
            else:
                mv = next(
                    (v for v in instance.metric_values if v.metric_definition_id == md.id),
                    None,
                )
                v = self._coerce_numeric(mv.value) if mv is not None else None
                if v is not None:
                    result['additive_totals'][md.id] = v

        # --- Yield per set and total yield ---
        if has_multiplicative and sets:
            yield_per_set = []
            total_yield = 0.0
            has_any_yield = False
            for set_index, s in enumerate(sets):
                set_metrics = {
                    (m.get('metric_id') or m.get('metric_definition_id')): self._coerce_numeric(m.get('value'))
                    for m in s.get('metrics', [])
                }
                product = 1.0
                set_complete = True
                for md in mult_defs:
                    val = set_metrics.get(md.id)
                    if val is None:
                        set_complete = False
                        break
                    product *= val
                if set_complete:
                    yield_per_set.append({'set_index': set_index, 'yield': product})
                    total_yield += product
                    has_any_yield = True
            if has_any_yield:
                result['yield_per_set'] = yield_per_set
                result['total_yield'] = total_yield
        elif has_multiplicative:
            product = 1.0
            has_all_values = True
            for md in mult_defs:
                mv = next(
                    (v for v in instance.metric_values if v.metric_definition_id == md.id),
                    None,
                )
                v = self._coerce_numeric(mv.value) if mv is not None else None
                if v is None:
                    has_all_values = False
                    break
                product *= v
            if has_all_values:
                result['total_yield'] = product

        # --- Best set ---
        if sets:
            # Determine anchor metric: is_best_set_metric wins, else use yield if multiplicative
            anchor = next((md for md in metric_defs if md.is_best_set_metric), None)

            if anchor is not None:
                # Best set by anchor metric value (respects higher_is_better)
                higher_is_better = self._resolve_higher_is_better(anchor)
                best_index = None
                best_val = None
                for set_index, s in enumerate(sets):
                    for m in s.get('metrics', []):
                        mid = m.get('metric_id') or m.get('metric_definition_id')
                        if mid == anchor.id:
                            v = self._coerce_numeric(m.get('value'))
                            if v is None:
                                continue
                            if (
                                best_val is None
                                or (higher_is_better and v > best_val)
                                or (not higher_is_better and v < best_val)
                            ):
                                best_val = v
                                best_index = set_index
                result['best_set_index'] = best_index
            elif has_multiplicative and result['yield_per_set']:
                # Best set = highest yield set
                best = max(result['yield_per_set'], key=lambda x: x['yield'])
                best_index = best['set_index']
                result['best_set_index'] = best_index
                result['best_set_yield'] = best['yield']
            elif metric_defs:
                # Single/non-multiplicative: best by first metric's higher_is_better
                primary = metric_defs[0]
                higher_is_better = self._resolve_higher_is_better(primary)
                best_index = None
                best_val = None
                for set_index, s in enumerate(sets):
                    for m in s.get('metrics', []):
                        mid = m.get('metric_id') or m.get('metric_definition_id')
                        if mid == primary.id:
                            v = self._coerce_numeric(m.get('value'))
                            if v is None:
                                continue
                            if (
                                best_val is None
                                or (higher_is_better and v > best_val)
                                or (not higher_is_better and v < best_val)
                            ):
                                best_val = v
                                best_index = set_index
                result['best_set_index'] = best_index

            # Populate best_set_values
            if result['best_set_index'] is not None and result['best_set_index'] < len(sets):
                best_s = sets[result['best_set_index']]
                for m in best_s.get('metrics', []):
                    mid = m.get('metric_id') or m.get('metric_definition_id')
                    v = self._coerce_numeric(m.get('value'))
                    if mid and v is not None:
                        result['best_set_values'][mid] = v
                # Also attach yield for best set if multiplicative
                if has_multiplicative and result['best_set_yield'] is None:
                    set_metrics = {
                        (m.get('metric_id') or m.get('metric_definition_id')): self._coerce_numeric(m.get('value'))
                        for m in best_s.get('metrics', [])
                    }
                    product = 1.0
                    set_complete = True
                    for md in mult_defs:
                        val = set_metrics.get(md.id)
                        if val is None:
                            set_complete = False
                            break
                        product *= val
                    if set_complete:
                        result['best_set_yield'] = product

        return result

    def _resolve_yield(self, instance: ActivityInstance, metric_defs: list, activity_def=None, root_progress_settings=None):
        """Compute total yield as Σ(product of multiplicative metrics per set).

        For set-based activities this gives the correct total load:
            e.g. (100kg × 8) + (100kg × 8) + (90kg × 6) = 2140

        For activities without sets, falls back to multiplying the scalar
        value of each multiplicative metric together (single-set equivalent).

        Returns (float total, list of metric_def_ids used)
        or (None, []) if fewer than 2 multiplicative metrics have data.
        """
        mult_defs = [md for md in metric_defs if md.is_multiplicative]
        if len(mult_defs) < 2:
            return None, []

        used_ids = [md.id for md in mult_defs]

        raw_data = models._safe_load_json(instance.data, {})
        sets = raw_data.get('sets', []) if isinstance(raw_data, dict) else []

        if sets:
            # Per-set multiplication then sum across sets.
            # A set only contributes if every multiplicative metric has a value.
            total = 0.0
            contributed = False
            for s in sets:
                set_metrics = {
                    (m.get('metric_id') or m.get('metric_definition_id')): self._coerce_numeric(m.get('value'))
                    for m in s.get('metrics', [])
                }
                product = 1.0
                set_complete = True
                for md in mult_defs:
                    val = set_metrics.get(md.id)
                    if val is None:
                        set_complete = False
                        break
                    product *= val
                if set_complete:
                    total += product
                    contributed = True
            if not contributed:
                return None, []
            return total, used_ids

        # No sets — multiply scalar values together (single-set equivalent).
        product = 1.0
        for md in mult_defs:
            aggregation = self._resolve_aggregation(
                md,
                mult_defs,
                activity_def,
                root_progress_settings,
                has_sets=False,
            )
            val = self._extract_metric_value(instance, md, aggregation)
            if val is None:
                return None, []
            product *= val
        return product, used_ids

    # ------------------------------------------------------------------
    # Comparison logic
    # ------------------------------------------------------------------

    def _build_comparison(
        self,
        current_instance: ActivityInstance,
        previous_instance: Optional[ActivityInstance],
        metric_defs: list,
        activity_def=None,
        root_progress_settings=None,
    ):
        """Build metric_comparisons list and derived_summary dict.

        Returns:
            (metric_comparisons, derived_summary, has_improvement, has_regression,
             has_change, comparison_type)
        """
        activity_tracks_progress = activity_def is None or getattr(activity_def, 'track_progress', None) is not False
        tracked_defs = [md for md in metric_defs if md.track_progress] if activity_tracks_progress else []

        if previous_instance is None:
            # First time this activity has been completed
            auto_aggregations = self._compute_auto_aggregations(current_instance, tracked_defs)
            summary_line = 'First time!' if tracked_defs else 'No tracked metrics'
            comparison_type = 'first_instance' if tracked_defs else None
            return (
                [],
                {'summary_line': summary_line, 'auto_aggregations': auto_aggregations},
                False,
                False,
                False,
                comparison_type,
            )

        # Filter to metrics with track_progress enabled
        # Activity-level track_progress (null = True for backward compat) takes priority over per-metric
        if not activity_tracks_progress:
            auto_aggregations = self._compute_auto_aggregations(current_instance, tracked_defs)
            return [], {'summary_line': 'No tracked metrics', 'auto_aggregations': auto_aggregations}, False, False, False, None
        if not tracked_defs:
            auto_aggregations = self._compute_auto_aggregations(current_instance, tracked_defs)
            return [], {'summary_line': 'No tracked metrics', 'auto_aggregations': auto_aggregations}, False, False, False, None

        metric_comparisons = []
        has_improvement = False
        has_regression = False
        has_change = False

        curr_data = models._safe_load_json(current_instance.data, {})
        curr_sets = curr_data.get('sets', []) if isinstance(curr_data, dict) else []
        has_sets = bool(curr_sets)

        # Yield is derived automatically when at least two tracked multiplicative metrics exist.
        mult_tracked_defs = [md for md in tracked_defs if md.is_multiplicative]
        yield_requested = len(mult_tracked_defs) >= 2
        curr_yield = None
        prev_yield = None
        yield_ids = []
        if yield_requested:
            curr_yield, yield_ids = self._resolve_yield(current_instance, tracked_defs, activity_def, root_progress_settings)
            prev_yield, _ = self._resolve_yield(previous_instance, tracked_defs, activity_def, root_progress_settings)

        comparison_type = 'flat_metrics'

        # Check if sets are present to pick a better comparison_type label
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
            # Build a label from the names of the contributing metrics
            yield_metric_names = [
                md.name for md in tracked_defs if md.id in yield_ids
            ]
            yield_label = ' × '.join(yield_metric_names) if yield_metric_names else 'Yield'
            metric_comparisons.append({
                'type': 'yield',
                'metric_ids': yield_ids,
                'metric_name': yield_label,
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
                aggregation = self._resolve_aggregation(
                    md,
                    tracked_defs,
                    activity_def,
                    root_progress_settings,
                    has_sets=has_sets,
                )
                if aggregation == 'yield':
                    continue
                higher_is_better = self._resolve_higher_is_better(md)
                curr_val = self._extract_metric_value(current_instance, md, aggregation, tracked_defs)
                prev_val = self._extract_metric_value(previous_instance, md, aggregation, tracked_defs)

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
                    current_instance,
                    previous_instance,
                    md,
                    higher_is_better,
                    aggregation=aggregation,
                    all_metric_defs=tracked_defs,
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
            auto_aggregations = self._compute_auto_aggregations(current_instance, tracked_defs)
            return [], {'summary_line': 'Yield unavailable', 'auto_aggregations': auto_aggregations}, False, False, False, 'yield'

        # Build a human-readable summary line
        # Count how many yield-aggregated metrics were skipped due to unavailable yield data
        yield_skipped = yield_requested and comparison_type != 'yield'
        summary_line = self._build_summary_line(metric_comparisons, has_improvement, has_regression, has_change, comparison_type)
        auto_aggregations = self._compute_auto_aggregations(current_instance, tracked_defs)
        prev_auto_aggregations = self._compute_auto_aggregations(previous_instance, tracked_defs) if previous_instance is not None else None
        derived_summary = {
            'summary_line': summary_line,
            'improved_count': sum(1 for mc in metric_comparisons if mc.get('improved')),
            'regressed_count': sum(1 for mc in metric_comparisons if mc.get('regressed')),
            'yield_partial': yield_skipped,
            'auto_aggregations': auto_aggregations,
            'prev_auto_aggregations': prev_auto_aggregations,
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
        or None if the instance is not found or progress is disabled.
        """
        instance = self._get_active_instance(activity_instance_id)
        if not instance:
            return None

        if not self._is_progress_enabled(instance.root_id):
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

        root_progress_settings = self._get_root_progress_settings(instance.root_id)
        previous = self.get_previous_instance(instance)

        is_first_instance = previous is None

        metric_comparisons, derived_summary, has_improvement, has_regression, has_change, comparison_type = (
            self._build_comparison(instance, previous, metric_defs, activity_def, root_progress_settings)
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

        if not self._is_progress_enabled(instance.root_id):
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

        root_progress_settings = self._get_root_progress_settings(instance.root_id)
        previous = self.get_previous_instance(instance)

        is_first_instance = previous is None

        metric_comparisons, derived_summary, has_improvement, has_regression, has_change, comparison_type = (
            self._build_comparison(instance, previous, metric_defs, activity_def, root_progress_settings)
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

    def recompute_progress_for_root(self, root_id: str) -> dict:
        """Rebuild progress records for every active activity definition in a root."""
        activity_defs = (
            self.db.query(ActivityDefinition)
            .filter(
                ActivityDefinition.root_id == root_id,
                ActivityDefinition.deleted_at == None,
            )
            .all()
        )

        recomputed = 0
        failures = []
        for activity_def in activity_defs:
            savepoint = self.db.begin_nested()
            try:
                self.recompute_progress_for_activity(activity_def.id, root_id)
                savepoint.commit()
                recomputed += 1
            except Exception as exc:
                savepoint.rollback()
                logger.exception(
                    "Error recomputing progress for activity %s in root %s",
                    activity_def.id,
                    root_id,
                )
                failures.append({
                    'activity_definition_id': activity_def.id,
                    'activity_name': activity_def.name,
                    'error': str(exc),
                })

        return {
            'recomputed': recomputed,
            'failed': failures,
            'total': len(activity_defs),
        }

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
