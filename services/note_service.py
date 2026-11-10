from services.goal_note_read_model import filter_goal_notes, goal_note_load_options
from datetime import datetime, timezone
import logging
import uuid

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import selectinload

from models import ActivityDefinition, ActivityInstance, Goal, Note, Program, Session, activity_goal_associations, activity_instance_goal_associations, goal_activity_group_associations, validate_root_goal
from services.events import Event, Events, event_bus
from services.goal_review_content import normalize_review_data, review_content
from services.goal_review_rules import restart_review_cadence
from services.note_carry_forward import CarryForwardError, carried_notes_for_session, set_carry_forward
from services.note_contexts import validate_note_context
from services.note_ownership import count_owned_notes
from services.owned_entity_queries import get_owned_activity_instance, get_owned_session
from services.payload_normalizers import normalize_note_payload
from services.quota_service import QuotaService
from services.service_types import JsonDict, JsonList, ServiceResult
from services.serializers import derive_note_type, serialize_note_display
from services.session_runtime import is_quick_session
from services.media_service import MediaService
from services.note_display_context import attach_program_names
from services.note_feed import notes_heatmap, notes_page
from services.note_filter_spec import NoteFilterError
from services.storage_common import StorageError
from services.view_serializers import (
    serialize_activity_history_entry,
    serialize_note_with_session,
    serialize_previous_session_notes_group,
)

logger = logging.getLogger(__name__)


class NoteService:
    def __init__(self, db_session):
        self.db_session = db_session

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

    def count_owned_notes(self, root_id, current_user_id, *, session_id=None, goal_id=None,
                          activity_instance_id=None, program_id=None) -> ServiceResult[JsonDict]:
        """How many notes deleting one session, goal (with its subtree), activity instance or program would take."""
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error
        if sum(bool(value) for value in (session_id, goal_id, activity_instance_id, program_id)) != 1:
            return None, "Give one of session_id, goal_id, activity_instance_id or program_id", 400
        if session_id:
            session = get_owned_session(self.db_session, root_id, session_id)
            if not session:
                return None, "Session not found", 404
            targets = {
                'session_ids': [session.id],
                'instance_ids': [instance.id for instance in (session.activity_instances or [])],
            }
        elif activity_instance_id:
            if not get_owned_activity_instance(self.db_session, root_id, activity_instance_id):
                return None, "Activity instance not found", 404
            targets = {'instance_ids': [activity_instance_id]}
        elif program_id:
            if not self.db_session.query(Program.id).filter(Program.id == program_id, Program.root_id == root_id).first():
                return None, "Program not found", 404
            targets = {'program_ids': [program_id]}
        else:
            from services.goal_service import GoalService  # Goal services import notes; resolve lazily.
            goal = self.db_session.query(Goal).filter(
                Goal.id == goal_id, Goal.root_id == root_id, Goal.deleted_at.is_(None),
            ).first()
            if not goal:
                return None, "Goal not found", 404
            targets = {'goal_ids': GoalService(self.db_session).goal_subtree_ids(goal)}
        return {'count': count_owned_notes(self.db_session, root_id, **targets)}, None, 200

    def get_session_notes(self, root_id, session_id, current_user_id) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        notes = self.db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.session_id == session_id,
            Note.deleted_at.is_(None),
        ).options(
            *goal_note_load_options(),
        ).order_by(
            Note.created_at.desc(),
        ).all()
        return [serialize_note_display(note) for note in notes], None, 200

    def get_carried_notes(self, root_id, session_id, current_user_id) -> ServiceResult[JsonDict]:
        """Notes pinned to the next instance of this session's activities, and those it consumed."""
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error
        pending, delivered = carried_notes_for_session(self.db_session, root_id, session_id)
        return {
            'pending': [serialize_note_display(note) for note in pending],
            'delivered': [serialize_note_display(note) for note in delivered],
        }, None, 200

    def get_activity_instance_notes(self, root_id, instance_id, current_user_id) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        notes = self.db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.activity_instance_id == instance_id,
            Note.deleted_at.is_(None),
        ).options(
            *goal_note_load_options(),
        ).order_by(
            Note.created_at.desc(),
        ).all()
        return [serialize_note_display(note) for note in notes], None, 200

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
            *goal_note_load_options(),
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
            *goal_note_load_options(),
        )

        if exclude_session_id:
            query = query.filter(Note.session_id != exclude_session_id)

        notes = query.order_by(
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
                *goal_note_load_options(),
            ).order_by(
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

    def get_goal_notes(
        self,
        root_id,
        goal_id,
        current_user_id,
        include_descendants=False,
        include_goal_notes=True,
        include_activity_instance_notes=True,
        validated_root=None,
        preloaded_goal=None,
        preloaded_activity_definition_ids=None,
        preloaded_notes=None,
    ) -> ServiceResult[JsonList]:
        if validated_root is not None and (
            validated_root.id != root_id or validated_root.owner_id != current_user_id
        ):
            return None, "Fractal not found or access denied", 404
        if validated_root is None:
            _, error = self._validate_owned_root(root_id, current_user_id)
            if error:
                return None, *error

        goal = preloaded_goal or self.db_session.query(Goal).filter(
            Goal.id == goal_id, Goal.root_id == root_id, Goal.deleted_at.is_(None),
        ).first()
        if not goal:
            return None, "Goal not found", 404

        goal_ids = [goal_id]
        if include_descendants:
            goal_ids = self._collect_descendant_goal_ids(root_id, goal_id)

        context_types = []
        if include_goal_notes:
            context_types.append('goal')
        if include_activity_instance_notes:
            context_types.append('activity_instance')
        if not context_types:
            return [], None, 200

        note_scope_conditions = []
        if include_goal_notes:
            note_scope_conditions.append(and_(
                Note.context_type == 'goal',
                Note.goal_id.in_(goal_ids),
            ))
        if include_activity_instance_notes:
            activity_note_conditions = [
                and_(
                    Note.context_type == 'activity_instance',
                    Note.goal_id.in_(goal_ids),
                )
            ]
            activity_definition_ids = (
                preloaded_activity_definition_ids
                if preloaded_activity_definition_ids is not None and not include_descendants
                else self._collect_goal_activity_definition_ids(root_id, goal_ids)
            )
            # Ad hoc links from the session goal hierarchy carry their notes too.
            linked_instance_ids = select(activity_instance_goal_associations.c.activity_instance_id).join(
                Goal, Goal.id == activity_instance_goal_associations.c.goal_id,
            ).where(
                activity_instance_goal_associations.c.goal_id.in_(goal_ids),
                activity_instance_goal_associations.c.deleted_at.is_(None),
                Goal.root_id == root_id,
                Goal.deleted_at.is_(None),
            )
            activity_note_conditions.append(and_(
                Note.context_type == 'activity_instance',
                Note.activity_instance_id.in_(linked_instance_ids),
                Note.activity_instance.has(and_(
                    ActivityInstance.root_id == root_id,
                    ActivityInstance.deleted_at.is_(None),
                )),
            ))
            if activity_definition_ids:
                scoped_instance_ids = select(ActivityInstance.id).where(
                    ActivityInstance.root_id == root_id,
                    ActivityInstance.activity_definition_id.in_(activity_definition_ids),
                    ActivityInstance.deleted_at.is_(None),
                )
                activity_note_conditions.append(and_(
                    Note.context_type == 'activity_instance',
                    Note.activity_instance_id.in_(scoped_instance_ids),
                ))
            note_scope_conditions.append(or_(*activity_note_conditions))

        if preloaded_notes is not None:
            notes = filter_goal_notes(
                preloaded_notes, root_id, goal_ids,
                activity_definition_ids if include_activity_instance_notes else [],
                include_goal_notes, include_activity_instance_notes,
            )
        else:
            notes = self.db_session.query(Note).filter(
                Note.root_id == root_id,
                or_(*note_scope_conditions),
                Note.deleted_at.is_(None),
            ).options(
                *goal_note_load_options(),
            ).order_by(
                Note.created_at.desc(),
            ).all()
        return [serialize_note_display(note) for note in notes], None, 200

    def _collect_goal_activity_definition_ids(self, root_id, goal_ids):
        """Activity definitions associated directly or through groups to scoped goals."""
        if not goal_ids:
            return []

        direct_rows = self.db_session.execute(
            select(activity_goal_associations.c.activity_id).where(
                activity_goal_associations.c.goal_id.in_(goal_ids),
                activity_goal_associations.c.deleted_at.is_(None),
            )
        ).all()
        activity_ids = {activity_id for (activity_id,) in direct_rows}

        group_rows = self.db_session.execute(
            select(goal_activity_group_associations.c.activity_group_id).where(
                goal_activity_group_associations.c.goal_id.in_(goal_ids),
                goal_activity_group_associations.c.deleted_at.is_(None),
            )
        ).all()
        group_ids = {group_id for (group_id,) in group_rows}
        if group_ids:
            group_activity_rows = self.db_session.execute(
                select(ActivityDefinition.id).where(
                    ActivityDefinition.root_id == root_id,
                    ActivityDefinition.group_id.in_(group_ids),
                    ActivityDefinition.deleted_at.is_(None),
                )
            ).all()
            activity_ids.update(activity_id for (activity_id,) in group_activity_rows)

        return list(activity_ids)

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
        """Notes page feed; see services/note_feed.py for the filter semantics."""
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error
        try:
            return notes_page(self.db_session, root_id, filters or {}, page, page_size), None, 200
        except NoteFilterError as exc:
            self.db_session.rollback()
            return None, str(exc), 404 if exc.code == 'filter_not_found' else 400

    def get_notes_heatmap(self, root_id, current_user_id, filters=None) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error
        try:
            return notes_heatmap(self.db_session, root_id, filters or {}), None, 200
        except NoteFilterError as exc:
            self.db_session.rollback()
            return None, str(exc), 404 if exc.code == 'filter_not_found' else 400

    def create_note(
        self,
        root_id,
        current_user_id,
        data,
        *,
        commit=True,
        pending_events=None,
        agent_grant_id=None,
        agent_run_id=None,
    ) -> ServiceResult[JsonDict]:
        review_data = None
        if data.get('review_data') is not None:
            if data.get('note_kind') != 'goal_review':
                return None, "review_data is only valid on goal_review notes", 400
            review_data, review_error = normalize_review_data(data['review_data'])
            if review_data is None:
                return None, review_error or "Invalid review", 400
            data = {**data, 'content': review_content(review_data)}
        data = normalize_note_payload(data)
        if 'nano_goal_id' in data:
            return None, "nano_goal_id is no longer supported", 400
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error
        quota_service = QuotaService(self.db_session)
        _, quota_error, quota_status = quota_service.check_available(current_user_id, "notes")
        if quota_error:
            return None, quota_error, quota_status
        content = data.get('content', '')
        _, storage_error, storage_status = quota_service.check_storage_available(
            current_user_id, QuotaService._payload_size(content))
        if storage_error:
            return None, storage_error, storage_status

        session_id = data.get('session_id')
        activity_instance_id = data.get('activity_instance_id')
        goal_id = data.get('goal_id')
        activity_definition_id = data.get('activity_definition_id')
        context_type = data['context_type']
        context_id = data['context_id']
        note_kind = data.get('note_kind')

        if note_kind in ('goal_completion', 'goal_review') and context_type != 'goal':
            return None, f"{note_kind} notes must be attached to a goal", 400
        if data.get('activity_set_id') and context_type != 'activity_instance':
            return None, "activity_set_id is only valid for activity instance notes", 400

        context_payload, context_error = validate_note_context(
            self.db_session,
            root_id=root_id,
            context_type=context_type,
            context_id=context_id,
            session_id=session_id,
            activity_instance_id=activity_instance_id,
            activity_definition_id=activity_definition_id,
            goal_id=goal_id,
            calendar_date=data.get('calendar_date'),
        )
        if context_error:
            return None, *context_error
        program = (context_payload or {}).get('program')

        if not content:
            return None, "content is required", 400

        try:
            attachments = MediaService(self.db_session).validate_attachments(root_id, current_user_id, data.get('attachments', []))
        except StorageError as exc:
            return None, str(exc), exc.status

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
            activity_set_id = data.get('activity_set_id')
            if activity_set_id:
                from models import ActivitySet

                activity_set = self.db_session.query(ActivitySet).join(ActivityInstance).filter(
                    ActivityInstance.root_id == root_id,
                    ActivityInstance.deleted_at.is_(None),
                    ActivitySet.id == activity_set_id,
                ).first()
                if not activity_set:
                    return None, "Activity set not found", 404
                if activity_instance_id and activity_set.activity_instance_id != activity_instance_id:
                    return None, "Activity set does not belong to the selected activity instance", 400
                activity_set_id = activity_set.id
                activity_instance_id = activity_set.activity_instance_id

            note = Note(
                id=data.get('id') or str(uuid.uuid4()),
                root_id=root_id,
                context_type=context_type,
                context_id=context_id,
                session_id=session_id,
                activity_instance_id=activity_instance_id,
                activity_definition_id=activity_definition_id,
                goal_id=goal_id,
                activity_set_id=activity_set_id,
                content=content,
                note_kind=note_kind,
                review_data=review_data,
                program_id=program.id if program else None,
                calendar_date=(context_payload or {}).get('calendar_date'),
                agent_grant_id=agent_grant_id,
                agent_run_id=agent_run_id,
            )
            self.db_session.add(note)
            self.db_session.flush()
            MediaService(self.db_session).replace_attachments(note, attachments)
            restart_review_cadence(self.db_session, root_id, context_id, note_kind)

        self.db_session.flush()
        event = Event(
            Events.NOTE_CREATED,
            {
                'note_id': note.id,
                'note_content': note.content,
                'note_kind': note.note_kind,
                'context_type': note.context_type,
                'context_id': note.context_id,
                'root_id': root_id,
                'session_id': note.session_id,
                'activity_instance_id': note.activity_instance_id,
                'goal_id': note.goal_id,
            },
            source='note_service.create_note',
        )
        if commit:
            self.db_session.commit()
            event_bus.emit(event)
        elif pending_events is not None:
            pending_events.append(event)
        logger.info("Created note %s for %s %s", note.id, data['context_type'], note.context_id)
        return attach_program_names(self.db_session, serialize_note_display(note)), None, 201

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

        if data.get('review_data') is not None:
            if note.note_kind != 'goal_review':
                return None, "review_data is only valid on goal_review notes", 400
            review_data, review_error = normalize_review_data(data['review_data'])
            if review_data is None:
                return None, review_error or "Invalid review", 400
            note.review_data = review_data
            data = {**data, 'content': review_content(review_data)}

        attachments = data.get('attachments')
        if attachments is not None:
            try:
                MediaService(self.db_session).validate_attachments(root_id, current_user_id, attachments)
            except StorageError as exc:
                return None, str(exc), exc.status

        if 'content' in data:
            if not data['content']:
                return None, "content is required", 400
            size_delta = QuotaService._payload_size(data['content']) - QuotaService._payload_size(note.content)
            _, storage_error, storage_status = QuotaService(self.db_session).check_storage_available(
                current_user_id,
                max(0, size_delta),
            )
            if storage_error:
                return None, storage_error, storage_status
            note.content = data['content']

        if data.get('carry_forward') is not None:
            try:
                set_carry_forward(note, data['carry_forward'])
            except CarryForwardError as exc:
                self.db_session.rollback()
                return None, str(exc), exc.status

        if attachments is not None:
            MediaService(self.db_session).replace_attachments(note, attachments)
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
        return serialize_note_display(note), None, 200

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
