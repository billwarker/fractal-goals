import json
import uuid

import models

from blueprints.api_utils import require_owned_root
from models import SessionTemplate
from services.owned_entity_queries import get_owned_session_template
from services.service_types import JsonList, ServiceResult


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

        template_data = data.get('template_data')
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
        return new_template, None, 201

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
        return template, None, 200

    def delete_template(self, root_id, template_id, current_user_id) -> ServiceResult[dict]:
        template, error, status = self.get_template(root_id, template_id, current_user_id)
        if error:
            return None, error, status

        template.deleted_at = models.utc_now()
        self.db_session.commit()
        return {"message": "Template deleted successfully"}, None, 200
