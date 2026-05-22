from datetime import datetime, timezone

from sqlalchemy.orm import selectinload

from models import Goal, GoalLevel, validate_root_goal
from services.goal_type_utils import get_canonical_goal_type
from services.service_types import ServiceResult


class GoalWorkflowService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _validate_owned_root(self, root_id, current_user_id) -> tuple[Goal | None, tuple[str, int] | None]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, ("Fractal not found or access denied", 404)
        return root, None

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
        if not parent_goal or not new_level_obj:
            return None

        new_rank = getattr(new_level_obj, 'rank', None)
        if new_rank is None:
            return None

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

        chain.reverse()

        for i in range(len(chain) - 1):
            name_a, rank_a = chain[i]
            name_b, rank_b = chain[i + 1]
            if rank_a is not None and rank_b is not None and rank_a >= rank_b:
                return (
                    f"Hierarchy path is not valid: '{name_a}' (rank {rank_a}) "
                    f"is not above '{name_b}' (rank {rank_b})"
                )

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

    def _validate_parent_capacity(self, parent_goal, *, error_prefix) -> str | None:
        if not parent_goal:
            return None

        level = getattr(parent_goal, 'level', None)
        max_children = getattr(level, 'max_children', None) if level else None
        if max_children is None:
            return None

        active_children = [
            child for child in (parent_goal.children or [])
            if child.deleted_at is None
        ]
        if len(active_children) >= max_children:
            return f"{error_prefix} allows at most {max_children} child goals"

        return None

    def toggle_pause(self, root_id, goal_id, current_user_id, paused: bool) -> ServiceResult[Goal]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).filter_by(
            id=goal_id, root_id=root_id, deleted_at=None,
        ).first()
        if not goal:
            return None, "Goal not found", 404

        goal.frozen = paused
        goal.frozen_at = datetime.now(timezone.utc) if paused else None
        self.db_session.commit()
        self.db_session.refresh(goal)
        return goal, None, 200

    def toggle_freeze(self, root_id, goal_id, current_user_id, frozen: bool) -> ServiceResult[Goal]:
        return self.toggle_pause(root_id, goal_id, current_user_id, frozen)

    def move_goal(self, root_id, goal_id, current_user_id, new_parent_id) -> ServiceResult[Goal]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).options(
            selectinload(Goal.level),
        ).filter_by(id=goal_id, root_id=root_id, deleted_at=None).first()
        if not goal:
            return None, "Goal not found", 404

        if goal.parent_id is None:
            return None, "Root goals cannot be moved", 400

        if not new_parent_id:
            return None, "Move goal requires selecting a new parent", 400

        if new_parent_id == goal_id:
            return None, "A goal cannot be its own parent", 400

        current_parent = self.db_session.query(Goal).options(
            selectinload(Goal.level),
        ).filter_by(id=goal.parent_id, root_id=root_id, deleted_at=None).first()
        if not current_parent:
            return None, "Current parent goal not found in this fractal", 400

        if new_parent_id == current_parent.id:
            return goal, None, 200

        new_parent = self.db_session.query(Goal).options(
            selectinload(Goal.level),
        ).filter_by(id=new_parent_id, root_id=root_id, deleted_at=None).first()
        if not new_parent:
            return None, "New parent goal not found in this fractal", 404

        current = new_parent
        while current.parent_id:
            if current.parent_id == goal_id:
                return None, "Cannot move goal under one of its own descendants", 400
            current = self.db_session.query(Goal).filter_by(id=current.parent_id).first()
            if not current:
                break

        if goal.level:
            mono_error = self._validate_ancestor_rank_monotonicity(goal.level, new_parent)
            if mono_error:
                return None, mono_error, 400

        capacity_error = self._validate_parent_capacity(
            new_parent,
            error_prefix="Cannot move goal: Parent level",
        )
        if capacity_error:
            return None, capacity_error, 400

        goal.parent_id = new_parent_id
        self.db_session.commit()
        self.db_session.refresh(goal)
        return goal, None, 200

    def get_eligible_move_parents(self, root_id, goal_id, current_user_id, search=None):
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).options(
            selectinload(Goal.level),
        ).filter_by(id=goal_id, deleted_at=None).first()
        if not goal or goal.root_id != root_id:
            return None, "Goal not found", 404

        all_goals = self.db_session.query(Goal).options(
            selectinload(Goal.level),
        ).filter_by(root_id=root_id, deleted_at=None).all()

        children_map = {}
        for g in all_goals:
            if g.parent_id:
                children_map.setdefault(g.parent_id, []).append(g.id)

        descendant_ids = set()
        queue = [goal_id]
        while queue:
            current = queue.pop()
            for child_id in children_map.get(current, []):
                descendant_ids.add(child_id)
                queue.append(child_id)

        current_parent = next((candidate for candidate in all_goals if candidate.id == goal.parent_id), None)

        eligible = []
        for candidate in all_goals:
            if candidate.id == goal_id:
                continue
            if candidate.id in descendant_ids:
                continue
            if not candidate.level:
                continue

            if current_parent and not self._goals_share_same_tier(candidate, current_parent):
                continue
            if not goal.level or candidate.level.rank >= goal.level.rank:
                continue
            error = self._validate_ancestor_rank_monotonicity(goal.level, candidate)
            if error:
                continue

            if search and search.lower() not in candidate.name.lower():
                continue

            eligible.append({
                'id': candidate.id,
                'name': candidate.name,
                'level_name': candidate.level.name if candidate.level else None,
                'level_rank': candidate.level.rank if candidate.level else None,
                'parent_id': candidate.parent_id,
                'is_current_parent': candidate.id == goal.parent_id,
            })

        eligible.sort(key=lambda x: (x['level_rank'] or 99, x['name']))
        return eligible, None, 200

    def convert_goal_level(self, root_id, goal_id, current_user_id, level_id) -> ServiceResult[Goal]:
        root, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).options(
            selectinload(Goal.level),
            selectinload(Goal.children),
        ).filter_by(id=goal_id, root_id=root_id, deleted_at=None).first()
        if not goal:
            return None, "Goal not found", 404

        new_level = self.db_session.query(GoalLevel).filter_by(id=level_id).first()
        if not new_level:
            return None, "Goal level not found", 404

        execution_tier_names = {'Immediate Goal'}
        current_level_name = getattr(goal.level, 'name', None)
        if current_level_name in execution_tier_names:
            return None, f"Cannot convert an execution-tier goal ('{current_level_name}')", 400

        root_level_rank = self._get_goal_level_rank(root)
        if root_level_rank is not None and new_level.rank <= root_level_rank:
            return None, "Cannot convert a goal to the fractal root level", 400

        if goal.parent_id:
            parent = self.db_session.query(Goal).options(
                selectinload(Goal.level),
            ).filter_by(id=goal.parent_id).first()
            if parent and parent.level and new_level.rank <= parent.level.rank:
                return None, f"New level '{new_level.name}' must be below parent level '{parent.level.name}'", 400

        for child in (goal.children or []):
            if child.deleted_at:
                continue
            child_level = child.level or self.db_session.query(GoalLevel).filter_by(id=child.level_id).first()
            if child_level and new_level.rank >= child_level.rank:
                return None, f"New level '{new_level.name}' must be above child level '{child_level.name}'", 400

        goal.level_id = level_id
        self.db_session.commit()
        self.db_session.refresh(goal)
        return goal, None, 200
