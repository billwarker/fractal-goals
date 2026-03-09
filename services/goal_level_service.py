from datetime import datetime, timezone

from models import GoalLevel
from services.service_types import JsonList, JsonDict, ServiceResult


class GoalLevelService:
    def __init__(self, db_session):
        self.db_session = db_session

    def list_goal_levels(self, current_user_id, *, root_id=None) -> ServiceResult[JsonList]:
        system_levels = self.db_session.query(GoalLevel).filter_by(owner_id=None, deleted_at=None).all()
        user_global_levels = self.db_session.query(GoalLevel).filter(
            GoalLevel.owner_id == current_user_id,
            GoalLevel.root_id == None,
            GoalLevel.deleted_at == None,
        ).all()

        root_levels = []
        if root_id:
            root_levels = self.db_session.query(GoalLevel).filter(
                GoalLevel.owner_id == current_user_id,
                GoalLevel.root_id == root_id,
                GoalLevel.deleted_at == None,
            ).all()

        level_map = {}
        for level in system_levels:
            level_map[level.name] = level
        for level in user_global_levels:
            level_map[level.name] = level
        for level in root_levels:
            level_map[level.name] = level

        merged_levels = list(level_map.values())
        merged_levels.sort(key=lambda level: level.rank)
        return merged_levels, None, 200

    def update_goal_level(self, level_id, current_user_id, data) -> ServiceResult[GoalLevel]:
        level = self.db_session.query(GoalLevel).filter_by(id=level_id, deleted_at=None).first()
        if not level:
            return None, "Goal level not found", 404
        if level.owner_id and level.owner_id != current_user_id:
            return None, "Permission denied", 403

        req_root_id = data.get('root_id')
        needs_clone = False
        if level.owner_id is None:
            needs_clone = True
        elif level.owner_id == current_user_id and req_root_id and level.root_id != req_root_id:
            needs_clone = True

        if needs_clone:
            existing_user_clone_q = self.db_session.query(GoalLevel).filter_by(
                owner_id=current_user_id,
                name=level.name,
                deleted_at=None,
            )
            if req_root_id:
                existing_user_clone = existing_user_clone_q.filter_by(root_id=req_root_id).first()
            else:
                existing_user_clone = existing_user_clone_q.filter(GoalLevel.root_id == None).first()

            if existing_user_clone:
                level = existing_user_clone
            else:
                level = GoalLevel(
                    name=level.name,
                    rank=level.rank,
                    color=level.color,
                    secondary_color=getattr(level, 'secondary_color', None),
                    icon=level.icon,
                    owner_id=current_user_id,
                    root_id=req_root_id,
                    allow_manual_completion=level.allow_manual_completion,
                    track_activities=level.track_activities,
                    requires_smart=getattr(level, 'requires_smart', False),
                    deadline_min_value=level.deadline_min_value,
                    deadline_min_unit=level.deadline_min_unit,
                    deadline_max_value=level.deadline_max_value,
                    deadline_max_unit=level.deadline_max_unit,
                    max_children=level.max_children,
                    auto_complete_when_children_done=level.auto_complete_when_children_done,
                    can_have_targets=level.can_have_targets,
                    description_required=level.description_required,
                    default_deadline_offset_value=level.default_deadline_offset_value,
                    default_deadline_offset_unit=level.default_deadline_offset_unit,
                    sort_children_by=level.sort_children_by,
                )
                self.db_session.add(level)
                self.db_session.flush()

        scalar_fields = (
            'color',
            'secondary_color',
            'icon',
            'deadline_min_unit',
            'deadline_max_unit',
            'default_deadline_offset_unit',
            'sort_children_by',
        )
        bool_fields = (
            'allow_manual_completion',
            'track_activities',
            'requires_smart',
            'auto_complete_when_children_done',
            'can_have_targets',
            'description_required',
        )
        int_fields = (
            'deadline_min_value',
            'deadline_max_value',
            'max_children',
            'default_deadline_offset_value',
        )

        for field in scalar_fields:
            if field in data:
                setattr(level, field, data[field])
        for field in bool_fields:
            if field in data:
                setattr(level, field, bool(data[field]))
        for field in int_fields:
            if field in data:
                setattr(level, field, int(data[field]) if data[field] is not None else None)

        self.db_session.commit()
        self.db_session.refresh(level)
        return level, None, 200

    def reset_goal_level(self, level_id, current_user_id) -> ServiceResult[JsonDict]:
        level = self.db_session.query(GoalLevel).filter_by(id=level_id, owner_id=current_user_id).first()
        if not level:
            return None, "Custom goal level not found or permission denied", 404

        system_default = self.db_session.query(GoalLevel).filter_by(
            name=level.name,
            owner_id=None,
            deleted_at=None,
        ).first()
        if system_default:
            from models.goal import Goal

            user_goals = self.db_session.query(Goal).filter_by(owner_id=current_user_id, level_id=level.id).all()
            for goal in user_goals:
                goal.level_id = system_default.id

        level.deleted_at = datetime.now(timezone.utc)
        self.db_session.commit()
        return {"status": "success", "message": "Goal level reset to system default"}, None, 200
