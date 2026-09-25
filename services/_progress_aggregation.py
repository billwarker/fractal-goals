"""Mixin for ProgressService: automatic aggregations and yield.
"""

from models import ActivityInstance
from services.activity_instance_data import resolve_metric_id


class _ProgressAggregationMixin:
    def _compute_auto_aggregations(self, instance: ActivityInstance, metric_defs: list) -> dict:
        """Compute all meaningful aggregations automatically from metric types.

        Returns a dict with:
          - additive_totals: {metric_id: total} for additive metrics
          - yield_per_set: [{set_index, yield}] when all tracked metrics are multiplicative (if 2+)
          - total_yield: float sum of per-set yields (if yield-eligible)
          - best_set_index: index of the best set (None if no sets)
          - best_set_yield: yield value of the best set (None if not multiplicative)
          - best_set_values: {metric_id: value} for all metrics in the best set
        """
        sets = self._sets_for_instance(instance)

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

        has_yield = self._can_compute_yield(metric_defs)
        mult_defs = metric_defs if has_yield else []

        # --- Additive totals ---
        for md in metric_defs:
            if not self._resolve_is_additive(md):
                continue
            if sets:
                values = []
                for s in sets:
                    for m in s.get('metrics', []):
                        mid = resolve_metric_id(m)
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
        if has_yield and sets:
            yield_per_set = []
            total_yield = 0.0
            has_any_yield = False
            for set_index, s in enumerate(sets):
                set_metrics = {
                    (resolve_metric_id(m)): self._coerce_numeric(m.get('value'))
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
                    yield_per_set.append({
                        'set_index': s.get('_progress_set_index', set_index),
                        'yield': product,
                    })
                    total_yield += product
                    has_any_yield = True
            if has_any_yield:
                result['yield_per_set'] = yield_per_set
                result['total_yield'] = total_yield
        elif has_yield:
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
                best_position = self._find_best_set_index(instance, metric_defs)
                if best_position is not None:
                    result['best_set_index'] = sets[best_position].get('_progress_set_index', best_position)
            elif has_yield and result['yield_per_set']:
                # Best set = highest yield set
                best = max(result['yield_per_set'], key=lambda x: x['yield'])
                best_index = best['set_index']
                result['best_set_index'] = best_index
                result['best_set_yield'] = best['yield']
            elif metric_defs:
                # Single/non-multiplicative: best by first metric's higher_is_better
                best_position = self._find_best_set_index(instance, metric_defs)
                if best_position is not None:
                    result['best_set_index'] = sets[best_position].get('_progress_set_index', best_position)

            # Populate best_set_values
            best_s = next(
                (
                    row for position, row in enumerate(sets)
                    if row.get('_progress_set_index', position) == result['best_set_index']
                ),
                None,
            )
            if best_s is not None:
                for m in best_s.get('metrics', []):
                    mid = resolve_metric_id(m)
                    v = self._coerce_numeric(m.get('value'))
                    if mid and v is not None:
                        result['best_set_values'][mid] = v
                # Also attach yield for best set if multiplicative
                if has_yield and result['best_set_yield'] is None:
                    set_metrics = {
                        (resolve_metric_id(m)): self._coerce_numeric(m.get('value'))
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
        if not self._can_compute_yield(metric_defs):
            return None, []

        mult_defs = metric_defs
        used_ids = [md.id for md in mult_defs]

        sets = self._sets_for_instance(instance)

        if sets:
            # Per-set multiplication then sum across sets.
            # A set only contributes if every multiplicative metric has a value.
            total = 0.0
            contributed = False
            for s in sets:
                set_metrics = {
                    (resolve_metric_id(m)): self._coerce_numeric(m.get('value'))
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
