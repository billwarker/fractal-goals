"""Private helpers: auth, subtree, soft-delete, validation, level-rank, updates.

Mixin for GoalService (audit P1-7). Instance methods; cross-method calls use
`self.<method>(...)` and resolve through the composed GoalService instance.
"""
from datetime import datetime, timezone

from sqlalchemy.orm import selectinload

from models import ActivityInstance, ActivityDefinition, ActivityGroup, Goal, GoalLevel, MetricDefinition, Note, Session, SessionTemplate, SplitDefinition, activity_goal_associations, get_goal_by_id, validate_root_goal
from services.goal_type_utils import get_canonical_goal_type
from services.goal_loading import load_fractal_goals_for_serialization
from services.association_reconciliation import append_goal_association_event
from services.goal_condition_service import (
    ConditionValidationError, normalize_condition_payload, reconcile_goal, write_condition,
)
from validators import parse_date_string

from services._goal_service_common import authorize_goal_access, logger


class _GoalHelpersMixin:
    def _load_fractal_goals_for_serialization(self, root_id):
        return load_fractal_goals_for_serialization(self.db_session, root_id)

    def load_goal_subtree(self, goal: Goal) -> Goal:
        """Return ``goal`` with its whole subtree bulk-loaded for serialize_goal.

        Serializing a goal with children otherwise lazy-loads every descendant's
        level, condition, and associations one query at a time.
        """
        return self._load_fractal_goals_for_serialization(goal.root_id or goal.id).get(goal.id, goal)

    def _validate_owned_root(self, root_id, current_user_id) -> tuple[Goal | None, tuple[str, int] | None]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, ("Fractal not found or access denied", 404)
        return root, None

    def _get_activity_for_goal_association(self, root_id, activity_definition_id):
        if not activity_definition_id:
            return None, None

        activity = self.db_session.query(ActivityDefinition).filter(
            ActivityDefinition.id == activity_definition_id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).first()
        if not activity:
            return None, ("Activity not found in this fractal", 400)
        return activity, None

    def _associate_goal_with_activity(self, goal_id, activity_id) -> None:
        activity = self.db_session.query(ActivityDefinition).filter_by(
            id=activity_id,
        ).populate_existing().with_for_update().first()
        if not activity:
            return
        existing = self.db_session.execute(
            activity_goal_associations.select().where(
                activity_goal_associations.c.activity_id == activity_id,
                activity_goal_associations.c.goal_id == goal_id,
            )
        ).first()
        if existing:
            return

        self.db_session.execute(
            activity_goal_associations.insert().values(
                activity_id=activity_id,
                goal_id=goal_id,
            )
        )
        activity.row_version += 1
        goal = get_goal_by_id(self.db_session, goal_id, load_associations=False)
        if goal and activity:
            append_goal_association_event(
                self.db_session,
                root_id=goal.root_id or goal.id,
                goal_id=goal_id,
                association_kind="activity",
                association_id=activity_id,
                association_name=activity.name,
                action="associated",
            )

    def _get_authorized_goal(
        self,
        goal_id: str,
        current_user_id,
        *,
        load_associations: bool = True,
    ) -> tuple[Goal | None, tuple[str, int] | None]:
        goal = get_goal_by_id(self.db_session, goal_id, load_associations=load_associations)
        if not goal:
            return None, ("Goal not found", 404)
        if not self._authorize_goal_access(current_user_id, goal):
            return None, ("Goal not found or access denied", 404)
        return goal, None

    def _collect_goal_subtree(self, goal: Goal) -> list[Goal]:
        root_scope_id = goal.root_id or goal.id
        active_goals = self.db_session.query(Goal).options(
            selectinload(Goal.level),
        ).filter(
            Goal.root_id == root_scope_id,
            Goal.deleted_at.is_(None),
        ).all()
        # The explicitly validated starting goal is always part of its own
        # subtree. This also keeps legacy goals with a missing root_id
        # deletable instead of turning the operation into a successful no-op.
        goals_by_id = {item.id: item for item in active_goals}
        goals_by_id[goal.id] = goal
        children_by_parent: dict[str | None, list[Goal]] = {}
        for item in active_goals:
            children_by_parent.setdefault(item.parent_id, []).append(item)

        subtree: list[Goal] = []
        stack = [goal.id]
        seen: set[str] = set()
        while stack:
            current_id = stack.pop()
            if current_id in seen:
                continue
            seen.add(current_id)

            current = goals_by_id.get(current_id)
            if not current:
                continue

            subtree.append(current)
            stack.extend(child.id for child in children_by_parent.get(current.id, []))

        return subtree

    def _soft_delete_goal_subtree(self, goal: Goal, deleted_at: datetime) -> list[Goal]:
        subtree = self._collect_goal_subtree(goal)
        subtree_ids = [item.id for item in subtree]

        for item in subtree:
            item.deleted_at = deleted_at

        return subtree

    def _soft_delete_root_entities(self, root_id: str, deleted_at: datetime) -> None:
        for model in (
            Session,
            ActivityInstance,
            ActivityDefinition,
            ActivityGroup,
            MetricDefinition,
            SplitDefinition,
            SessionTemplate,
            Note,
        ):
            query = self.db_session.query(model).filter(model.root_id == root_id)
            if hasattr(model, "deleted_at"):
                query = query.filter(model.deleted_at.is_(None))

            for row in query.all():
                row.deleted_at = deleted_at
                if isinstance(row, MetricDefinition):
                    row.is_active = False

    def _authorize_goal_access(self, current_user_id, goal, root_id_hint=None) -> str | None:
        return authorize_goal_access(self.db_session, current_user_id, goal, root_id_hint)

    def _parse_deadline(self, deadline_value) -> tuple[datetime | None, str | None]:
        if not deadline_value:
            return None, None

        if isinstance(deadline_value, str) and 'T' in deadline_value:
            deadline_value = deadline_value.split('T')[0]

        try:
            return parse_date_string(deadline_value), None
        except ValueError:
            return None, "Invalid deadline format. Use YYYY-MM-DD"

    def _validate_completion_payload(self, root_id, data) -> tuple[str | dict, int] | None:
        """Reject an invalid start date or condition before any row is written."""
        if data.get('started_at'):
            _, error = self._parse_deadline(data['started_at'])
            if error:
                return "Invalid start date format. Use YYYY-MM-DD", 400
        if data.get('completion_condition') == 'activity_threshold':
            try:
                normalize_condition_payload(self.db_session, root_id, data.get('condition'))
            except ConditionValidationError as error:
                return {"error": str(error), "field": "condition"}, 400
        return None

    def _apply_completion_fields(self, goal, data, pending_events) -> tuple[str | dict, int] | None:
        """Apply start date and completion condition from a create/update payload.

        A goal the condition completed is re-evaluated in place when its condition or active
        period changes; a newly satisfied condition is only reported (the client confirms).
        """
        changed = False
        if 'started_at' in data:
            started_at, error = self._parse_deadline(data['started_at'])
            if error:
                return "Invalid start date format. Use YYYY-MM-DD", 400
            if started_at is not None and not isinstance(started_at, datetime):
                started_at = datetime.combine(started_at, datetime.min.time())
            goal.started_at = started_at or goal.created_at or datetime.now(timezone.utc).replace(tzinfo=None)
            changed = True
        # Only an explicit start date is held to the due date; a goal created after its due date
        # (a backfilled goal) simply has an empty active period until its start is moved back.
        if 'started_at' in data and data['started_at'] and goal.deadline and goal.started_at.date() > (
            goal.deadline.date() if isinstance(goal.deadline, datetime) else goal.deadline
        ):
            return "The start date must be on or before the due date", 400
        if 'completion_condition' in data or 'condition' in data:
            completion_condition = data.get('completion_condition') or goal.completion_condition
            try:
                write_condition(self.db_session, goal, completion_condition, data.get('condition'))
            except ConditionValidationError as error:
                return {"error": str(error), "field": "condition"}, 400
            changed = True
        if 'deadline' in data:
            changed = True
        if changed and goal.id and goal.completed and goal.completion_source == 'condition':
            self.db_session.flush()
            goals_by_id = load_fractal_goals_for_serialization(self.db_session, goal.root_id or goal.id)
            reconcile_goal(
                self.db_session, goals_by_id.get(goal.id, goal), goals_by_id, pending_events, trigger='goal_updated',
            )
        return None

    def _validate_description_required(self, level_obj, description) -> str | None:
        if level_obj and getattr(level_obj, 'description_required', False):
            if not description or not description.strip():
                return f"A description is required for {level_obj.name}s."
        return None

    def _validate_parent_capacity(self, parent_goal, *, error_prefix) -> str | None:
        if not parent_goal or not parent_goal.level:
            return None

        parent_max = parent_goal.level.max_children
        if parent_max is None:
            return None

        current_children = self.db_session.query(Goal).filter_by(
            parent_id=parent_goal.id,
            deleted_at=None,
        ).count()
        if current_children >= parent_max:
            return f"{error_prefix} '{parent_goal.level.name}' allows a maximum of {parent_max} children."
        return None

    def _get_goal_level_rank(self, goal) -> int | None:
        if not goal:
            return None

        level = getattr(goal, 'level', None)
        if level and getattr(level, 'rank', None) is not None:
            return level.rank

        level_id = getattr(goal, 'level_id', None)
        if not level_id:
            return None

        level = self.db_session.query(GoalLevel).filter_by(id=level_id).first()
        return getattr(level, 'rank', None) if level else None

    def _validate_ancestor_rank_monotonicity(self, new_level_obj, parent_goal) -> str | None:
        """
        Validates that inserting a goal with new_level_obj under parent_goal produces
        a strictly increasing rank sequence from root to the new goal.

        Prevents incoherent paths like:
            Long Term (rank 1) → Short Term (rank 3) → Mid Term (rank 2)

        Returns an error message string if validation fails, or None if valid.
        """
        if not parent_goal or not new_level_obj:
            return None

        new_rank = getattr(new_level_obj, 'rank', None)
        if new_rank is None:
            return None

        # Walk from parent up to root, collecting (goal, rank) pairs
        chain = []
        current = parent_goal
        seen = set()
        while current:
            if current.id in seen:
                break
            seen.add(current.id)
            rank = self._get_goal_level_rank(current)
            level_name = getattr(getattr(current, 'level', None), 'name', None) or current.id
            chain.append((level_name, rank))
            if not current.parent_id:
                break
            current = self.db_session.query(Goal).options(
                selectinload(Goal.level)
            ).filter_by(id=current.parent_id, deleted_at=None).first()

        # chain is [parent, grandparent, ..., root]; reverse to root → parent
        chain.reverse()

        # Validate root → parent is already monotonically increasing
        for i in range(len(chain) - 1):
            name_a, rank_a = chain[i]
            name_b, rank_b = chain[i + 1]
            if rank_a is not None and rank_b is not None and rank_a >= rank_b:
                return (
                    f"Hierarchy path is not valid: '{name_a}' (rank {rank_a}) "
                    f"is not above '{name_b}' (rank {rank_b})"
                )

        # Validate new goal rank is strictly greater than parent rank
        parent_name, parent_rank = chain[-1] if chain else (None, None)
        if parent_rank is not None and new_rank <= parent_rank:
            return (
                f"Cannot create goal: '{new_level_obj.name}' (rank {new_rank}) "
                f"must be below parent level '{parent_name}' (rank {parent_rank})"
            )

        return None

    def _goals_share_same_tier(self, left_goal, right_goal) -> bool:
        if not left_goal or not right_goal:
            return False

        left_rank = self._get_goal_level_rank(left_goal)
        right_rank = self._get_goal_level_rank(right_goal)
        if left_rank is not None and right_rank is not None:
            return left_rank == right_rank

        return get_canonical_goal_type(left_goal) == get_canonical_goal_type(right_goal)

    def _apply_goal_updates(
        self,
        goal,
        data,
        *,
        root_id,
        allow_parent_update=False,
        allow_extended_fields=False,
        pending_events=None,
    ) -> tuple[Goal | None, tuple[str | dict, int] | None]:
        next_description = data['description'] if 'description' in data else goal.description
        level_error = self._validate_description_required(getattr(goal, 'level', None), next_description)
        if level_error:
            return None, (level_error, 400)

        old_parent_id = goal.parent_id

        if 'deadline' in data:
            deadline, deadline_error = self._parse_deadline(data['deadline'])
            if deadline_error:
                return None, (deadline_error, 400)

            # Due dates are soft guidance (services/goal_deadline_rules.py): a date after the
            # parent's, or before a child's, is saved and reported as a warning.
            goal.deadline = deadline

        if 'name' in data and data['name'] is not None:
            goal.name = data['name']
        if 'description' in data and data['description'] is not None:
            goal.description = data['description']

        completion_error = self._apply_completion_fields(goal, data, pending_events)
        if completion_error:
            return None, completion_error

        if allow_parent_update and 'parent_id' in data:
            new_parent_id = data['parent_id']
            if new_parent_id and new_parent_id != goal.parent_id:
                new_parent = self.db_session.query(Goal).filter_by(id=new_parent_id, root_id=root_id).first()
                if not new_parent:
                    return None, ("New parent goal not found in this fractal.", 400)
                parent_capacity_error = self._validate_parent_capacity(
                    new_parent,
                    error_prefix="Cannot move goal: New parent level",
                )
                if parent_capacity_error:
                    return None, (parent_capacity_error, 400)
            goal.parent_id = new_parent_id
            if new_parent_id != old_parent_id:
                parent_ids = sorted(value for value in (old_parent_id, new_parent_id) if value)
                for parent in self.db_session.query(Goal).filter(
                    Goal.id.in_(parent_ids),
                ).order_by(Goal.id).populate_existing().with_for_update().all():
                    parent.row_version += 1

        if allow_extended_fields:
            if 'relevance_statement' in data:
                goal.relevance_statement = data['relevance_statement']
            if 'inherit_parent_activities' in data:
                goal.inherit_parent_activities = data['inherit_parent_activities']
            if 'track_activities' in data:
                goal.track_activities = data['track_activities']
            if 'progress_settings' in data and goal.parent_id is None:
                # Only allow setting progress_settings on root goals
                settings = data['progress_settings']
                if settings is None:
                    goal.progress_settings = None
                elif isinstance(settings, dict):
                    current = goal.progress_settings or {}
                    goal.progress_settings = {**current, **settings}

        return goal, None

    def _find_max_updated(self, goal, current_max):
        if goal.updated_at and (not current_max or goal.updated_at > current_max):
            current_max = goal.updated_at
        for child in goal.children:
            current_max = self._find_max_updated(child, current_max)
        return current_max

    def _get_effective_level_maps_for_roots(self, current_user_id, root_ids):
        if not root_ids:
            return {}

        system_levels = self.db_session.query(GoalLevel).filter(
            GoalLevel.owner_id == None,
            GoalLevel.deleted_at == None,
        ).all()
        user_global_levels = self.db_session.query(GoalLevel).filter(
            GoalLevel.owner_id == current_user_id,
            GoalLevel.root_id == None,
            GoalLevel.deleted_at == None,
        ).all()
        root_levels = self.db_session.query(GoalLevel).filter(
            GoalLevel.owner_id == current_user_id,
            GoalLevel.root_id.in_(root_ids),
            GoalLevel.deleted_at == None,
        ).all()

        base_levels = {}
        for level in system_levels:
            base_levels[level.name] = level
        for level in user_global_levels:
            base_levels[level.name] = level

        levels_by_root = {root_id: dict(base_levels) for root_id in root_ids}
        for level in root_levels:
            levels_by_root.setdefault(level.root_id, dict(base_levels))[level.name] = level
        return levels_by_root
