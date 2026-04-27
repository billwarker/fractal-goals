from datetime import datetime, timezone
import logging
import uuid

from sqlalchemy import or_
from sqlalchemy.orm import selectinload

from models import (
    ActivityDefinition,
    ActivityInstance,
    Goal,
    Note,
    Program,
    Session,
    session_goals,
    validate_root_goal,
)
from services.events import Event, Events, event_bus
from services.goal_service import GoalService, sync_goal_targets
from services.owned_entity_queries import get_owned_activity_instance, get_owned_session
from services.payload_normalizers import normalize_note_payload
from services.service_types import JsonDict, JsonList, ServiceResult
from services.serializers import derive_note_type, serialize_goal, serialize_note_display
from services.session_runtime import is_quick_session
from services.view_serializers import (
    serialize_activity_history_entry,
    serialize_note_with_session,
    serialize_previous_session_notes_group,
)

logger = logging.getLogger(__name__)


class NoteService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _attach_program_names(self, notes_payload):
        notes = notes_payload if isinstance(notes_payload, list) else [notes_payload]
        program_ids = {
            note.get('context_id')
            for note in notes
            if note.get('context_type') == 'program' and note.get('context_id')
        }
        if not program_ids:
            return notes_payload

        programs = self.db_session.query(Program.id, Program.name).filter(
            Program.id.in_(program_ids),
        ).all()
        program_names = {program_id: name for program_id, name in programs}
        for note in notes:
            if note.get('context_type') == 'program':
                note['program_name'] = program_names.get(note.get('context_id'))
        return notes_payload

    def _resolve_note_session(self, root_id, session_id=None, activity_instance_id=None):
        if session_id:
            return get_owned_session(self.db_session, root_id, session_id)
        if activity_instance_id:
            instance = get_owned_activity_instance(self.db_session, root_id, activity_instance_id)
            if instance:
                return get_owned_session(self.db_session, root_id, instance.session_id)
        return None

    def _validate_owned_root(self, root_id, current_user_id) -> tuple[Goal | None, tuple[str, int] | None]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, ("Fractal not found or access denied", 404)
        return root, None

    def get_session_notes(self, root_id, session_id, current_user_id) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        notes = self.db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.session_id == session_id,
            Note.deleted_at.is_(None),
        ).options(
            selectinload(Note.session).selectinload(Session.template),
            selectinload(Note.goal),
            selectinload(Note.activity_definition),
        ).order_by(
            Note.pinned_at.desc().nullslast(),
            Note.created_at.desc(),
        ).all()
        return [serialize_note_display(note, include_image=True) for note in notes], None, 200

    def get_activity_instance_notes(self, root_id, instance_id, current_user_id) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        notes = self.db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.activity_instance_id == instance_id,
            Note.deleted_at.is_(None),
        ).options(
            selectinload(Note.session).selectinload(Session.template),
            selectinload(Note.goal),
            selectinload(Note.activity_definition),
        ).order_by(
            Note.pinned_at.desc().nullslast(),
            Note.created_at.desc(),
        ).all()
        return [serialize_note_display(note, include_image=True) for note in notes], None, 200

    def get_previous_session_notes(self, root_id, session_id, current_user_id) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        current_session = self.db_session.query(Session).filter(Session.id == session_id).first()
        if not current_session:
            return None, "Session not found", 404

        current_start = current_session.session_start or current_session.created_at
        sessions_with_notes = self.db_session.query(Note.session_id).filter(
            Note.root_id == root_id,
            Note.context_type == 'session',
            Note.deleted_at.is_(None),
        ).distinct()

        previous_sessions = self.db_session.query(Session).filter(
            Session.root_id == root_id,
            Session.id != session_id,
            Session.deleted_at.is_(None),
            Session.id.in_(sessions_with_notes),
            (Session.session_start < current_start) |
            ((Session.session_start.is_(None)) & (Session.created_at < current_start)),
        ).order_by(
            Session.session_start.desc().nullslast(),
            Session.created_at.desc(),
        ).limit(5).all()

        if not previous_sessions:
            return [], None, 200

        session_ids = [session.id for session in previous_sessions]
        notes = self.db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.session_id.in_(session_ids),
            Note.context_type == 'session',
            Note.deleted_at.is_(None),
        ).options(
            selectinload(Note.session).selectinload(Session.template),
            selectinload(Note.goal),
            selectinload(Note.activity_definition),
        ).order_by(Note.created_at.desc()).all()

        results = []
        for session in previous_sessions:
            session_notes = [note for note in notes if note.session_id == session.id]
            if session_notes:
                results.append(serialize_previous_session_notes_group(session, session_notes))

        return results, None, 200

    def get_activity_definition_notes(
        self, root_id, activity_id, current_user_id, limit=20, exclude_session_id=None
    ) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        query = self.db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.activity_definition_id == activity_id,
            Note.deleted_at.is_(None),
        ).options(
            selectinload(Note.session).selectinload(Session.template),
            selectinload(Note.goal),
            selectinload(Note.activity_definition),
        )

        if exclude_session_id:
            query = query.filter(Note.session_id != exclude_session_id)

        notes = query.order_by(
            Note.pinned_at.desc().nullslast(),
            Note.created_at.desc(),
        ).limit(limit).all()
        results = []
        for note in notes:
            results.append(serialize_note_with_session(note))

        return results, None, 200

    def get_activity_history(
        self, root_id, activity_id, current_user_id, limit=3, exclude_session_id=None
    ) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        query = self.db_session.query(ActivityInstance).join(
            Session,
            ActivityInstance.session_id == Session.id,
        ).filter(
            ActivityInstance.root_id == root_id,
            ActivityInstance.activity_definition_id == activity_id,
            ActivityInstance.deleted_at.is_(None),
            Session.deleted_at.is_(None),
        )

        if exclude_session_id:
            query = query.filter(ActivityInstance.session_id != exclude_session_id)

        instances = query.options(
            selectinload(ActivityInstance.session).selectinload(Session.template),
        ).order_by(ActivityInstance.created_at.desc()).limit(limit).all()
        instance_ids = [instance.id for instance in instances]
        notes = []

        if instance_ids:
            notes = self.db_session.query(Note).filter(
                Note.activity_instance_id.in_(instance_ids),
                Note.deleted_at.is_(None),
            ).options(
                selectinload(Note.session).selectinload(Session.template),
                selectinload(Note.goal),
                selectinload(Note.activity_definition),
            ).order_by(
                Note.pinned_at.desc().nullslast(),
                Note.created_at.desc(),
            ).all()

        results = []
        for instance in instances:
            instance_notes = [
                note for note in notes
                if note.activity_instance_id == instance.id
            ] if instance_ids else []
            results.append(serialize_activity_history_entry(instance, instance_notes))

        return results, None, 200

    def _validate_note_context(
        self,
        *,
        root_id,
        context_type,
        context_id,
        session_id,
        activity_instance_id,
        activity_definition_id,
        goal_id,
    ) -> tuple[JsonDict | None, tuple[str, int] | None]:
        activity = None
        if activity_definition_id:
            activity = self.db_session.query(ActivityDefinition).filter(
                ActivityDefinition.id == activity_definition_id,
                ActivityDefinition.root_id == root_id,
                ActivityDefinition.deleted_at.is_(None),
            ).first()
            if not activity:
                return None, ("Activity definition not found in this fractal", 400)

        if context_type == 'root':
            if context_id != root_id:
                return None, ("root notes must use the fractal root id as context_id", 400)
            if session_id or activity_instance_id or goal_id or activity_definition_id:
                return None, ("root notes cannot be linked to a goal, session, or activity", 400)
            return {'activity_definition': activity}, None

        if context_type == 'goal':
            if not goal_id or context_id != goal_id:
                return None, ("goal notes require matching context_id and goal_id", 400)
            linked_goal = self.db_session.query(Goal).filter(
                Goal.id == goal_id,
                Goal.root_id == root_id,
                Goal.deleted_at.is_(None),
            ).first()
            if not linked_goal:
                return None, ("Goal not found in this fractal", 400)
            if session_id or activity_instance_id:
                return None, ("goal notes cannot be linked directly to a session or activity instance", 400)
            return {'goal': linked_goal, 'activity_definition': activity}, None

        if context_type == 'session':
            if not session_id or context_id != session_id:
                return None, ("session notes require matching context_id and session_id", 400)
            session_obj = self.db_session.query(Session).filter(
                Session.id == session_id,
                Session.root_id == root_id,
                Session.deleted_at.is_(None),
            ).first()
            if not session_obj:
                return None, ("Session not found in this fractal", 400)
            if activity_instance_id:
                return None, ("session notes cannot include activity_instance_id", 400)
            return {'session': session_obj, 'activity_definition': activity}, None

        if context_type == 'program':
            if not context_id:
                return None, ("program notes require a context_id", 400)
            program = self.db_session.query(Program).filter(
                Program.id == context_id,
                Program.root_id == root_id,
            ).first()
            if not program:
                return None, ("Program not found in this fractal", 400)
            if session_id or activity_instance_id or goal_id or activity_definition_id:
                return None, ("program notes cannot be linked to a goal, session, or activity", 400)
            return {'program': program}, None

        if context_type == 'activity_instance':
            if not activity_instance_id or context_id != activity_instance_id:
                return None, ("activity instance notes require matching context_id and activity_instance_id", 400)
            instance = self.db_session.query(ActivityInstance).filter(
                ActivityInstance.id == activity_instance_id,
                ActivityInstance.root_id == root_id,
                ActivityInstance.deleted_at.is_(None),
            ).first()
            if not instance:
                return None, ("Activity instance not found in this fractal", 400)
            if session_id and instance.session_id != session_id:
                return None, ("Activity instance does not belong to the provided session", 400)
            if activity and instance.activity_definition_id and instance.activity_definition_id != activity.id:
                return None, ("activity_definition_id does not match the activity instance", 400)
            return {'session': None, 'activity_definition': activity, 'activity_instance': instance}, None

        if context_type == 'activity_definition':
            if not activity_definition_id or context_id != activity_definition_id:
                return None, ("activity definition notes require matching context_id and activity_definition_id", 400)
            if session_id or activity_instance_id or goal_id:
                return None, ("activity definition notes cannot also target a session, instance, or goal", 400)
            return {'activity_definition': activity}, None

        return None, ("Unsupported note context_type", 400)

    def get_goal_notes(
        self, root_id, goal_id, current_user_id, include_descendants=False
    ) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).filter(
            Goal.id == goal_id,
            Goal.root_id == root_id,
            Goal.deleted_at.is_(None),
        ).first()
        if not goal:
            return None, "Goal not found", 404

        goal_ids = [goal_id]
        if include_descendants:
            goal_ids = self._collect_descendant_goal_ids(root_id, goal_id)

        notes = self.db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.goal_id.in_(goal_ids),
            Note.deleted_at.is_(None),
        ).options(
            selectinload(Note.session).selectinload(Session.template),
            selectinload(Note.goal),
            selectinload(Note.activity_definition),
        ).order_by(
            Note.pinned_at.desc().nullslast(),
            Note.created_at.desc(),
        ).all()
        return [serialize_note_display(note, include_image=True) for note in notes], None, 200

    def _collect_descendant_goal_ids(self, root_id, goal_id):
        """BFS to collect all descendant goal IDs including the given goal_id."""
        from collections import deque
        result = [goal_id]
        queue = deque([goal_id])
        while queue:
            parent_id = queue.popleft()
            children = self.db_session.query(Goal.id).filter(
                Goal.parent_id == parent_id,
                Goal.root_id == root_id,
                Goal.deleted_at.is_(None),
            ).all()
            for (child_id,) in children:
                result.append(child_id)
                queue.append(child_id)
        return result

    def get_all_notes(
        self, root_id, current_user_id, filters=None, page=0, page_size=25
    ) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        filters = filters or {}
        query = self.db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.deleted_at.is_(None),
        ).options(
            selectinload(Note.session).selectinload(Session.template),
            selectinload(Note.goal),
            selectinload(Note.activity_definition),
        )

        note_types = filters.get('note_types') or []
        context_types = filters.get('context_types')
        if context_types:
            query = query.filter(Note.context_type.in_(context_types))

        context_id = filters.get('context_id')
        if context_id:
            query = query.filter(Note.context_id == context_id)

        filter_goal_id = filters.get('goal_id')
        if filter_goal_id:
            query = query.filter(Note.goal_id == filter_goal_id)

        filter_activity_definition_ids = filters.get('activity_definition_ids') or []
        filter_activity_group_ids = filters.get('activity_group_ids') or []

        if filter_activity_definition_ids or filter_activity_group_ids:
            from models.activity import ActivityDefinition
            conditions = []
            if filter_activity_definition_ids:
                conditions.append(Note.activity_definition_id.in_(filter_activity_definition_ids))
            if filter_activity_group_ids:
                group_act_ids = self.db_session.query(ActivityDefinition.id).filter(
                    ActivityDefinition.group_id.in_(filter_activity_group_ids),
                    ActivityDefinition.deleted_at.is_(None),
                ).all()
                group_act_ids = [r[0] for r in group_act_ids]
                if group_act_ids:
                    conditions.append(Note.activity_definition_id.in_(group_act_ids))
            if conditions:
                query = query.filter(or_(*conditions))

        if filters.get('pinned_only'):
            query = query.filter(Note.pinned_at.isnot(None))

        search = filters.get('search', '').strip()
        if search:
            query = query.filter(Note.content.ilike(f'%{search}%'))

        date_from = filters.get('date_from')
        if date_from:
            query = query.filter(Note.created_at >= date_from)

        date_to = filters.get('date_to')
        if date_to:
            query = query.filter(Note.created_at <= date_to)

        if note_types:
            ordered_notes = query.order_by(
                Note.pinned_at.desc().nullslast(),
                Note.created_at.desc(),
            ).all()
            serialized_notes = [
                serialize_note_display(note, include_image=True)
                for note in ordered_notes
            ]
            filtered_results = [
                note
                for note in serialized_notes
                if note.get('note_type') in note_types
            ]
            total = len(filtered_results)
            start_index = page * page_size
            results = filtered_results[start_index:start_index + page_size]
            self._attach_program_names(results)
        else:
            total = query.count()
            notes = query.order_by(
                Note.pinned_at.desc().nullslast(),
                Note.created_at.desc(),
            ).limit(page_size).offset(page * page_size).all()
            results = [serialize_note_display(note, include_image=True) for note in notes]
            self._attach_program_names(results)

        return {
            'notes': results,
            'total': total,
            'page': page,
            'page_size': page_size,
            'has_more': (page + 1) * page_size < total,
        }, None, 200

    def pin_note(self, root_id, note_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        note = self.db_session.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at.is_(None),
        ).first()
        if not note:
            return None, "Note not found", 404

        if derive_note_type(note.context_type, note.set_index) == 'activity_set_note':
            return None, "Activity set notes cannot be pinned", 400

        note.pinned_at = datetime.now(timezone.utc)
        self.db_session.commit()
        logger.info("Pinned note %s", note_id)
        return serialize_note_display(note, include_image=True), None, 200

    def unpin_note(self, root_id, note_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        note = self.db_session.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at.is_(None),
        ).first()
        if not note:
            return None, "Note not found", 404

        note.pinned_at = None
        self.db_session.commit()
        logger.info("Unpinned note %s", note_id)
        return serialize_note_display(note, include_image=True), None, 200

    def create_note(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        data = normalize_note_payload(data)
        if 'nano_goal_id' in data:
            return None, "nano_goal_id is no longer supported", 400
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error
        content = data.get('content', '')

        session_id = data.get('session_id')
        activity_instance_id = data.get('activity_instance_id')
        goal_id = data.get('goal_id')
        activity_definition_id = data.get('activity_definition_id')
        context_type = data['context_type']
        context_id = data['context_id']

        context_payload, context_error = self._validate_note_context(
            root_id=root_id,
            context_type=context_type,
            context_id=context_id,
            session_id=session_id,
            activity_instance_id=activity_instance_id,
            activity_definition_id=activity_definition_id,
            goal_id=goal_id,
        )
        if context_error:
            return None, *context_error

        if not content:
            return None, "content is required", 400

        activity_instance = (context_payload or {}).get('activity_instance')
        if activity_instance:
            if not session_id:
                session_id = activity_instance.session_id
            if not activity_definition_id:
                activity_definition_id = activity_instance.activity_definition_id

        note_session = self._resolve_note_session(
            root_id,
            session_id=session_id,
            activity_instance_id=activity_instance_id,
        )
        if note_session and is_quick_session(note_session):
            return None, "Quick sessions do not support notes", 400

        with self.db_session.begin_nested():
            note = Note(
                id=str(uuid.uuid4()),
                root_id=root_id,
                context_type=context_type,
                context_id=context_id,
                session_id=session_id,
                activity_instance_id=activity_instance_id,
                activity_definition_id=activity_definition_id,
                goal_id=goal_id,
                set_index=data.get('set_index'),
                content=content,
            )
            self.db_session.add(note)

        self.db_session.commit()
        logger.info("Created note %s for %s %s", note.id, data['context_type'], note.context_id)
        event_bus.emit(Event(
            Events.NOTE_CREATED,
            {
                'note_id': note.id,
                'note_content': note.content,
                'context_type': note.context_type,
                'context_id': note.context_id,
                'root_id': root_id,
                'session_id': note.session_id,
                'activity_instance_id': note.activity_instance_id,
                'goal_id': note.goal_id,
            },
            source='note_service.create_note',
        ))
        return self._attach_program_names(serialize_note_display(note, include_image=True)), None, 201

    def update_note(self, root_id, note_id, current_user_id, data) -> ServiceResult[JsonDict]:
        data = normalize_note_payload(data, partial=True)
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        note = self.db_session.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at.is_(None),
        ).first()
        if not note:
            return None, "Note not found", 404

        if 'content' in data:
            if not data['content']:
                return None, "content is required", 400
            note.content = data['content']

        if 'pin' in data:
            if data['pin']:
                note.pinned_at = datetime.now(timezone.utc)
            else:
                note.pinned_at = None

        self.db_session.commit()
        logger.info("Updated note %s", note_id)
        event_bus.emit(Event(
            Events.NOTE_UPDATED,
            {
                'note_id': note.id,
                'note_content': note.content,
                'context_type': note.context_type,
                'context_id': note.context_id,
                'root_id': root_id,
                'session_id': note.session_id,
                'activity_instance_id': note.activity_instance_id,
                'updated_fields': list(data.keys()),
            },
            source='note_service.update_note',
        ))
        return serialize_note_display(note, include_image=True), None, 200

    def delete_note(self, root_id, note_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        note = self.db_session.query(Note).filter(
            Note.id == note_id,
            Note.root_id == root_id,
            Note.deleted_at.is_(None),
        ).first()
        if not note:
            return None, "Note not found", 404

        note_content = note.content
        context_type = note.context_type
        context_id = note.context_id
        session_id = note.session_id
        activity_instance_id = note.activity_instance_id
        note.deleted_at = datetime.now(timezone.utc)
        self.db_session.commit()
        logger.info("Deleted note %s", note_id)
        event_bus.emit(Event(
            Events.NOTE_DELETED,
            {
                'note_id': note_id,
                'note_content': note_content,
                'context_type': context_type,
                'context_id': context_id,
                'root_id': root_id,
                'session_id': session_id,
                'activity_instance_id': activity_instance_id,
            },
            source='note_service.delete_note',
        ))
        return {"success": True}, None, 200
