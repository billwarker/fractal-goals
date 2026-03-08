import logging
from sqlalchemy.orm import selectinload
from sqlalchemy import select, or_

import models
from models import Goal, Session, session_goals, ActivityDefinition, get_session
from services.serializers import serialize_goal
from services.goal_type_utils import get_canonical_goal_type
from services.view_serializers import serialize_session_goals_view_payload

logger = logging.getLogger(__name__)

class GoalTreeService:
    def __init__(self, db_session):
        self.db_session = db_session

    @staticmethod
    def _collect_goal_ids_with_ancestors(goal_ids, goals_by_id):
        collected = set()
        for goal_id in goal_ids:
            current = goals_by_id.get(goal_id)
            while current:
                if current.id in collected:
                    break
                collected.add(current.id)
                current = goals_by_id.get(current.parent_id)
        return collected

    @staticmethod
    def _prune_tree_to_goal_ids(serialized_node, allowed_ids):
        if not serialized_node:
            return None

        kept_children = []
        for child in serialized_node.get('children', []) or []:
            pruned_child = GoalTreeService._prune_tree_to_goal_ids(child, allowed_ids)
            if pruned_child:
                kept_children.append(pruned_child)

        if serialized_node.get('id') in allowed_ids or kept_children:
            next_node = dict(serialized_node)
            next_node['children'] = kept_children
            return next_node

        return None

    def get_session_goals_view_payload(self, current_user, root_id, session_id):
        from services.session_service import SessionService
        from blueprints.api_utils import require_owned_root
        
        root = self.db_session.query(Goal).options(
            selectinload(Goal.children),
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups)
        ).filter(
            Goal.id == root_id,
            Goal.parent_id == None,
            Goal.owner_id == current_user.id,
            Goal.deleted_at == None
        ).first()
        
        if not root:
            root = require_owned_root(self.db_session, root_id, current_user.id)
            if not root:
                return None, {"error": "Fractal not found or access denied"}, 404

        session_obj = self.db_session.query(Session).options(
            selectinload(Session.goals),
            selectinload(Session.activity_instances)
        ).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()
        
        if not session_obj:
            return None, {"error": "Session not found in this fractal"}, 404

        root_tree = serialize_goal(root)

        goals_by_id = {
            goal.id: goal
            for goal in self.db_session.query(Goal).filter(
                Goal.root_id == root_id,
                Goal.deleted_at == None
            ).all()
        }

        session_service = SessionService(self.db_session)
        session_goal_select = select(session_goals.c.goal_id)
        includes_source = session_service._session_goals_supports_source()
        if includes_source:
            session_goal_select = select(session_goals.c.goal_id, session_goals.c.association_source)
        session_goals_rows = self.db_session.execute(
            session_goal_select.where(session_goals.c.session_id == session_id)
        ).all()
        session_goal_ids = [row.goal_id for row in session_goals_rows]
        session_goal_sources = {
            row.goal_id: (getattr(row, 'association_source', None) if includes_source else None) or 'manual'
            for row in session_goals_rows
        }

        if not session_goal_ids:
            derived_goals = session_service._derive_session_goals_from_activities(session_obj)
            session_goal_ids = [goal.id for goal in derived_goals]
            session_goal_sources = {goal.id: 'activity-derived' for goal in derived_goals}

        session_activity_instances = list(session_obj.activity_instances or [])
        session_activity_ids = sorted({
            inst.activity_definition_id
            for inst in session_activity_instances
            if inst.activity_definition_id
        })

        activity_goal_ids_by_activity = {}
        if session_activity_ids:
            activity_defs = self.db_session.query(ActivityDefinition).options(
                selectinload(ActivityDefinition.associated_goals)
            ).filter(
                ActivityDefinition.id.in_(session_activity_ids),
                ActivityDefinition.root_id == root_id,
                ActivityDefinition.deleted_at == None
            ).all()
            for activity_def in activity_defs:
                activity_goal_ids_by_activity[activity_def.id] = [
                    goal.id for goal in (activity_def.associated_goals or [])
                    if not goal.deleted_at and goal.root_id == root_id
                ]

        associated_goal_ids = {
            goal_id
            for goal_ids in activity_goal_ids_by_activity.values()
            for goal_id in goal_ids
        }
        structural_goal_ids = {
            goal_id for goal_id in (set(session_goal_ids) | associated_goal_ids)
            if goal_id in goals_by_id and get_canonical_goal_type(goals_by_id[goal_id]) not in {'MicroGoal', 'NanoGoal'}
        }
        visible_goal_ids = self._collect_goal_ids_with_ancestors(
            set(session_goal_ids) | associated_goal_ids,
            goals_by_id
        )
        visible_goal_ids = {
            goal_id for goal_id in visible_goal_ids
            if goal_id == root_id or (
                goal_id in goals_by_id and get_canonical_goal_type(goals_by_id[goal_id]) not in {'MicroGoal', 'NanoGoal'}
            )
        }
        visible_goal_ids |= self._collect_goal_ids_with_ancestors(structural_goal_ids, goals_by_id)
        visible_goal_ids.add(root_id)
        pruned_goal_tree = self._prune_tree_to_goal_ids(root_tree, visible_goal_ids) or root_tree

        micro_stmt = (
            select(Goal)
            .join(session_goals, Goal.id == session_goals.c.goal_id)
            .outerjoin(models.GoalLevel, Goal.level_id == models.GoalLevel.id)
            .where(session_goals.c.session_id == session_id)
            .where(Goal.root_id == root_id)
            .where(
                or_(
                    models.GoalLevel.name == 'Micro Goal',
                    session_goals.c.goal_type == 'MicroGoal'
                )
            )
            .options(selectinload(Goal.children))
        )
        micro_goals = self.db_session.execute(micro_stmt).scalars().all()

        payload = serialize_session_goals_view_payload(
            goal_tree=pruned_goal_tree,
            session_goal_ids=session_goal_ids,
            session_goal_sources=session_goal_sources,
            session_activity_ids=session_activity_ids,
            activity_goal_ids_by_activity=activity_goal_ids_by_activity,
            micro_goals=micro_goals,
        )
        
        return payload, None, 200
