import json
import uuid

import models

from blueprints.api_utils import require_owned_root
from models import Session, SessionTemplate
from sqlalchemy.orm import selectinload, with_loader_criteria
from services.events import Event, Events, event_bus
from services.owned_entity_queries import get_owned_session_template
from services.session_runtime import is_quick_session
from services.session_structure import build_template_data_from_session
from services.service_types import JsonList, ServiceResult
from validators import validate_session_template_data


class TemplateService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _validate_owned_root(self, root_id, current_user_id):
        root = require_owned_root(self.db_session, root_id, current_user_id)
        if not root:
            return None, ("Fractal not found or access denied", 404)
        return root, None

    def list_templates(self, root_id, current_user_id, *, limit=None, offset=0) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        templates_q = self.db_session.query(SessionTemplate).filter(
            SessionTemplate.root_id == root_id,
            SessionTemplate.deleted_at.is_(None),
        )
        if limit is not None:
            templates_q = templates_q.offset(offset).limit(limit)
        return templates_q.all(), None, 200

    def get_template(self, root_id, template_id, current_user_id) -> ServiceResult[SessionTemplate]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        template = get_owned_session_template(self.db_session, root_id, template_id)
        if not template:
            return None, "Template not found", 404
        return template, None, 200

    def create_template(self, root_id, current_user_id, data) -> ServiceResult[SessionTemplate]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        try:
            template_data = validate_session_template_data(data.get('template_data') or {})
        except ValueError as exc:
            return None, str(exc), 400

        new_template = SessionTemplate(
            id=str(uuid.uuid4()),
            name=data['name'],
            description=data.get('description', ''),
            root_id=root_id,
            template_data=json.dumps(template_data) if template_data else None,
        )
        self.db_session.add(new_template)
        self.db_session.commit()
        self.db_session.refresh(new_template)
        event_bus.emit(Event(
            Events.SESSION_TEMPLATE_CREATED,
            {
                'template_id': new_template.id,
                'name': new_template.name,
                'root_id': root_id,
            },
            source='template_service.create_template',
        ))
        return new_template, None, 201

    def create_template_from_session(self, root_id, session_id, name, current_user_id) -> ServiceResult[SessionTemplate]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        session = self.db_session.query(Session).options(
            selectinload(Session.template),
            selectinload(Session.activity_instances).selectinload(models.ActivityInstance.definition),
            with_loader_criteria(models.ActivityInstance, models.ActivityInstance.deleted_at == None, include_aliases=True),
        ).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at.is_(None),
        ).first()
        if not session:
            return None, "Session not found", 404

        template_data = build_template_data_from_session(session)
        if is_quick_session(session) and not template_data.get('activities'):
            return None, "Quick sessions must include at least one activity", 400

        return self.create_template(root_id, current_user_id, {
            'name': name,
            'description': session.description or '',
            'template_data': template_data,
        })

    def update_template(self, root_id, template_id, current_user_id, data) -> ServiceResult[SessionTemplate]:
        template, error, status = self.get_template(root_id, template_id, current_user_id)
        if error:
            return None, error, status

        if 'name' in data:
            template.name = data['name']
        if 'description' in data:
            template.description = data['description']
        if 'template_data' in data:
            template.template_data = json.dumps(data['template_data'])

        self.db_session.commit()
        self.db_session.refresh(template)
        event_bus.emit(Event(
            Events.SESSION_TEMPLATE_UPDATED,
            {
                'template_id': template.id,
                'name': template.name,
                'root_id': root_id,
                'updated_fields': list(data.keys()),
            },
            source='template_service.update_template',
        ))
        return template, None, 200

    def delete_template(self, root_id, template_id, current_user_id) -> ServiceResult[dict]:
        template, error, status = self.get_template(root_id, template_id, current_user_id)
        if error:
            return None, error, status

        template_name = template.name
        template.deleted_at = models.utc_now()
        self.db_session.commit()
        event_bus.emit(Event(
            Events.SESSION_TEMPLATE_DELETED,
            {
                'template_id': template.id,
                'name': template_name,
                'root_id': root_id,
            },
            source='template_service.delete_template',
        ))
        return {"message": "Template deleted successfully"}, None, 200
