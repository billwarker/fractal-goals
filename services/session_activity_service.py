import copy
import uuid

from sqlalchemy import inspect, text
from sqlalchemy.orm import joinedload
from sqlalchemy.orm.attributes import flag_modified

import models
from models import (
    ActivityDefinition,
    ActivityInstance,
    Goal,
    MetricDefinition,
    MetricValue,
    Session,
    session_goals,
    validate_root_goal,
)
from services import Event, Events, event_bus
from services.goal_type_utils import get_canonical_goal_type
from services.owned_entity_queries import (
    get_owned_activity_definition,
    get_owned_activity_instance,
    get_owned_session,
)
from services.quota_service import QuotaService
from services.serializers import serialize_activity_instance
from services.service_types import JsonDict, ServiceResult
from services.session_runtime import is_quick_session
from services.session_template_stats_service import SessionTemplateStatsService


class SessionActivityService:
    def __init__(self, db_session):
        self.db_session = db_session
        self._session_goals_has_source = None

    @staticmethod
    def _session_runtime_data(session):
        attrs = models._safe_load_json(getattr(session, 'attributes', None), {})
        if not isinstance(attrs, dict):
            attrs = {}
        if isinstance(attrs.get('session_data'), dict):
            return attrs, attrs['session_data']
        return attrs, attrs

    @classmethod
    def _append_instance_to_session_section(cls, session, instance_id, section_index=None):
        attrs, session_data = cls._session_runtime_data(session)
        raw_sections = session_data.get('sections')
        sections = copy.deepcopy(raw_sections) if isinstance(raw_sections, list) else []

        target_index = 0 if section_index is None else section_index
        if not isinstance(target_index, int) or target_index < 0:
            return "section_index must be a non-negative integer"

        if not sections:
            if target_index != 0:
                return "section_index out of range"
            sections = [{'name': 'Main', 'activity_ids': []}]
        elif target_index >= len(sections):
            return "section_index out of range"

        section = sections[target_index] if isinstance(sections[target_index], dict) else {}
        activity_ids = section.get('activity_ids') if isinstance(section.get('activity_ids'), list) else []
        next_activity_ids = [item for item in activity_ids if item != instance_id]
        next_activity_ids.append(instance_id)
        section['activity_ids'] = next_activity_ids
        sections[target_index] = section

        session_data['sections'] = sections
        session.attributes = attrs
        flag_modified(session, "attributes")
        return None

    @classmethod
    def _remove_instance_from_session_sections(cls, session, instance_id):
        attrs, session_data = cls._session_runtime_data(session)
        raw_sections = session_data.get('sections')
        if not isinstance(raw_sections, list):
            return

        next_sections = []
        changed = False
        for raw_section in raw_sections:
            if not isinstance(raw_section, dict):
                next_sections.append(raw_section)
                continue
            section = copy.deepcopy(raw_section)
            activity_ids = section.get('activity_ids')
            if isinstance(activity_ids, list) and instance_id in activity_ids:
                section['activity_ids'] = [item for item in activity_ids if item != instance_id]
                changed = True
            next_sections.append(section)

        if changed:
            session_data['sections'] = next_sections
            session.attributes = attrs
            flag_modified(session, "attributes")

    @staticmethod
    def _session_activity_read_options():
        return (
            joinedload(ActivityInstance.definition).joinedload(ActivityDefinition.group),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.definition),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.split),
        )

    @staticmethod
    def _quick_session_structure_error(session):
        if is_quick_session(session):
            return "Quick session structure is fixed by the template", 400
        return None

    def _recompute_and_attach_stats(self, session):
        if not session:
            return
        stats_service = SessionTemplateStatsService(self.db_session)
        computed = stats_service.recompute_for_session(session)
        session._template_stats = computed.get("template") or {}
        session._activity_duration_stats = computed.get("activity_durations") or {}
        self.db_session.commit()

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

    def get_session_activities(self, root_id, session_id, current_user_id) -> ServiceResult[list[JsonDict]]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404

        instances = self.db_session.query(ActivityInstance).options(
            *self._session_activity_read_options(),
        ).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.deleted_at == None,
        ).order_by(ActivityInstance.created_at).all()

        return [serialize_activity_instance(inst) for inst in instances], None, 200

    def add_activity_to_session(self, root_id, session_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404
        quick_error = self._quick_session_structure_error(session)
        if quick_error:
            return None, *quick_error

        activity_definition_id = data.get('activity_definition_id')
        if not activity_definition_id:
            return None, "activity_definition_id required", 400

        activity_def = get_owned_activity_definition(self.db_session, root_id, activity_definition_id)
        if not activity_def:
            return None, "Activity definition not found in this fractal", 404

        quota_service = QuotaService(self.db_session)
        _, quota_error, quota_status = quota_service.check_available(
            current_user_id,
            "activity_instances",
        )
        if quota_error:
            return None, quota_error, quota_status
        _, storage_error, storage_status = quota_service.check_storage_available(
            current_user_id,
            QuotaService._payload_size(data.get('instance_id'), activity_definition_id) or 64,
        )
        if storage_error:
            return None, storage_error, storage_status

        instance = ActivityInstance(
            id=data.get('instance_id') or str(uuid.uuid4()),
            session_id=session_id,
            activity_definition_id=activity_definition_id,
            root_id=root_id,
        )
        self.db_session.add(instance)
        self.db_session.flush()

        section_error = self._append_instance_to_session_section(
            session,
            instance.id,
            data.get('section_index'),
        )
        if section_error:
            self.db_session.rollback()
            return None, section_error, 400

        associated_goals = [goal for goal in (activity_def.associated_goals or []) if not goal.deleted_at]
        program_goal_ids = set()
        if session.program_day_id:
            raw_program_goals = self.db_session.execute(
                text(
                    "SELECT goal_id FROM program_days "
                    "JOIN program_blocks ON program_blocks.id = program_days.block_id "
                    "JOIN programs ON programs.id = program_blocks.program_id "
                    "JOIN program_goals ON program_goals.program_id = programs.id "
                    "WHERE program_days.id = :day_id AND programs.root_id = :root_id"
                ),
                {"day_id": session.program_day_id, "root_id": root_id},
            ).scalars().all()
            program_goal_ids = set(raw_program_goals)

        for goal in associated_goals:
            if goal.root_id != root_id:
                continue
            if program_goal_ids and goal.id not in program_goal_ids:
                continue
            existing = self.db_session.execute(
                text("SELECT 1 FROM session_goals WHERE session_id = :session_id AND goal_id = :goal_id LIMIT 1"),
                {"session_id": session_id, "goal_id": goal.id},
            ).first()
            if existing:
                continue
            self.db_session.execute(
                session_goals.insert().values(
                    **self._session_goal_insert_values(
                        session_id,
                        goal.id,
                        get_canonical_goal_type(goal),
                        'activity',
                    )
                )
            )

        self.db_session.commit()
        self.db_session.refresh(instance)
        activity_name = activity_def.name if activity_def else 'Unknown'
        event_bus.emit(Event(
            Events.ACTIVITY_INSTANCE_CREATED,
            {
                'instance_id': instance.id,
                'activity_definition_id': instance.activity_definition_id,
                'activity_name': activity_name,
                'session_id': session_id,
                'root_id': root_id,
            },
            source='session_service.add_activity_to_session',
        ))
        return {
            "instance": instance,
            "activity_name": activity_name,
        }, None, 201

    def reorder_activities(self, root_id, session_id, current_user_id, activity_ids) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404
        quick_error = self._quick_session_structure_error(session)
        if quick_error:
            return None, *quick_error

        for idx, instance_id in enumerate(activity_ids):
            instance = self.db_session.query(ActivityInstance).filter_by(
                id=instance_id,
                session_id=session_id,
                deleted_at=None,
            ).first()
            if instance:
                instance.sort_order = idx

        self.db_session.commit()
        return {"status": "success"}, None, 200

    def update_activity_instance(self, root_id, session_id, instance_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404

        instance = get_owned_activity_instance(
            self.db_session,
            root_id,
            instance_id,
            session_id=session_id,
            query_options=(joinedload(ActivityInstance.definition),),
        )
        if not instance:
            return None, "Instance not found", 404

        if 'notes' in data:
            instance.notes = data['notes']
        if 'completed' in data:
            instance.completed = data.get('completed')
        self.db_session.commit()
        self._recompute_and_attach_stats(session)
        self.db_session.refresh(instance)
        event_bus.emit(Event(
            Events.ACTIVITY_INSTANCE_UPDATED,
            {
                'instance_id': instance.id,
                'activity_definition_id': instance.activity_definition_id,
                'activity_name': instance.definition.name if instance.definition else 'Unknown',
                'session_id': session_id,
                'root_id': root_id,
                'updated_fields': list(data.keys()),
            },
            source='session_service.update_activity_instance',
            context={'db_session': self.db_session},
        ))
        return {
            "instance": instance,
            "activity_name": instance.definition.name if instance.definition else 'Unknown',
        }, None, 200

    def remove_activity_from_session(self, root_id, session_id, instance_id, current_user_id) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404
        quick_error = self._quick_session_structure_error(session)
        if quick_error:
            return None, *quick_error

        instance = get_owned_activity_instance(
            self.db_session,
            root_id,
            instance_id,
            session_id=session_id,
            query_options=(joinedload(ActivityInstance.definition),),
        )
        if not instance:
            return None, "Activity instance not found", 404

        instance.deleted_at = models.utc_now()
        self._remove_instance_from_session_sections(session, instance_id)
        self.db_session.commit()
        self._recompute_and_attach_stats(session)
        event_bus.emit(Event(
            Events.ACTIVITY_INSTANCE_DELETED,
            {
                'instance_id': instance_id,
                'activity_definition_id': instance.activity_definition_id,
                'activity_name': instance.definition.name if instance.definition else 'Unknown',
                'session_id': session_id,
                'root_id': root_id,
            },
            source='session_service.remove_activity_from_session',
            context={'db_session': self.db_session},
        ))
        return {
            "instance": instance,
            "activity_name": instance.definition.name if instance.definition else 'Unknown',
        }, None, 200

    def update_activity_metrics(self, root_id, session_id, instance_id, current_user_id, metric_data_list) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404

        instance = get_owned_activity_instance(
            self.db_session,
            root_id,
            instance_id,
            session_id=session_id,
            query_options=(joinedload(ActivityInstance.definition),),
        )
        if not instance:
            return None, "Instance not found", 404

        valid_metric_ids = {
            metric_id
            for (metric_id,) in self.db_session.query(MetricDefinition.id).filter_by(
                activity_id=instance.activity_definition_id
            ).all()
        }
        for metric_data in metric_data_list:
            metric_id = metric_data.get('metric_id')
            if metric_id not in valid_metric_ids:
                return None, {
                    "error": "Invalid metric_id",
                    "details": f"Metric {metric_id} does not belong to activity {instance.activity_definition_id}",
                }, 400

        existing_metrics = self.db_session.query(MetricValue).filter_by(
            activity_instance_id=instance_id
        ).all()
        existing_dict = {(metric.metric_definition_id, metric.split_definition_id): metric for metric in existing_metrics}
        updated_keys = set()

        for metric_data in metric_data_list:
            metric_id = metric_data.get('metric_id')
            split_id = metric_data.get('split_id')
            value = metric_data.get('value')
            key = (metric_id, split_id)
            updated_keys.add(key)

            if key in existing_dict:
                existing_dict[key].value = value
            else:
                self.db_session.add(MetricValue(
                    activity_instance_id=instance_id,
                    metric_definition_id=metric_id,
                    split_definition_id=split_id,
                    value=value,
                ))

        for key, existing_metric in existing_dict.items():
            if key not in updated_keys:
                self.db_session.delete(existing_metric)

        self.db_session.commit()
        self.db_session.refresh(instance)
        event_bus.emit(Event(
            Events.ACTIVITY_METRICS_UPDATED,
            {
                'instance_id': instance.id,
                'activity_definition_id': instance.activity_definition_id,
                'activity_name': instance.definition.name if instance.definition else 'Unknown',
                'session_id': session_id,
                'root_id': root_id,
                'updated_fields': ['metrics'],
            },
            source='session_service.update_activity_metrics',
            context={'db_session': self.db_session},
        ))
        return {
            "instance": instance,
            "activity_name": instance.definition.name if instance.definition else 'Unknown',
            "serialized": serialize_activity_instance(instance),
        }, None, 200
