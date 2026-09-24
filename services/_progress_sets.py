"""Mixin for ProgressService: set-level comparisons and metric value extraction.
"""

from typing import Optional
from models import ActivityInstance, MetricDefinition
from services.activity_instance_data import resolve_metric_id


class _ProgressSetsMixin:
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
        sets = self._sets_for_instance(instance)
        if not sets:
            return None

        anchor = next((md for md in metric_defs if md.is_best_set_metric), None)
        if anchor is None:
            anchor = metric_defs[0] if metric_defs else None
        if anchor is None:
            return None

        ranked_defs = [anchor, *(md for md in metric_defs if md.id != anchor.id)]
        best_index = None
        best_values = None
        for set_index, s in enumerate(sets):
            values_by_metric = {
                resolve_metric_id(m): self._coerce_numeric(m.get('value'))
                for m in s.get('metrics', [])
            }
            values = [values_by_metric.get(md.id) for md in ranked_defs]
            if values[0] is None:
                continue

            is_better = best_values is None
            if best_values is not None:
                for metric_def, candidate, incumbent in zip(ranked_defs, values, best_values):
                    if candidate == incumbent:
                        continue
                    if candidate is None:
                        break
                    if incumbent is None:
                        is_better = True
                        break
                    is_better = (
                        candidate > incumbent
                        if self._resolve_higher_is_better(metric_def)
                        else candidate < incumbent
                    )
                    break
            if is_better:
                best_values = values
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
        current_sets = self._sets_for_instance(current_instance)
        previous_sets = self._sets_for_instance(previous_instance)
        return [{
            'set_index': current_sets[current_best_index]['_progress_set_index'],
            'comparison_basis': 'best_set',
            'previous_set_index': previous_sets[previous_best_index]['_progress_set_index'],
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
        sets = self._sets_for_instance(instance)
        result = []
        for set_index, s in enumerate(sets):
            for m in s.get('metrics', []):
                mid = resolve_metric_id(m)
                if mid == metric_def.id:
                    v = self._coerce_numeric(m.get('value'))
                    if v is not None:
                        result.append((s.get('_progress_set_index', set_index), v))
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
        sets = self._sets_for_instance(instance)

        if aggregation == 'last':
            # For set-based activities always read from sets so the value
            # reflects the last set actually entered, not a stale flat row.
            if sets:
                values = []
                for s in sets:
                    for m in s.get('metrics', []):
                        mid = resolve_metric_id(m)
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
                    mid = resolve_metric_id(m)
                    if mid == metric_def.id:
                        return self._coerce_numeric(m.get('value'))
            # No best set found — fall back to per-metric max
            values = []
            for s in sets:
                for m in s.get('metrics', []):
                    mid = resolve_metric_id(m)
                    v = self._coerce_numeric(m.get('value'))
                    if mid == metric_def.id and v is not None:
                        values.append(v)
            return max(values) if values else None

        values = []
        for s in sets:
            for m in s.get('metrics', []):
                mid = resolve_metric_id(m)
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
