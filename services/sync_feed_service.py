"""Reads the change log (models/sync.py) for devices keeping a local copy.

A change names an entity; its payload is read when the page is, so it may be newer than the
change. That is safe: the later change is still ahead of the cursor. An entity with no live
payload is reported deleted, which also covers everything under a deleted fractal.
"""
import base64
import binascii
import datetime
import json
import uuid

from sqlalchemy import and_, delete, func, literal, or_, select, text, tuple_

from config import config
from models import (
    ActivityDefinition, ActivityGroup, Base, Goal, MetricDefinition, Note, Program, Session, SessionTemplate,
    SyncChange, format_utc, utc_now,
)
from models.sync import SYNC_ENTITIES
from services.app_settings import get_app_setting, set_app_setting
from services.goal_loading import goal_serializer_relationship_loaders, load_fractal_goals_for_serialization
from services.programs import ProgramService
from services.serializers import (
    serialize_activity_definition, serialize_activity_group, serialize_goal, serialize_note, serialize_program,
    serialize_session, serialize_session_template,
)
from services.session_service import SessionService
from sqlalchemy.orm import joinedload, selectinload

SYNC_PROTOCOL = 1
SYNC_STATE_KEY = 'sync_state'
DEFAULT_PAGE = 100
MAX_PAGE = 200
_SNAPSHOT_TYPES = tuple(sorted(SYNC_ENTITIES))


class SyncCursorError(Exception):
    def __init__(self, message, code, status):
        super().__init__(message)
        self.code = code
        self.status = status


def _encode(value) -> str:
    return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).decode()


def _decode(token, kinds):
    try:
        value = json.loads(base64.urlsafe_b64decode(token.encode('ascii')))
    except (binascii.Error, UnicodeError, ValueError) as exc:
        raise SyncCursorError('Invalid cursor', 'invalid_cursor', 400) from exc
    valid = isinstance(value, list) and len(value) == len(kinds) and all(
        type(item) is kind for item, kind in zip(value, kinds)
    )
    if not valid:
        raise SyncCursorError('Invalid cursor', 'invalid_cursor', 400)
    return value


def _state(db_session):
    state = get_app_setting(db_session, SYNC_STATE_KEY, {}) or {}
    return {'epoch': state.get('epoch', 'initial'), 'horizon': int(state.get('horizon', 0))}


def prune_sync_changes(db_session, *, now=None) -> int:
    """Drop old log rows, moving the horizon past them in the same transaction. Caller commits."""
    cutoff = (now or utc_now()) - datetime.timedelta(days=config.SYNC_CHANGE_RETENTION_DAYS)
    cutoff = cutoff.replace(tzinfo=None)
    newest = db_session.execute(
        select(func.max(SyncChange.xid)).where(SyncChange.created_at < cutoff)
    ).scalar()
    if newest is None:
        return 0
    state = _state(db_session)
    state['horizon'] = max(state['horizon'], int(newest))
    set_app_setting(db_session, SYNC_STATE_KEY, state)
    result = db_session.execute(delete(SyncChange).where(SyncChange.created_at < cutoff))
    return int(result.rowcount or 0)


def reset_sync_epoch(db_session) -> str:
    """After a restore, transaction ids mean nothing: drop the log and send every device to a snapshot."""
    epoch = str(uuid.uuid4())
    db_session.execute(delete(SyncChange))
    set_app_setting(db_session, SYNC_STATE_KEY, {'epoch': epoch, 'horizon': 0})
    return epoch


class SyncFeedService:
    def __init__(self, db_session):
        self.db_session = db_session

    def changes(self, user_id: str, cursor: str | None, limit: int, *, with_data: bool = True):
        if not cursor:
            raise SyncCursorError('Start from a snapshot', 'sync_reset_required', 410)
        epoch, xid, entity_type, entity_id = _decode(cursor, (str, int, str, str))
        state = _state(self.db_session)
        # Only transactions below the bound are finished, so nothing can still appear behind it.
        bound = self._bound()
        # A cursor at the horizon may still be owed the rest of that transaction, so it is too old as well.
        if epoch != state['epoch'] or xid <= state['horizon'] or xid > bound:
            raise SyncCursorError('Start from a snapshot', 'sync_reset_required', 410)
        rows = self.db_session.execute(
            select(SyncChange.xid, SyncChange.entity_type, SyncChange.entity_id, SyncChange.root_id,
                   SyncChange.origin).where(
                SyncChange.owner_id == user_id,
                SyncChange.xid < bound,
                tuple_(SyncChange.xid, SyncChange.entity_type, SyncChange.entity_id)
                > tuple_(literal(xid), literal(entity_type), literal(entity_id)),
            ).order_by(SyncChange.xid, SyncChange.entity_type, SyncChange.entity_id).limit(limit + 1)
        ).all()
        has_more = len(rows) > limit
        rows = rows[:limit]
        position = [rows[-1].xid, rows[-1].entity_type, rows[-1].entity_id] if has_more else [bound, '', '']
        return {
            'protocol': SYNC_PROTOCOL,
            'changes': self._hydrate(
                user_id, [(row.entity_type, row.entity_id, row.root_id) for row in rows],
            ) if with_data else [
                {'type': row.entity_type, 'id': row.entity_id, 'root_id': row.root_id, 'origin': row.origin}
                for row in rows
            ],
            'cursor': _encode([epoch, *position]),
            'has_more': has_more,
        }

    def current_cursor(self):
        return {'protocol': SYNC_PROTOCOL, 'cursor': _encode([_state(self.db_session)['epoch'], self._bound(), '', ''])}

    def snapshot(self, user_id: str, page: str | None, limit: int):
        if page:
            epoch, start, entity_type, after_id = _decode(page, (str, int, str, str))
            state = _state(self.db_session)
            if epoch != state['epoch'] or start <= state['horizon'] or start > self._bound() or entity_type not in SYNC_ENTITIES:
                raise SyncCursorError('Start from a snapshot', 'sync_reset_required', 410)
        else:
            # Taken before the first page: anything that changes while paging is also in the feed.
            epoch, start = _state(self.db_session)['epoch'], self._bound()
            entity_type, after_id = _SNAPSHOT_TYPES[0], ''
        rows = self._snapshot_rows(user_id, entity_type, after_id, limit)
        next_page = None
        if len(rows) > limit:
            rows = rows[:limit]
            next_page = [epoch, start, entity_type, rows[-1][1]]
        else:
            following = _SNAPSHOT_TYPES.index(entity_type) + 1
            if following < len(_SNAPSHOT_TYPES):
                next_page = [epoch, start, _SNAPSHOT_TYPES[following], '']
        return {
            'protocol': SYNC_PROTOCOL,
            'changes': [change for change in self._hydrate(user_id, rows) if not change['deleted']],
            'next_page': _encode(next_page) if next_page else None,
            'cursor': None if next_page else _encode([epoch, start, '', '']),
        }

    def _bound(self) -> int:
        return int(self.db_session.execute(
            text('SELECT pg_snapshot_xmin(pg_current_snapshot())::text::bigint')
        ).scalar_one())

    def _snapshot_rows(self, user_id, entity_type, after_id, limit):
        table = Base.metadata.tables[SYNC_ENTITIES[entity_type]]
        statement = select(table.c.id, table.c.root_id).where(
            table.c.id > after_id, self._visible(table, user_id),
        ).order_by(table.c.id).limit(limit + 1)
        return [(entity_type, row.id, row.root_id) for row in self.db_session.execute(statement)]

    @staticmethod
    def _visible(table, user_id):
        """Rows the user can read now: theirs, live, and in a live fractal."""
        roots = Base.metadata.tables['goals'].alias('sync_root')
        own_root = select(literal(1)).where(
            roots.c.id == table.c.root_id, roots.c.owner_id == user_id, roots.c.deleted_at.is_(None),
        ).exists()
        if table.name == 'goal_levels':
            own_root = and_(table.c.owner_id == user_id, or_(table.c.root_id.is_(None), own_root))
        if 'user_id' in table.c:
            own_root = and_(own_root, table.c.user_id == user_id)
        return and_(own_root, table.c.deleted_at.is_(None)) if 'deleted_at' in table.c else own_root

    def _hydrate(self, user_id, rows):
        wanted: dict[str, dict] = {}
        for entity_type, entity_id, root_id in rows:
            wanted.setdefault(entity_type, {})[entity_id] = root_id
        result = []
        for entity_type, ids in wanted.items():
            table = Base.metadata.tables[SYNC_ENTITIES[entity_type]]
            visible = set(self.db_session.execute(
                select(table.c.id).where(table.c.id.in_(list(ids)), self._visible(table, user_id))
            ).scalars())
            load = getattr(self, f'_load_{entity_type}', None)
            payloads = load(visible, ids) if load and visible else (
                self._load_columns(table, visible) if visible else {}
            )
            result.extend({
                'type': entity_type,
                'id': entity_id,
                'root_id': root_id,
                'deleted': entity_id not in payloads,
                'data': payloads.get(entity_id),
            } for entity_id, root_id in ids.items())
        return result

    def _load_columns(self, table, ids):
        """Plain tables go out as their own columns."""
        rows = self.db_session.execute(select(table).where(table.c.id.in_(list(ids)))).mappings()
        return {row['id']: {key: self._json(value) for key, value in row.items()} for row in rows}

    @staticmethod
    def _json(value):
        if isinstance(value, datetime.datetime):
            return format_utc(value)
        if isinstance(value, datetime.date):
            return value.isoformat()
        return value if isinstance(value, (str, int, float, bool, list, dict, type(None))) else str(value)

    def _by_id(self, model, ids, *options):
        return self.db_session.query(model).options(*options).filter(model.id.in_(list(ids))).all()

    def _load_goal(self, visible, ids):
        payloads = {}
        for root_id in {ids[goal_id] for goal_id in visible}:
            goals = load_fractal_goals_for_serialization(self.db_session, root_id)
            payloads.update({
                goal_id: serialize_goal(goals[goal_id], include_children=False)
                for goal_id in visible if goal_id in goals
            })
        return payloads

    def _load_session(self, visible, _ids):
        service = SessionService(self.db_session)
        sessions = self._by_id(Session, visible, *service._session_read_options())
        service._attach_completed_goals(sessions)
        return {session.id: serialize_session(session) for session in sessions}

    def _load_note(self, visible, _ids):
        return {note.id: serialize_note(note) for note in self._by_id(Note, visible)}

    def _load_program(self, visible, _ids):
        programs = self._by_id(Program, visible, *ProgramService._program_serializer_load_options())
        return {program.id: serialize_program(program) for program in programs}

    def _load_template(self, visible, _ids):
        templates = self._by_id(
            SessionTemplate, visible,
            selectinload(SessionTemplate.goals).options(*goal_serializer_relationship_loaders()),
        )
        return {template.id: serialize_session_template(template) for template in templates}

    def _load_activity(self, visible, _ids):
        activities = self._by_id(
            ActivityDefinition, visible,
            selectinload(ActivityDefinition.metric_definitions).joinedload(MetricDefinition.fractal_metric),
            selectinload(ActivityDefinition.split_definitions),
            selectinload(ActivityDefinition.associated_goals).joinedload(Goal.level),
        )
        return {activity.id: serialize_activity_definition(activity) for activity in activities}

    def _load_activity_group(self, visible, _ids):
        groups = self._by_id(ActivityGroup, visible, selectinload(ActivityGroup.associated_goals))
        return {group.id: serialize_activity_group(group) for group in groups}
