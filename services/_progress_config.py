"""Mixin for ProgressService: calculation settings, aggregation choice, and metric direction.
"""

from typing import Optional
from models import Goal, MetricDefinition
from services.activity_progress_view_service import ActivityProgressViewService


class _ProgressConfigMixin:
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

    def _get_root_progress_settings(self, root_id: str) -> dict:
        """Return progress_settings dict for the root goal, or {} if not set."""
        if root_id in self._root_settings_cache:
            return self._root_settings_cache[root_id]
        root = self.db.get(Goal, root_id)
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
