"""Fractal (root) list / create / delete / tree / selection.

Mixin for GoalService (audit P1-7). Instance methods; cross-method calls use
`self.<method>(...)` and resolve through the composed GoalService instance.
"""
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import selectinload

from models import Goal, GoalLevel, validate_root_goal
from validators.core import parse_date_string
from services.quota_service import QuotaService
from services.service_types import JsonDict, JsonList, ServiceResult
from services.view_serializers import serialize_fractal_summary, serialize_goal_selection_item
from services.serializers import serialize_goal
from services.events import Event, Events, event_bus
from services.template_service import seed_default_template
from services.user_service import UserService



class _GoalFractalsMixin:
    def list_fractals(self, current_user_id) -> ServiceResult[JsonList]:
        roots = self.db_session.query(Goal).options(
            selectinload(Goal.level),
            selectinload(Goal.targets_rel),
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups),
        ).filter(
            Goal.parent_id.is_(None),
            Goal.owner_id == current_user_id,
            Goal.deleted_at.is_(None),
        ).all()

        root_ids = [root.id for root in roots]
        last_activity_by_root = {}
        if root_ids:
            rows = self.db_session.query(
                Goal.root_id,
                func.max(Goal.updated_at),
            ).filter(
                Goal.root_id.in_(root_ids),
                Goal.deleted_at.is_(None),
            ).group_by(Goal.root_id).all()
            last_activity_by_root = {root_id: last_activity for root_id, last_activity in rows}

        level_maps_by_root = self._get_effective_level_maps_for_roots(
            current_user_id,
            root_ids,
        )
        fractals = []
        for root in roots:
            last_activity = last_activity_by_root.get(root.id) or root.updated_at
            level_name = root.level.name if getattr(root, 'level', None) else "Ultimate Goal"
            display_level = level_maps_by_root.get(root.id, {}).get(level_name)
            fractals.append(serialize_fractal_summary(root, last_activity, display_level=display_level))
        return fractals, None, 200

    def list_global_goals(self, current_user_id, limit=None, offset=0) -> ServiceResult[JsonList]:
        roots_q = self.db_session.query(Goal).filter(
            Goal.parent_id == None,
            Goal.deleted_at == None,
            Goal.owner_id == current_user_id,
        ).order_by(Goal.created_at.desc())
        if limit is not None:
            roots_q = roots_q.offset(offset).limit(limit)
        roots = roots_q.all()
        if not roots:
            return None, "No goals found", 404
        return [serialize_goal(root) for root in roots], None, 200

    def create_fractal(self, current_user_id, data) -> ServiceResult[Goal]:
        quota_service = QuotaService(self.db_session)
        for resource in ("fractals", "goals"):
            _, quota_error, quota_status = quota_service.check_available(current_user_id, resource)
            if quota_error:
                return None, quota_error, quota_status
        _, storage_error, storage_status = quota_service.check_storage_available(
            current_user_id,
            QuotaService._payload_size(data.get('name'), data.get('description'), data.get('relevance_statement')),
        )
        if storage_error:
            return None, storage_error, storage_status

        level_name_by_type = {
            "UltimateGoal": "Ultimate Goal",
            "LongTermGoal": "Long Term Goal",
            "MidTermGoal": "Mid Term Goal",
            "ShortTermGoal": "Short Term Goal",
        }
        selected_type = data.get('type') or "UltimateGoal"
        level_styles = data.get('level_styles') or {}
        scoped_levels = {}
        for goal_type, level_name in level_name_by_type.items():
            source = self.db_session.query(GoalLevel).filter_by(
                name=level_name, owner_id=current_user_id, root_id=None, deleted_at=None,
            ).first() or self.db_session.query(GoalLevel).filter_by(
                name=level_name, owner_id=None, deleted_at=None,
            ).first()
            if not source:
                source = GoalLevel(name=level_name, rank=list(level_name_by_type).index(goal_type))
                self.db_session.add(source)
                self.db_session.flush()

            if level_styles:
                style = level_styles[goal_type]
                scoped = GoalLevel(
                    name=source.name, rank=source.rank, color=style['color'],
                    secondary_color=style['secondary_color'], icon=style['icon'], owner_id=current_user_id,
                    allow_manual_completion=source.allow_manual_completion,
                    track_activities=source.track_activities, requires_smart=source.requires_smart,
                    deadline_min_value=source.deadline_min_value, deadline_min_unit=source.deadline_min_unit,
                    deadline_max_value=source.deadline_max_value, deadline_max_unit=source.deadline_max_unit,
                    max_children=source.max_children,
                    auto_complete_when_children_done=source.auto_complete_when_children_done,
                    can_have_targets=source.can_have_targets, description_required=source.description_required,
                    default_deadline_offset_value=source.default_deadline_offset_value,
                    default_deadline_offset_unit=source.default_deadline_offset_unit,
                    sort_children_by=source.sort_children_by,
                )
                self.db_session.add(scoped)
                scoped_levels[goal_type] = scoped
            else:
                scoped_levels[goal_type] = source
        self.db_session.flush()
        level = scoped_levels[selected_type]

        new_fractal = Goal(
            level_id=level.id,
            name=data['name'],
            description=data.get('description', ''),
            relevance_statement=data.get('relevance_statement'),
            deadline=parse_date_string(data['deadline']) if data.get('deadline') else None,
            parent_id=None,
            owner_id=current_user_id,
        )
        self.db_session.add(new_fractal)
        self.db_session.flush()
        # A fractal root scopes itself and every descendant. Assign this only
        # after flush because SQLAlchemy generates the root UUID at that point.
        new_fractal.root_id = new_fractal.id
        if level_styles:
            for scoped_level in scoped_levels.values():
                scoped_level.root_id = new_fractal.id
        UserService(self.db_session).initialize_onboarding_for_root(current_user_id, new_fractal.id)
        starter_template = seed_default_template(
            self.db_session,
            new_fractal.id,
            current_user_id,
        )
        self.db_session.commit()
        self.db_session.refresh(new_fractal)
        if starter_template is not None:
            event_bus.emit(Event(
                Events.SESSION_TEMPLATE_CREATED,
                {
                    'template_id': starter_template.id,
                    'name': starter_template.name,
                    'root_id': new_fractal.id,
                },
                source='goal_service.create_fractal',
            ))
        return new_fractal, None, 201

    def delete_fractal(self, root_id, current_user_id) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        deleted_at = datetime.now(timezone.utc)
        self._soft_delete_root_entities(root_id, deleted_at)
        self._soft_delete_goal_subtree(root, deleted_at)
        UserService(self.db_session).remove_onboarding_for_root(current_user_id, root_id)
        self.db_session.commit()
        return {"status": "success", "message": "Fractal deleted"}, None, 200

    def get_fractal_tree(self, root_id, current_user_id) -> ServiceResult[Goal]:
        root, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goals_by_id = self._load_fractal_goals_for_serialization(root_id)
        root = goals_by_id.get(root_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        return root, None, 200

    def get_active_goals_for_selection(self, root_id, current_user_id) -> ServiceResult[JsonList]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        st_goals = self.db_session.query(Goal).join(GoalLevel, Goal.level_id == GoalLevel.id).options(
            selectinload(Goal.children),
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups),
        ).filter(
            Goal.root_id == root_id,
            GoalLevel.name == 'Short Term Goal',
            Goal.completed.is_(False),
            Goal.deleted_at.is_(None),
        ).all()

        result = []
        for short_term_goal in st_goals:
            active_children = []
            for child in short_term_goal.children:
                is_immediate_goal = getattr(child, 'level', None) and child.level.name == 'Immediate Goal'
                if is_immediate_goal and not child.completed and not child.deleted_at:
                    active_children.append(child)

            result.append(serialize_goal_selection_item(short_term_goal, active_children))

        return result, None, 200
