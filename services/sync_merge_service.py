"""Field-by-field merging of edits made on devices that had not seen each other's changes.

A device sends what each field held when it was edited. A field the server still holds that way is
simply updated. Otherwise two edits clash: the later one is kept, by when the user made it, and the
other is recorded so it can be restored.
"""
import datetime

from models import Goal, Note, Program, Session, SessionTemplate, ActivityDefinition
from models import SyncConflict, SyncFieldEdit, format_utc, utc_now
from services.occurred_at import utc_now_naive
from services.service_types import JsonDict, ServiceResult

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
    return (left or None) == (right or None)


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
        dropped = []
        for name in fields:
            if name not in body:
                continue
            current, incoming = _plain(getattr(row, name)), body[name]
            clock = self.db_session.get(SyncFieldEdit, (entity_type, entity_id, name))
            clash = base is not None and name in base and not _same(current, base[name]) and not _same(current, incoming)
            if clash:
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
            if clock is None:
                self.db_session.add(SyncFieldEdit(
                    entity_type=entity_type, entity_id=entity_id, field=name, owner_id=user_id, edited_at=edited_at,
                ))
            else:
                clock.edited_at = max(clock.edited_at, edited_at)
        return dropped

    def list_conflicts(self, user_id) -> JsonDict:
        rows = self.db_session.query(SyncConflict).filter(
            SyncConflict.owner_id == user_id, SyncConflict.resolved_at.is_(None),
        ).order_by(SyncConflict.created_at.desc(), SyncConflict.id).limit(100).all()
        return {'conflicts': [{
            'id': row.id, 'root_id': row.root_id, 'type': row.entity_type, 'entity_id': row.entity_id,
            'field': row.field, 'kept_value': row.kept_value, 'lost_value': row.lost_value,
            'created_at': format_utc(row.created_at),
        } for row in rows]}

    def resolve(self, user_id, conflict_id) -> ServiceResult[JsonDict]:
        """Mark it dealt with. Restoring the other value is an ordinary edit."""
        row = self.db_session.query(SyncConflict).filter_by(id=conflict_id, owner_id=user_id).one_or_none()
        if row is None:
            return None, 'Conflict not found', 404
        row.resolved_at = row.resolved_at or utc_now()
        self.db_session.commit()
        return {'id': row.id}, None, 200

