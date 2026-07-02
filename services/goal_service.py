"""Goal service.

Originally a single ~1,283-line module; the GoalService class was decomposed
into concern mixins (audit P1-7). The public surface is unchanged:
`GoalService`, `sync_goal_targets`, and the module-level helpers
(`resolve_level_id`, `session_goals_supports_source`,
`session_goal_insert_values`, `authorize_goal_access`) are still importable
from `services.goal_service`.

Concern modules:
- _goal_service_common.py  imports, level-rank constants, module helper funcs
- _goal_helpers.py         private helpers (auth/subtree/soft-delete/validation)
- _goal_fractals.py        fractal (root) list/create/delete/tree/selection
- _goal_crud.py            goal create/get/update/delete
- _goal_metrics.py         goal metrics, daily durations, timeline
- _goal_targets.py         delete_fractal_goal + goal-target operations
- _goal_lifecycle.py       completion, evaluation, copy, pause, move, convert
"""
# Re-export the module-level surface (helpers, constants, sync_goal_targets) so
# `from services.goal_service import X` keeps working unchanged.
from services._goal_service_common import (  # noqa: F401
    resolve_level_id,
    session_goals_supports_source,
    session_goal_insert_values,
    authorize_goal_access,
)
from services.goal_target_service import sync_goal_targets  # noqa: F401  (public re-export)
from services._goal_helpers import _GoalHelpersMixin
from services._goal_fractals import _GoalFractalsMixin
from services._goal_crud import _GoalCrudMixin
from services._goal_metrics import _GoalMetricsMixin
from services._goal_targets import _GoalTargetsMixin
from services._goal_lifecycle import _GoalLifecycleMixin

__all__ = ["GoalService", "sync_goal_targets", "resolve_level_id",
           "session_goals_supports_source", "session_goal_insert_values",
           "authorize_goal_access"]


class GoalService(
    _GoalHelpersMixin,
    _GoalFractalsMixin,
    _GoalCrudMixin,
    _GoalMetricsMixin,
    _GoalTargetsMixin,
    _GoalLifecycleMixin,
):
    """Validated read/write path for fractals and goals. Composed from concern
    mixins whose instance methods call each other through `self`."""

    def __init__(self, db_session, *, sync_targets):
        self.db_session = db_session
        self.sync_targets = sync_targets
