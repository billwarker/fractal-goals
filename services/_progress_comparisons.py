"""Mixin for ProgressService: building comparisons, summaries, and per-activity comparison maps.
"""

import json
from typing import Optional
from sqlalchemy import func
from models import ActivityInstance, Session


class _ProgressComparisonsMixin:
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
