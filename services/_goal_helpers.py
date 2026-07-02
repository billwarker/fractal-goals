"""Private helpers: auth, subtree, soft-delete, validation, level-rank, updates.

Mixin for GoalService (audit P1-7). Instance methods; cross-method calls use
`self.<method>(...)` and resolve through the composed GoalService instance.
"""
from datetime import datetime

from sqlalchemy.orm import selectinload

from models import ActivityInstance, ActivityDefinition, ActivityGroup, Goal, GoalLevel, MetricDefinition, Note, Session, SessionTemplate, SplitDefinition, Target, activity_goal_associations, get_goal_by_id, validate_root_goal
from services.goal_type_utils import get_canonical_goal_type
from services.goal_loading import load_fractal_goals_for_serialization
from validators import parse_date_string

from services._goal_service_common import authorize_goal_access, logger


class _GoalHelpersMixin:
    def _load_fractal_goals_for_serialization(self, root_id):
        return load_fractal_goals_for_serialization(self.db_session, root_id)

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
        goals_by_id = {item.id: item for item in active_goals}
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

        for target in self.db_session.query(Target).filter(
            Target.goal_id.in_(subtree_ids),
            Target.deleted_at.is_(None),
        ).all():
            target.deleted_at = deleted_at

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
            Target,
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

    def _cascade_child_deadlines(self, parent_goal, new_max) -> None:
        for child in (parent_goal.children or []):
            if child.deadline:
                child_deadline = child.deadline.date() if isinstance(child.deadline, datetime) else child.deadline
                if child_deadline > new_max:
                    child.deadline = new_max
                    logger.info("Cascaded deadline update to child goal %s", child.id)
                    self._cascade_child_deadlines(child, new_max)

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
    ) -> tuple[Goal | None, tuple[str | dict, int] | None]:
        next_description = data['description'] if 'description' in data else goal.description
        level_error = self._validate_description_required(getattr(goal, 'level', None), next_description)
        if level_error:
            return None, (level_error, 400)

        if 'deadline' in data:
            deadline, deadline_error = self._parse_deadline(data['deadline'])
            if deadline_error:
                return None, (deadline_error, 400)

            if deadline and goal.parent_id:
                parent = get_goal_by_id(self.db_session, goal.parent_id)
                if parent and parent.deadline:
                    parent_deadline = parent.deadline.date() if isinstance(parent.deadline, datetime) else parent.deadline
                    if deadline > parent_deadline:
                        return None, ({
                            "error": "Child deadline cannot be later than parent deadline",
                            "parent_deadline": parent_deadline.isoformat(),
                        }, 400)

            old_deadline = goal.deadline.date() if isinstance(goal.deadline, datetime) else goal.deadline
            goal.deadline = deadline
            if deadline and (not old_deadline or deadline < old_deadline):
                self._cascade_child_deadlines(goal, deadline)

        if 'name' in data and data['name'] is not None:
            goal.name = data['name']
        if 'description' in data and data['description'] is not None:
            goal.description = data['description']

        if 'targets' in data:
            self.sync_targets(self.db_session, goal, data['targets'] or [])
            goal.targets = None

        if 'completed_via_children' in data:
            goal.completed_via_children = data['completed_via_children']

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

        if allow_extended_fields:
            if 'relevance_statement' in data:
                goal.relevance_statement = data['relevance_statement']
            if 'inherit_parent_activities' in data:
                goal.inherit_parent_activities = data['inherit_parent_activities']
            if 'allow_manual_completion' in data:
                goal.allow_manual_completion = data['allow_manual_completion']
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
