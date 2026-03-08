from datetime import datetime, timezone
import logging
import uuid

from models import (
    ActivityDefinition,
    ActivityInstance,
    Goal,
    Note,
    Session,
    session_goals,
    validate_root_goal,
)
from services.payload_normalizers import normalize_note_payload
from services.goal_type_utils import get_canonical_goal_type
from services.service_types import JsonDict, JsonList, ServiceResult
from services.serializers import serialize_note
from services.view_serializers import (
    serialize_activity_history_entry,
    serialize_note_with_session,
    serialize_previous_session_notes_group,
)

logger = logging.getLogger(__name__)


class NoteService:
    def __init__(self, db_session):
        self.db_session = db_session

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
        ).order_by(Note.created_at.desc()).all()
        return [serialize_note(note) for note in notes], None, 200

    def get_activity_instance_notes(self, root_id, instance_id, current_user_id) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        notes = self.db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.activity_instance_id == instance_id,
            Note.deleted_at.is_(None),
        ).order_by(Note.created_at.desc()).all()
        return [serialize_note(note) for note in notes], None, 200

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
        )

        if exclude_session_id:
            query = query.filter(Note.session_id != exclude_session_id)

        notes = query.order_by(Note.created_at.desc()).limit(limit).all()
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

        query = self.db_session.query(ActivityInstance).filter(
            ActivityInstance.root_id == root_id,
            ActivityInstance.activity_definition_id == activity_id,
            ActivityInstance.deleted_at.is_(None),
        )

        if exclude_session_id:
            query = query.filter(ActivityInstance.session_id != exclude_session_id)

        instances = query.order_by(ActivityInstance.created_at.desc()).limit(limit).all()
        instance_ids = [instance.id for instance in instances]
        notes = []

        if instance_ids:
            notes = self.db_session.query(Note).filter(
                Note.activity_instance_id.in_(instance_ids),
                Note.deleted_at.is_(None),
            ).order_by(Note.created_at).all()

        results = []
        for instance in instances:
            instance_notes = [
                note for note in notes
                if note.activity_instance_id == instance.id
            ] if instance_ids else []
            results.append(serialize_activity_history_entry(instance, instance_notes))

        return results, None, 200

    def _validate_note_creation_relations(self, root_id, session_id, nano_goal_id, activity_instance_id):
        if session_id:
            session_obj = self.db_session.query(Session).filter(
                Session.id == session_id,
                Session.root_id == root_id,
                Session.deleted_at.is_(None),
            ).first()
            if not session_obj:
                return "Session not found in this fractal", 400

        if not nano_goal_id:
            return None

        nano_goal = self.db_session.query(Goal).filter(
            Goal.id == nano_goal_id,
            Goal.root_id == root_id,
            Goal.deleted_at.is_(None),
        ).first()
        if not nano_goal:
            return "Nano goal not found in this fractal", 400
        if get_canonical_goal_type(nano_goal) != 'NanoGoal':
            return "nano_goal_id must reference a NanoGoal", 400

        if not session_id:
            return None

        if activity_instance_id:
            instance = self.db_session.query(ActivityInstance).filter(
                ActivityInstance.id == activity_instance_id,
                ActivityInstance.root_id == root_id,
                ActivityInstance.deleted_at.is_(None),
            ).first()
            if not instance:
                return "Activity instance not found in this fractal", 400
            if instance.session_id != session_id:
                return "Activity instance does not belong to the provided session", 400

        ancestor_ids = []
        current = nano_goal
        while current and current.parent_id:
            ancestor_ids.append(current.parent_id)
            current = self.db_session.query(Goal).filter(Goal.id == current.parent_id).first()

        has_session_link = False
        if ancestor_ids:
            has_session_link = self.db_session.query(session_goals).filter(
                session_goals.c.session_id == session_id,
                session_goals.c.goal_id.in_(ancestor_ids),
            ).first() is not None

        if not has_session_link and not activity_instance_id:
            return "nano_goal_id is not linked to the provided session", 400

        return None

    def create_note(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        data = normalize_note_payload(data)
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error
        content = data.get('content', '')
        image_data = data.get('image_data')

        session_id = data.get('session_id')
        nano_goal_id = data.get('nano_goal_id')
        activity_instance_id = data.get('activity_instance_id')

        relation_error = self._validate_note_creation_relations(
            root_id,
            session_id,
            nano_goal_id,
            activity_instance_id,
        )
        if relation_error:
            return None, *relation_error

        with self.db_session.begin_nested():
            note = Note(
                id=str(uuid.uuid4()),
                root_id=root_id,
                context_type=data['context_type'],
                context_id=data['context_id'],
                session_id=session_id,
                activity_instance_id=activity_instance_id,
                activity_definition_id=data.get('activity_definition_id'),
                set_index=data.get('set_index'),
                content=content,
                image_data=image_data,
                nano_goal_id=nano_goal_id,
            )
            self.db_session.add(note)

        self.db_session.commit()
        logger.info("Created note %s for %s %s", note.id, data['context_type'], note.context_id)
        return serialize_note(note), None, 201

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
            note.content = data['content']

        self.db_session.commit()
        logger.info("Updated note %s", note_id)
        return serialize_note(note), None, 200

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

        note.deleted_at = datetime.now(timezone.utc)
        self.db_session.commit()
        logger.info("Deleted note %s", note_id)
        return {"success": True}, None, 200
