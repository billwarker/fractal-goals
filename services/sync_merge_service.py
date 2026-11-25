"""Field-by-field merging of edits made on devices that had not seen each other's changes.

A device sends what each field held when it was edited. A field the server still holds that way is
simply updated. Otherwise two edits clash: the later one is kept, by when the user made it, and the
other is recorded so it can be restored.
"""
import datetime
import re

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from models import Goal, Note, Program, Session, SessionTemplate, ActivityDefinition
from models import SyncConflict, SyncFieldEdit, format_utc, utc_now
from services.occurred_at import utc_now_naive
from services.service_types import JsonDict, ServiceResult

_BARE_DATE = re.compile(r'\d{4}-\d{2}-\d{2}')

# Only free-standing values. Everything structural keeps its own version checks and 409s.
MERGE_FIELDS = {
    'goal': (Goal, ('name', 'description', 'deadline')),
    'note': (Note, ('content',)),
    'program': (Program, ('name', 'description', 'color')),
    'template': (SessionTemplate, ('name', 'description')),
    'activity': (ActivityDefinition, ('name', 'description')),
    'session': (Session, ('name', 'description')),
}


def _plain(value):
    return format_utc(value) if isinstance(value, datetime.datetime) else value


def _same(left, right) -> bool:
    """Equal as the user sees them: empty is empty, and a bare date is that day's midnight."""
    left, right = left or None, right or None
    if left == right:
        return True
    if not isinstance(left, str) or not isinstance(right, str):
        return False
    short, full = sorted((left, right), key=len)
    return bool(_BARE_DATE.fullmatch(short)) and full.startswith(f'{short}T00:00:00')


def _naive(value):
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(datetime.timezone.utc).replace(tzinfo=None)


class SyncMergeService:
    def __init__(self, db_session):
        self.db_session = db_session

    def merge(self, user_id, root_id, entity_type, entity_id, body, base, edited_at) -> list[str]:
        """Drop the fields of ``body`` that lost, and return them. The caller's commit saves the record.

        ``base`` is None for an edit made online, which only records when its fields changed.
        """
        model, fields = MERGE_FIELDS[entity_type]
        query = self.db_session.query(model).join(Goal, Goal.id == model.root_id).filter(
            model.id == entity_id, model.root_id == root_id, Goal.owner_id == user_id,
        ) if model is not Goal else self.db_session.query(Goal).filter(
            Goal.id == entity_id, Goal.root_id == root_id, Goal.owner_id == user_id,
        )
        if hasattr(model, 'deleted_at'):
            query = query.filter(model.deleted_at.is_(None))
        if base is not None:
            query = query.with_for_update(of=model)
        row = query.populate_existing().one_or_none()
        if row is None:
            return []
        now = utc_now_naive()
        edited_at = min(edited_at or now, now)
        held = base or {}
        dropped = []
        for name in fields:
            if name not in body:
                continue
            current, incoming = _plain(getattr(row, name)), body[name]
            based = name in held
            if based and _same(incoming, held[name]):
                # Sent along unchanged (a form sends every field), so not an edit.
                if not _same(current, incoming):
                    body.pop(name)
                continue
            clock = self.db_session.get(
                SyncFieldEdit, (entity_type, entity_id, name), populate_existing=True,
            )
            if based and not _same(current, held[name]) and not _same(current, incoming):
                # An edit that never recorded its time (an agent's, say) counts as made at the last update.
                server_edited_at = clock.edited_at if clock else _naive(row.updated_at) or now
                keep_incoming = edited_at >= server_edited_at
                self.db_session.add(SyncConflict(
                    owner_id=user_id, root_id=root_id, entity_type=entity_type, entity_id=entity_id,
                    field=name,
                    kept_value=incoming if keep_incoming else current,
                    lost_value=current if keep_incoming else incoming,
                ))
                if not keep_incoming:
                    body.pop(name)
                    dropped.append(name)
                    continue
            self._record_edit(user_id, entity_type, entity_id, name, edited_at)
        return dropped

    def _record_edit(self, user_id, entity_type, entity_id, field, edited_at):
        insert = pg_insert(SyncFieldEdit).values(
            entity_type=entity_type, entity_id=entity_id, field=field, owner_id=user_id, edited_at=edited_at,
        )
        self.db_session.execute(insert.on_conflict_do_update(
            index_elements=['entity_type', 'entity_id', 'field'],
            set_={'edited_at': func.greatest(SyncFieldEdit.edited_at, insert.excluded.edited_at)},
        ))

    def list_conflicts(self, user_id) -> JsonDict:
        rows = self.db_session.query(SyncConflict).filter(
            SyncConflict.owner_id == user_id, SyncConflict.resolved_at.is_(None),
        ).order_by(SyncConflict.created_at.desc(), SyncConflict.id).limit(100).all()
        names = self._entity_names(rows)
        return {'conflicts': [{
            'id': row.id, 'root_id': row.root_id, 'type': row.entity_type, 'entity_id': row.entity_id,
            'entity_name': names.get((row.entity_type, row.entity_id)), 'field': row.field, 'kept_value': row.kept_value, 'lost_value': row.lost_value,
            'created_at': format_utc(row.created_at),
        } for row in rows]}

    def _entity_names(self, rows):
        """Names of the entities that still exist; a note has none."""
        wanted: dict[str, set] = {}
        for row in rows:
            wanted.setdefault(row.entity_type, set()).add(row.entity_id)
        names = {}
        for entity_type, ids in wanted.items():
            model, fields = MERGE_FIELDS[entity_type]
            if 'name' in fields:
                found = self.db_session.query(model.id, model.name).filter(model.id.in_(ids))
                names.update({(entity_type, entity_id): name for entity_id, name in found})
        return names

    def resolve(self, user_id, conflict_id) -> ServiceResult[JsonDict]:
        """Mark it dealt with. Restoring the other value is an ordinary edit."""
        row = self.db_session.query(SyncConflict).filter_by(id=conflict_id, owner_id=user_id).one_or_none()
        if row is None:
            return None, 'Conflict not found', 404
        row.resolved_at = row.resolved_at or utc_now()
        self.db_session.commit()
        return {'id': row.id}, None, 200

