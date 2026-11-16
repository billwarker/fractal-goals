"""Session templates have one shape: quick templates become one-section templates.

Quick sessions no longer come from templates (they are logged on Create Session and created
already complete). Each template whose `template_data.session_type` is 'quick' keeps its
activities as the items of one "Activities" section, and is marked `converted_from_quick` so
the downgrade can restore it. `session_type` is dropped from every template. Sessions keep the
type they recorded when they were created; nothing on `sessions` changes.

Idempotent: converted templates no longer say 'quick'. Self-contained: the conversion uses no
application code, so later model changes cannot alter it.
"""
import json
import logging
import uuid

from alembic import op
import sqlalchemy as sa

revision = 'aa1d1082d073'
down_revision = 'e1a3c5e7b9d2'
branch_labels = None
depends_on = None

logger = logging.getLogger('alembic.runtime.migration')

ACTIVITY_ID_KEYS = ('activity_definition_id', 'activity_id', 'activityId', 'activityDefinitionId', 'definition_id', 'id')


def _decode(raw):
    value = raw
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return None
    return value if isinstance(value, dict) else None


def _activity_id(item):
    if isinstance(item, str):
        return item.strip() or None
    if isinstance(item, dict):
        for key in ACTIVITY_ID_KEYS:
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _section_item(item):
    activity_id = _activity_id(item)
    if not activity_id:
        return None
    converted = dict(item) if isinstance(item, dict) else {}
    converted.update({'type': 'activity', 'activity_id': activity_id, 'item_key': str(uuid.uuid4())})
    return converted


def _templates(connection):
    return connection.execute(sa.text(
        "SELECT id, template_data FROM session_templates WHERE template_data IS NOT NULL",
    )).fetchall()


def _write(connection, template_id, data):
    value = "CAST(:data AS JSONB)" if connection.dialect.name == 'postgresql' else ":data"
    connection.execute(
        sa.text(f"UPDATE session_templates SET template_data = {value} WHERE id = :id"),
        {'id': template_id, 'data': json.dumps(data)},
    )


def upgrade():
    connection = op.get_bind()
    converted = 0
    for template_id, raw in _templates(connection):
        data = _decode(raw)
        if data is None or 'session_type' not in data:
            continue
        if str(data.get('session_type') or '').strip().lower() == 'quick':
            items = [item for item in map(_section_item, data.get('activities') or []) if item]
            data = {key: value for key, value in data.items() if key not in ('activities', 'sections')}
            data['sections'] = [{'name': 'Activities', 'items': items}]
            data['converted_from_quick'] = True
            converted += 1
        data.pop('session_type', None)
        _write(connection, template_id, data)
    logger.info('Converted %d quick session templates to one-section templates', converted)


def downgrade():
    connection = op.get_bind()
    for template_id, raw in _templates(connection):
        data = _decode(raw)
        if data is None:
            continue
        if data.pop('converted_from_quick', False):
            sections = data.pop('sections', None) or []
            items = sections[0].get('items', []) if sections and isinstance(sections[0], dict) else []
            data['activities'] = [
                {key: value for key, value in item.items() if key not in ('type', 'item_key')}
                for item in items if isinstance(item, dict)
            ]
            data['session_type'] = 'quick'
        else:
            data['session_type'] = 'normal'
        _write(connection, template_id, data)
