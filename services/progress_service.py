"""
Progress Service

Computes progress comparisons on demand from canonical activity data.
Compares a completed activity instance against the most recent prior
completed instance of the same activity from a different session.
"""

import logging
import json
from typing import Optional

from sqlalchemy import and_, func, not_, or_, true
from sqlalchemy.orm import joinedload, selectinload

from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivityProgressView,
    ActivitySet,
    ActivityTag,
    Goal,
    MetricDefinition,
    Note,
    Session,
)
from services.activity_instance_data import load_instance_sets, resolve_metric_id
from services.activity_progress_view_service import (
    ActivityProgressViewService,
    EMPTY_PROGRESS_VIEW_CONFIG,
    normalize_progress_view_config,
)

logger = logging.getLogger(__name__)


class ProgressService:
    def __init__(self, db_session):
        self.db = db_session
        self._calculation_config = dict(EMPTY_PROGRESS_VIEW_CONFIG)
        self._comparison_cache = {}
        self._root_settings_cache = {}

    @staticmethod
    def _matches_tag_config(tag_ids, config) -> bool:
        present = set(tag_ids or [])
        required = set(config.get('all_tag_ids') or [])
        alternatives = set(config.get('any_tag_ids') or [])
        excluded = set(config.get('none_tag_ids') or [])
        return required.issubset(present) and (not alternatives or bool(present & alternatives)) and not bool(present & excluded)

    @staticmethod
    def _instance_tag_ids(instance) -> set[str]:
        return {tag.id for tag in (getattr(instance, 'tags', None) or [])}

    def _sets_for_instance(self, instance: ActivityInstance) -> list:
        serialized = [
            {**payload, '_progress_set_index': index}
            for index, payload in enumerate(load_instance_sets(instance))
        ]
        config = self._calculation_config
        if not any(config.get(key) for key in ('all_tag_ids', 'any_tag_ids', 'none_tag_ids')):
            return serialized
        inherited = self._instance_tag_ids(instance)
        rows = list(getattr(instance, 'sets', None) or [])
        filtered = []
        for index, payload in enumerate(serialized):
            row = rows[index] if index < len(rows) else None
            direct = {tag.id for tag in (getattr(row, 'tags', None) or [])}
            if self._matches_tag_config(inherited | direct, config):
                filtered.append(payload)
        return filtered

    def _instance_included(self, instance: ActivityInstance) -> bool:
        config = self._calculation_config
        if not any(config.get(key) for key in ('all_tag_ids', 'any_tag_ids', 'none_tag_ids')):
            return True
        if getattr(instance.definition, 'has_sets', False) or getattr(instance, 'sets', None):
            return bool(self._sets_for_instance(instance))
        return self._matches_tag_config(self._instance_tag_ids(instance), config)

    def _resolve_calculation_config(self, instance, *, view_id=None, config=None):
        if config is not None:
            normalized, error = ActivityProgressViewService(self.db)._validate_config_tags(instance.definition, config)
        else:
            normalized, error = ActivityProgressViewService(self.db).resolve_config(
                instance.definition,
                view_id=view_id,
            )
        return normalized, error

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
            .options(
                joinedload(ActivityInstance.definition).selectinload(ActivityDefinition.metric_definitions),
                joinedload(ActivityInstance.session).joinedload(Session.template),
                selectinload(ActivityInstance.tags),
                selectinload(ActivityInstance.metric_values),
                selectinload(ActivityInstance.sets).selectinload(ActivitySet.tags),
                selectinload(ActivityInstance.sets).selectinload(ActivitySet.metric_values),
            )
            .filter(
                ActivityInstance.deleted_at == None,
                Session.deleted_at == None,
            )
        )

    @staticmethod
    def _effective_time_expression():
        return func.coalesce(
            ActivityInstance.time_stop,
            Session.session_start,
            ActivityInstance.created_at,
        )

    def _active_instance_identity_query(self):
        return (
            self.db.query(
                ActivityInstance.id,
                ActivityInstance.session_id,
                ActivityInstance.completed,
                self._effective_time_expression().label('effective_time'),
            )
            .join(Session, ActivityInstance.session_id == Session.id)
            .filter(ActivityInstance.deleted_at.is_(None), Session.deleted_at.is_(None))
        )

    @staticmethod
    def _tag_membership_clause(tag_id, *, include_set_tags):
        inherited = ActivityInstance.tags.any(ActivityTag.id == tag_id)
        if not include_set_tags:
            return inherited
        direct = ActivitySet.tags.any(ActivityTag.id == tag_id)
        return or_(inherited, direct)

    def _included_instance_clause(self, activity_def, config):
        """Return the SQL predicate matching the in-memory tag semantics."""
        if not any(config.get(key) for key in ('all_tag_ids', 'any_tag_ids', 'none_tag_ids')):
            return true()

        if activity_def.has_sets:
            set_clauses = [
                self._tag_membership_clause(tag_id, include_set_tags=True)
                for tag_id in config.get('all_tag_ids') or []
            ]
            any_clauses = [
                self._tag_membership_clause(tag_id, include_set_tags=True)
                for tag_id in config.get('any_tag_ids') or []
            ]
            none_clauses = [
                self._tag_membership_clause(tag_id, include_set_tags=True)
                for tag_id in config.get('none_tag_ids') or []
            ]
            if any_clauses:
                set_clauses.append(or_(*any_clauses))
            if none_clauses:
                set_clauses.append(not_(or_(*none_clauses)))
            return ActivityInstance.sets.any(and_(*set_clauses))

        clauses = [
            self._tag_membership_clause(tag_id, include_set_tags=False)
            for tag_id in config.get('all_tag_ids') or []
        ]
        any_clauses = [
            self._tag_membership_clause(tag_id, include_set_tags=False)
            for tag_id in config.get('any_tag_ids') or []
        ]
        none_clauses = [
            self._tag_membership_clause(tag_id, include_set_tags=False)
            for tag_id in config.get('none_tag_ids') or []
        ]
        if any_clauses:
            clauses.append(or_(*any_clauses))
        if none_clauses:
            clauses.append(not_(or_(*none_clauses)))
        return and_(*clauses)

    @staticmethod
    def _predecessor_ids_for_targets(included_rows, target_ids):
        target_ids = set(target_ids)
        predecessors = {}
        prior_rows = []
        for row in included_rows:
            if row.id in target_ids:
                eligible = [candidate for candidate in prior_rows if candidate.session_id != row.session_id]
                previous = next((candidate for candidate in reversed(eligible) if candidate.completed), None)
                if previous is None and eligible:
                    previous = eligible[-1]
                predecessors[row.id] = previous.id if previous else None
            prior_rows.append(row)
        return predecessors

    def _get_active_instance(self, activity_instance_id: str) -> Optional[ActivityInstance]:
        return (
            self._active_instances_query()
            .filter(ActivityInstance.id == activity_instance_id)
            .first()
        )

    def _get_root_progress_settings(self, root_id: str) -> dict:
        """Return progress_settings dict for the root goal, or {} if not set."""
        if root_id in self._root_settings_cache:
            return self._root_settings_cache[root_id]
        root = self.db.query(Goal).filter_by(id=root_id).first()
        if root and root.progress_settings and isinstance(root.progress_settings, dict):
            settings = root.progress_settings
        else:
            settings = {}
        self._root_settings_cache[root_id] = settings
        return settings

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

    def _can_compute_yield(self, metric_defs: list) -> bool:
        """Yield is valid only when every tracked metric participates multiplicatively."""
        return bool(metric_defs) and len(metric_defs) >= 2 and all(md.is_multiplicative for md in metric_defs)

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

        curr_sets = self._sets_for_instance(current_instance)
        has_sets = bool(curr_sets)

        # Yield is derived only when every tracked metric is multiplicative.
        yield_requested = self._can_compute_yield(tracked_defs)
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

    def _comparison_payload(self, instance, activity_def, previous, *, view_id, config):
        self._calculation_config = config
        if not self._instance_included(instance):
            return {
                'activity_instance_id': instance.id,
                'activity_definition_id': instance.activity_definition_id,
                'session_id': instance.session_id,
                'previous_instance_id': None,
                'included': False,
                'is_first_instance': False,
                'has_change': False,
                'has_improvement': False,
                'has_regression': False,
                'comparison_type': 'excluded',
                'metric_comparisons': [],
                'derived_summary': {'summary_line': 'Excluded from current progress view'},
                'progress_view_id': view_id,
                'progress_view_config': config,
            }

        metric_defs = [
            metric for metric in activity_def.metric_definitions
            if metric.deleted_at is None and metric.is_active
        ]
        comparison = self._build_comparison(
            instance,
            previous,
            metric_defs,
            activity_def,
            self._get_root_progress_settings(instance.root_id),
        )
        metric_comparisons, derived_summary, improved, regressed, changed, comparison_type = comparison
        return {
            'activity_instance_id': instance.id,
            'activity_definition_id': instance.activity_definition_id,
            'session_id': instance.session_id,
            'previous_instance_id': previous.id if previous else None,
            'included': True,
            'is_first_instance': previous is None,
            'has_change': changed,
            'has_improvement': improved,
            'has_regression': regressed,
            'comparison_type': comparison_type,
            'metric_comparisons': metric_comparisons,
            'derived_summary': derived_summary,
            'progress_view_id': view_id,
            'progress_view_config': config,
        }

    def _build_activity_comparison_map(self, activity_def, config, view_id, instances):
        signature = json.dumps(config, sort_keys=True, separators=(',', ':'))
        cache_key = (activity_def.id, view_id, signature)
        if cache_key in self._comparison_cache:
            return self._comparison_cache[cache_key]
        included = []
        results = {}
        self._calculation_config = config
        for instance in instances:
            if not self._instance_included(instance):
                results[instance.id] = self._comparison_payload(
                    instance, activity_def, None, view_id=view_id, config=config,
                )
                continue
            eligible = [row for row in included if row.session_id != instance.session_id]
            previous = next((row for row in reversed(eligible) if row.completed), None)
            if previous is None and eligible:
                previous = eligible[-1]
            results[instance.id] = self._comparison_payload(
                instance, activity_def, previous, view_id=view_id, config=config,
            )
            included.append(instance)
        self._comparison_cache[cache_key] = results
        return results

    def _activity_comparison_map(self, activity_def, config, view_id):
        """Build an activity's comparison chain once, in canonical time order."""
        effective_time = func.coalesce(
            ActivityInstance.time_stop,
            Session.session_start,
            ActivityInstance.created_at,
        )
        instances = (
            self._active_instances_query()
            .filter(
                ActivityInstance.activity_definition_id == activity_def.id,
                ActivityInstance.root_id == activity_def.root_id,
            )
            .order_by(effective_time.asc(), ActivityInstance.id.asc())
            .all()
        )
        return self._build_activity_comparison_map(activity_def, config, view_id, instances)

    def compute_comparisons_for_instances(self, instances) -> dict:
        """Batch active-view comparisons for session and analytics read models."""
        target_ids = [instance.id for instance in instances if instance and instance.deleted_at is None]
        if not target_ids:
            return {}
        targets = self._active_instances_query().filter(ActivityInstance.id.in_(target_ids)).all()
        if not targets:
            return {}
        activities = {instance.definition.id: instance.definition for instance in targets if instance.definition}
        active_ids = {
            activity.active_progress_view_id
            for activity in activities.values()
            if activity.active_progress_view_id
        }
        active_views = {}
        if active_ids:
            active_views = {
                view.id: view
                for view in self.db.query(ActivityProgressView).filter(
                    ActivityProgressView.id.in_(active_ids),
                    ActivityProgressView.deleted_at.is_(None),
                ).all()
            }
        enabled_roots = {
            root_id: self._is_progress_enabled(root_id)
            for root_id in {activity.root_id for activity in activities.values()}
        }
        configs_by_activity = {}
        view_ids_by_activity = {}
        included_scope_clauses = []
        for activity in activities.values():
            if not enabled_roots.get(activity.root_id, True):
                continue
            view = active_views.get(activity.active_progress_view_id)
            config = normalize_progress_view_config(view.config if view else EMPTY_PROGRESS_VIEW_CONFIG)
            configs_by_activity[activity.id] = config
            view_ids_by_activity[activity.id] = view.id if view else None
            included_scope_clauses.append(
                and_(
                    ActivityInstance.activity_definition_id == activity.id,
                    ActivityInstance.root_id == activity.root_id,
                    self._included_instance_clause(activity, config),
                )
            )

        included_rows = []
        if included_scope_clauses:
            included_rows = (
                self._active_instance_identity_query()
                .filter(or_(*included_scope_clauses))
                .add_columns(ActivityInstance.activity_definition_id)
                .order_by(
                    ActivityInstance.activity_definition_id,
                    self._effective_time_expression().asc(),
                    ActivityInstance.id.asc(),
                )
                .all()
            )
        rows_by_activity = {}
        for row in included_rows:
            rows_by_activity.setdefault(row.activity_definition_id, []).append(row)

        predecessor_ids = {}
        included_ids = set()
        target_ids_by_activity = {}
        for target in targets:
            target_ids_by_activity.setdefault(target.activity_definition_id, []).append(target.id)
        for activity_id, rows in rows_by_activity.items():
            included_ids.update(row.id for row in rows)
            predecessor_ids.update(
                self._predecessor_ids_for_targets(rows, target_ids_by_activity.get(activity_id, []))
            )

        required_previous_ids = {instance_id for instance_id in predecessor_ids.values() if instance_id}
        previous_by_id = {}
        if required_previous_ids:
            previous_by_id = {
                instance.id: instance
                for instance in self._active_instances_query().filter(ActivityInstance.id.in_(required_previous_ids)).all()
            }

        results = {}
        for target in targets:
            activity = activities[target.activity_definition_id]
            config = configs_by_activity.get(activity.id)
            if config is None:
                continue
            previous_id = predecessor_ids.get(target.id) if target.id in included_ids else None
            results[target.id] = self._comparison_payload(
                target,
                activity,
                previous_by_id.get(previous_id),
                view_id=view_ids_by_activity.get(activity.id),
                config=config,
            )
        return {instance.id: results.get(instance.id) for instance in targets}

    def compute_live_comparison(self, activity_instance_id: str, *, view_id=None, config=None) -> Optional[dict]:
        """Compute a progress comparison without persisting it.

        Returns a comparison payload, or ``None`` when the instance is missing
        or progress is disabled for its fractal.
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

        resolved_config, config_error = self._resolve_calculation_config(
            instance,
            view_id=view_id,
            config=config,
        )
        if config_error:
            return None
        normalized = normalize_progress_view_config(resolved_config)
        selected_view_id = view_id if view_id is not None else activity_def.active_progress_view_id
        return self._activity_comparison_map(activity_def, normalized, selected_view_id).get(instance.id)

    def get_progress_for_instance(self, activity_instance_id: str) -> Optional[dict]:
        """Calculate progress from canonical activity data and the active saved view."""
        return self.compute_live_comparison(activity_instance_id)

    def get_progress_history(
        self,
        activity_definition_id: str,
        root_id: str,
        limit: int = 20,
        offset: int = 0,
        exclude_session_id: str | None = None,
        view_id: str | None = None,
        config: dict | None = None,
    ) -> list:
        """Return paginated progress history aligned to activity history cards."""
        timeline = self.get_progress_timeline(
            activity_definition_id,
            root_id,
            limit=limit,
            offset=offset,
            exclude_session_id=exclude_session_id,
            view_id=view_id,
            config=config,
        )
        return [
            item['progress_comparison']
            for item in timeline.get('items', [])
            if item.get('progress_comparison') is not None
        ]

    def get_progress_timeline(
        self,
        activity_definition_id: str,
        root_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
        exclude_session_id: str | None = None,
        view_id: str | None = None,
        config: dict | None = None,
    ) -> dict:
        from services.activity_progress_view_service import serialize_activity_tag, serialize_progress_view
        from services.view_serializers import serialize_activity_history_entry

        activity = self.db.query(ActivityDefinition).filter(
            ActivityDefinition.id == activity_definition_id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).first()
        if not activity:
            return {"items": [], "total": 0}

        if config is not None:
            resolved_config, config_error = ActivityProgressViewService(self.db)._validate_config_tags(activity, config)
        else:
            resolved_config, config_error = ActivityProgressViewService(self.db).resolve_config(
                activity,
                view_id=view_id,
            )
        if config_error:
            raise ValueError(config_error)
        normalized_config = normalize_progress_view_config(resolved_config)
        selected_view_id = view_id if view_id is not None else activity.active_progress_view_id
        base_identity_query = self._active_instance_identity_query().filter(
            ActivityInstance.activity_definition_id == activity.id,
            ActivityInstance.root_id == root_id,
        )
        if exclude_session_id:
            base_identity_query = base_identity_query.filter(ActivityInstance.session_id != exclude_session_id)

        total = base_identity_query.count()
        included_clause = self._included_instance_clause(activity, normalized_config)
        included_count = base_identity_query.filter(included_clause).count()
        included_rows = (
            base_identity_query
            .filter(included_clause)
            .order_by(self._effective_time_expression().asc(), ActivityInstance.id.asc())
            .all()
        )
        page_query = self._active_instances_query().filter(
            ActivityInstance.activity_definition_id == activity.id,
            ActivityInstance.root_id == root_id,
        )
        if exclude_session_id:
            page_query = page_query.filter(ActivityInstance.session_id != exclude_session_id)
        instances = (
            page_query
            .order_by(self._effective_time_expression().desc(), ActivityInstance.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        predecessor_ids = self._predecessor_ids_for_targets(included_rows, [instance.id for instance in instances])
        needed_previous_ids = {row_id for row_id in predecessor_ids.values() if row_id}
        previous_by_id = {}
        if needed_previous_ids:
            previous_by_id = {
                instance.id: instance
                for instance in self._active_instances_query().filter(ActivityInstance.id.in_(needed_previous_ids)).all()
            }

        comparison_map = {}
        self._calculation_config = normalized_config
        included_ids = {row.id for row in included_rows}
        for instance in instances:
            previous_id = predecessor_ids.get(instance.id) if instance.id in included_ids else None
            comparison_map[instance.id] = self._comparison_payload(
                instance,
                activity,
                previous_by_id.get(previous_id),
                view_id=selected_view_id,
                config=normalized_config,
            )
        notes = []
        instance_ids = [instance.id for instance in instances]
        if instance_ids:
            notes = self.db.query(Note).filter(
                Note.activity_instance_id.in_(instance_ids),
                Note.deleted_at.is_(None),
            ).order_by(Note.pinned_at.desc().nullslast(), Note.created_at.desc()).all()
        notes_by_instance = {}
        for note in notes:
            notes_by_instance.setdefault(note.activity_instance_id, []).append(note)
        items = []
        for instance in instances:
            comparison = comparison_map.get(instance.id)
            payload = serialize_activity_history_entry(instance, notes_by_instance.get(instance.id, []))
            payload["progress_comparison"] = comparison
            payload["included"] = comparison is not None and comparison.get("included", True)
            items.append(payload)

        tags = self.db.query(ActivityTag).filter(
            ActivityTag.activity_definition_id == activity.id,
        ).order_by(ActivityTag.deleted_at.asc(), ActivityTag.sort_order, ActivityTag.name).all()
        views = self.db.query(ActivityProgressView).filter(
            ActivityProgressView.activity_definition_id == activity.id,
            ActivityProgressView.deleted_at.is_(None),
        ).order_by(ActivityProgressView.updated_at.desc()).all()
        return {
            "activity_definition_id": activity.id,
            "active_view_id": activity.active_progress_view_id,
            "selected_view_id": selected_view_id,
            "tags": [serialize_activity_tag(tag) for tag in tags],
            "views": [serialize_progress_view(view) for view in views],
            "items": items,
            "included_count": included_count,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def get_progress_summary_for_session(self, session_id: str) -> list:
        """Return dynamic comparisons for completed instances in a session."""
        instances = (
            self._active_instances_query()
            .filter(
                ActivityInstance.session_id == session_id,
                ActivityInstance.completed == True,
            )
            .order_by(
                func.coalesce(ActivityInstance.time_stop, Session.session_start, ActivityInstance.created_at).desc(),
                ActivityInstance.id.desc(),
            )
            .all()
        )

        comparisons = self.compute_comparisons_for_instances(instances)
        return [comparisons[instance.id] for instance in instances if comparisons.get(instance.id) is not None]
