import logging

from sqlalchemy import func, inspect, text
from sqlalchemy.orm import selectinload, with_loader_criteria
from models import (
    ActivityDefinition, ActivityGroup, ActivityInstance,
    Goal, Target,
    MetricValue, ProgramBlock, ProgramDay, Session,
    validate_root_goal
)
import models
from services.owned_entity_queries import get_owned_session
from services.service_types import JsonDict, ServiceResult
from services.serializers import serialize_session
from services.session_template_stats_service import SessionTemplateStatsService
from services.session_filters import (
    SessionFilterService,
)
from services.session_activity_service import SessionActivityService
from services.session_analytics_service import SessionAnalyticsService
from services.session_lifecycle_service import SessionLifecycleService
from services.session_structure import extract_activity_definition_id
logger = logging.getLogger(__name__)

def _program_goal_ids(db_session, program_id) -> set[str]:
    if not program_id:
        return set()
    return set(
        db_session.execute(
            text("SELECT goal_id FROM program_goals WHERE program_id = :program_id"),
            {'program_id': program_id}
        ).scalars().all()
    )

class SessionService:
    def __init__(self, db_session):
        self.db_session = db_session
        self._session_goals_has_source = None
        self._session_filters = SessionFilterService(
            db_session,
            effective_timestamp_factory=self._effective_session_timestamp,
            effective_activity_goals_resolver=self._get_effective_activity_goals,
        )

    def _analytics_service(self) -> SessionAnalyticsService:
        return SessionAnalyticsService(
            self.db_session,
            session_filters=self._session_filters,
            effective_activity_goals_resolver=self._get_effective_activity_goals,
        )

    def _session_activity_service(self) -> SessionActivityService:
        return SessionActivityService(self.db_session)

    def _session_lifecycle_service(self) -> SessionLifecycleService:
        return SessionLifecycleService(
            self.db_session,
            session_read_options_factory=self._session_read_options,
            derived_goals_resolver=self._derive_session_goals_from_activities,
        )

    @staticmethod
    def _extract_activity_definition_id(raw_item) -> str | None:
        return extract_activity_definition_id(raw_item)

    def _session_goals_supports_source(self) -> bool:
        if self._session_goals_has_source is None:
            cols = inspect(self.db_session.bind).get_columns('session_goals')
            self._session_goals_has_source = any(c.get('name') == 'association_source' for c in cols)
        return self._session_goals_has_source

    def _session_goal_insert_values(self, session_id, goal_id, goal_type, association_source) -> JsonDict:
        values = {
            'session_id': session_id,
            'goal_id': goal_id,
            'goal_type': goal_type,
        }
        if self._session_goals_supports_source():
            values['association_source'] = association_source
        return values

    @staticmethod
    def _session_read_options():
        return (
            selectinload(Session.goals).selectinload(Goal.level),
            selectinload(Session.goals).selectinload(Goal.targets_rel).selectinload(Target.metric_conditions),
            selectinload(Session.template),
            selectinload(Session.notes_list),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.definition).selectinload(ActivityDefinition.group),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.metric_values).selectinload(MetricValue.definition),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.metric_values).selectinload(MetricValue.split),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.progress_record),
            selectinload(Session.program_day).selectinload(ProgramDay.block).selectinload(ProgramBlock.program),
            with_loader_criteria(ActivityInstance, ActivityInstance.deleted_at == None, include_aliases=True),
        )

    def _get_effective_activity_goals(self, root_id, activity_def_ids) -> dict[str, list[Goal]]:
        """Resolve direct and group-inherited goals for each activity definition."""
        if not activity_def_ids:
            return {}

        activities = self.db_session.query(ActivityDefinition).options(
            selectinload(ActivityDefinition.associated_goals).selectinload(Goal.pause_intervals)
        ).filter(
            ActivityDefinition.id.in_(activity_def_ids),
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at == None
        ).all()

        groups_by_id = {
            group.id: group
            for group in self.db_session.query(ActivityGroup).options(
                selectinload(ActivityGroup.associated_goals).selectinload(Goal.pause_intervals)
            ).filter(
                ActivityGroup.root_id == root_id,
                ActivityGroup.deleted_at == None
            ).all()
        }

        effective_goals_by_activity = {}
        for activity in activities:
            seen_goal_ids = set()
            effective_goals = []

            def append_goal(goal):
                if not goal or goal.deleted_at or goal.root_id != root_id:
                    return
                if goal.id in seen_goal_ids:
                    return
                seen_goal_ids.add(goal.id)
                effective_goals.append(goal)

            for goal in activity.associated_goals or []:
                append_goal(goal)

            seen_group_ids = set()
            current_group_id = activity.group_id
            while current_group_id and current_group_id not in seen_group_ids:
                seen_group_ids.add(current_group_id)
                group = groups_by_id.get(current_group_id)
                if not group:
                    break

                for goal in group.associated_goals or []:
                    append_goal(goal)

                current_group_id = group.parent_id

            effective_goals_by_activity[activity.id] = effective_goals

        return effective_goals_by_activity

    def _derive_session_goals_from_activities(self, session_obj) -> list[Goal]:
        """Derive display goals from session activities when persisted links are missing."""
        activity_def_ids = set()

        # Prefer persisted instances
        for inst in (session_obj.activity_instances or []):
            if inst.activity_definition_id:
                activity_def_ids.add(inst.activity_definition_id)

        # Fallback to session attributes
        attrs = models._safe_load_json(getattr(session_obj, 'attributes', None), {})
        for section in attrs.get('sections', []):
            for exercise in section.get('exercises', []):
                if exercise.get('activity_id'):
                    activity_def_ids.add(exercise.get('activity_id'))

        if not activity_def_ids:
            return []
        activity_goals = self._get_effective_activity_goals(session_obj.root_id, activity_def_ids)

        # Program scoping applies only when program has selected goals.
        program_goal_ids = set()
        if getattr(session_obj, 'program_day', None) and session_obj.program_day.block and session_obj.program_day.block.program:
            program_goal_ids = _program_goal_ids(self.db_session, session_obj.program_day.block.program.id)

        derived = {}
        for goals in activity_goals.values():
            for goal in goals:
                if goal.deleted_at or goal.completed:
                    continue
                if goal.root_id != session_obj.root_id:
                    continue
                if program_goal_ids and goal.id not in program_goal_ids:
                    continue
                derived[goal.id] = goal

        return list(derived.values())

    @staticmethod
    def _timestamp_within_session(timestamp, session_obj) -> bool:
        if not timestamp or not session_obj.session_start or not session_obj.session_end:
            return False
        return session_obj.session_start <= timestamp <= session_obj.session_end

    def _attach_completed_goals(self, sessions: list[Session]) -> None:
        """Attach canonical completed-in-session goals for session serialization."""
        session_ids = [session.id for session in sessions if session]
        if not session_ids:
            return

        completed_goals_by_session_id: dict[str, dict[str, Goal]] = {
            session_id: {}
            for session_id in session_ids
        }

        direct_completed_goals = self.db_session.query(Goal).options(
            selectinload(Goal.level),
            selectinload(Goal.targets_rel).selectinload(Target.metric_conditions),
        ).filter(
            Goal.completed_session_id.in_(session_ids),
            Goal.deleted_at == None,
        ).all()
        for goal in direct_completed_goals:
            session_id = goal.completed_session_id
            if session_id in completed_goals_by_session_id:
                completed_goals_by_session_id[session_id][goal.id] = goal

        target_completed_rows = self.db_session.query(
            Target.completed_session_id,
            Goal,
        ).join(
            Goal,
            Goal.id == Target.goal_id,
        ).options(
            selectinload(Goal.level),
            selectinload(Goal.targets_rel).selectinload(Target.metric_conditions),
        ).filter(
            Target.completed_session_id.in_(session_ids),
            Target.deleted_at == None,
            Goal.deleted_at == None,
        ).all()
        for session_id, goal in target_completed_rows:
            if session_id in completed_goals_by_session_id:
                completed_goals_by_session_id[session_id][goal.id] = goal

        for session_obj in sessions:
            goals_by_id = completed_goals_by_session_id.get(session_obj.id, {})
            for goal in (session_obj.goals or []):
                if goal.deleted_at or not goal.completed:
                    continue
                if self._timestamp_within_session(goal.completed_at, session_obj):
                    goals_by_id[goal.id] = goal
            session_obj._completed_goals = list(goals_by_id.values())

    @staticmethod
    def _effective_session_timestamp():
        return func.coalesce(Session.session_start, Session.created_at)

    def get_fractal_sessions(self, root_id, current_user_id, limit=10, offset=0, filters=None) -> ServiceResult[JsonDict]:
        """Get sessions for a specific fractal."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
             return None, "Fractal not found or access denied", 404

        normalized_filters, error, status = self._session_filters.normalize_filters(filters)
        if error:
            return None, error, status

        base_query = self.db_session.query(Session).filter(
            Session.root_id == root_id,
            Session.deleted_at == None,
        )
        filtered_query = self._session_filters.apply_filters(base_query, root_id, normalized_filters)
        total_count = filtered_query.count()

        sessions = filtered_query.options(
            *self._session_read_options(),
        ).order_by(*self._session_filters.build_ordering(normalized_filters)).offset(offset).limit(limit).all()

        self._attach_completed_goals(sessions)
        result = [serialize_session(s) for s in sessions]

        return {
            "sessions": result,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total": total_count,
                "has_more": offset + len(result) < total_count
            }
        }, None, 200

    def get_session_analytics_summary(self, root_id, current_user_id, limit=50) -> ServiceResult[JsonDict]:
        return self._analytics_service().get_session_analytics_summary(root_id, current_user_id, limit=limit)

    def get_session_heatmap(self, root_id, current_user_id, filters=None) -> ServiceResult[JsonDict]:
        return self._analytics_service().get_session_heatmap(root_id, current_user_id, filters=filters)

    def get_activity_instantiation_summary(self, root_id, current_user_id) -> ServiceResult[JsonDict]:
        return self._analytics_service().get_activity_instantiation_summary(root_id, current_user_id)

    def get_recent_evidence_goal_ids(self, root_id, current_user_id, days=None) -> ServiceResult[JsonDict]:
        return self._analytics_service().get_recent_evidence_goal_ids(root_id, current_user_id, days=days)

    def get_flowtree_session_metrics(self, root_id, current_user_id, goal_ids=None, days=None) -> ServiceResult[JsonDict]:
        return self._analytics_service().get_flowtree_session_metrics(
            root_id,
            current_user_id,
            goal_ids=goal_ids,
            days=days,
        )

    def get_all_sessions(self, current_user_id, limit=None, offset=0) -> ServiceResult[list[JsonDict]]:
        """Get all sessions across fractals for the current user."""
        sessions_q = self.db_session.query(Session).join(
            Goal,
            Goal.id == Session.root_id,
        ).options(
            *self._session_read_options(),
        ).filter(
            Session.deleted_at == None,
            Goal.parent_id == None,
            Goal.owner_id == current_user_id,
            Goal.deleted_at == None,
        ).order_by(Session.created_at.desc())

        if limit is not None:
            sessions_q = sessions_q.offset(offset).limit(limit)

        sessions = sessions_q.all()
        self._attach_completed_goals(sessions)
        return [serialize_session(s) for s in sessions], None, 200

    def get_session_details(self, root_id, session_id, current_user_id) -> ServiceResult[JsonDict]:
        """Get a single session with full details."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = self.db_session.query(Session).options(
            *self._session_read_options(),
        ).filter(Session.id == session_id, Session.root_id == root_id, Session.deleted_at == None).first()
        
        if not session:
            return None, "Session not found", 404

        self._attach_completed_goals([session])

        # Backward-compatible fallback for sessions created without persisted links.
        if not session.goals:
            derived_goals = self._derive_session_goals_from_activities(session)
            if derived_goals:
                session._derived_goals = derived_goals

        stats_service = SessionTemplateStatsService(self.db_session)
        if session.template_id:
            session._template_stats = (
                stats_service.persisted_stats_for_templates(root_id, [session.template_id]).get(session.template_id)
                or stats_service.recompute_template_stats(root_id, session.template_id)
                or {}
            )
        activity_definition_ids = [
            instance.activity_definition_id
            for instance in (session.activity_instances or [])
            if instance.activity_definition_id
        ]
        session._activity_duration_stats = stats_service.persisted_activity_duration_stats(
            root_id,
            activity_definition_ids,
        )
        missing_activity_ids = [
            activity_id
            for activity_id in activity_definition_ids
            if activity_id not in session._activity_duration_stats
        ]
        if missing_activity_ids:
            session._activity_duration_stats.update(
                stats_service.recompute_activity_stats(root_id, missing_activity_ids)
            )
            self.db_session.commit()

        return serialize_session(session), None, 200

    def get_session_activities(self, root_id, session_id, current_user_id) -> ServiceResult[list[JsonDict]]:
        return self._session_activity_service().get_session_activities(root_id, session_id, current_user_id)

    def add_activity_to_session(self, root_id, session_id, current_user_id, data) -> ServiceResult[JsonDict]:
        return self._session_activity_service().add_activity_to_session(root_id, session_id, current_user_id, data)

    def reorder_activities(self, root_id, session_id, current_user_id, activity_ids) -> ServiceResult[JsonDict]:
        return self._session_activity_service().reorder_activities(root_id, session_id, current_user_id, activity_ids)

    def update_activity_instance(self, root_id, session_id, instance_id, current_user_id, data) -> ServiceResult[JsonDict]:
        return self._session_activity_service().update_activity_instance(
            root_id,
            session_id,
            instance_id,
            current_user_id,
            data,
        )

    def remove_activity_from_session(self, root_id, session_id, instance_id, current_user_id) -> ServiceResult[JsonDict]:
        return self._session_activity_service().remove_activity_from_session(
            root_id,
            session_id,
            instance_id,
            current_user_id,
        )

    def update_activity_metrics(self, root_id, session_id, instance_id, current_user_id, metric_data_list) -> ServiceResult[JsonDict]:
        return self._session_activity_service().update_activity_metrics(
            root_id,
            session_id,
            instance_id,
            current_user_id,
            metric_data_list,
        )

    def duplicate_session(self, root_id, session_id, current_user_id) -> ServiceResult[JsonDict]:
        return self._session_lifecycle_service().duplicate_session(root_id, session_id, current_user_id)

    def get_active_session(self, root_id, current_user_id) -> ServiceResult[JsonDict]:
        return self._session_lifecycle_service().get_active_session(root_id, current_user_id)

    def create_session(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        return self._session_lifecycle_service().create_session(root_id, current_user_id, data)

    def create_completed_quick_session(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        return self._session_lifecycle_service().create_completed_quick_session(root_id, current_user_id, data)

    def update_session(
        self,
        root_id,
        session_id,
        current_user_id,
        data,
        *,
        complete_unstarted_instances=True,
    ) -> ServiceResult[JsonDict]:
        return self._session_lifecycle_service().update_session(
            root_id,
            session_id,
            current_user_id,
            data,
            complete_unstarted_instances=complete_unstarted_instances,
        )

    def delete_session(self, root_id, session_id, current_user_id) -> ServiceResult[JsonDict]:
        return self._session_lifecycle_service().delete_session(root_id, session_id, current_user_id)
