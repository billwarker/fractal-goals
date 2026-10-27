"""Saved, clickable Notes page filters, owned through their fractal."""
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from models import NoteFilter, validate_root_goal
from services.note_filter_spec import NoteFilterError, is_empty, normalize_spec
from services.serializers import format_utc

MAX_FILTERS = 30


def serialize_note_filter(row):
    return {'id': row.id, 'name': row.name, 'spec': row.spec, 'position': row.position,
            'created_at': format_utc(row.created_at), 'updated_at': format_utc(row.updated_at)}


class NoteFilterService:
    def __init__(self, db):
        self.db = db

    def _root(self, root_id, user_id):
        if not validate_root_goal(self.db, root_id, owner_id=user_id):
            raise NoteFilterError('Fractal not found', 'not_found')

    def _owned(self, root_id, user_id, filter_id):
        self._root(root_id, user_id)
        row = self.db.query(NoteFilter).filter_by(id=filter_id, root_id=root_id).first()
        if not row:
            raise NoteFilterError('Saved filter not found', 'not_found')
        return row

    @staticmethod
    def _name(value):
        name = value.strip() if isinstance(value, str) else ''
        if not 1 <= len(name) <= 60:
            raise NoteFilterError('Give the filter a name of 1–60 characters')
        return name

    def _spec(self, raw):
        spec = normalize_spec(raw)
        if is_empty(spec):
            raise NoteFilterError('A saved filter needs at least one condition')
        return spec

    def _commit(self):
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise NoteFilterError('A saved filter with that name already exists', 'duplicate_name') from exc

    def list(self, root_id, user_id):
        self._root(root_id, user_id)
        rows = self.db.query(NoteFilter).filter_by(root_id=root_id).order_by(NoteFilter.position, NoteFilter.created_at).all()
        return [serialize_note_filter(row) for row in rows]

    def create(self, root_id, user_id, data):
        self._root(root_id, user_id)
        count = self.db.query(func.count(NoteFilter.id)).filter_by(root_id=root_id).scalar()
        if count >= MAX_FILTERS:
            raise NoteFilterError(f'A fractal can have up to {MAX_FILTERS} saved filters')
        row = NoteFilter(root_id=root_id, name=self._name(data.get('name')), spec=self._spec(data.get('spec')), position=count)
        self.db.add(row)
        self._commit()
        return serialize_note_filter(row)

    def update(self, root_id, user_id, filter_id, data):
        row = self._owned(root_id, user_id, filter_id)
        if 'name' in data:
            row.name = self._name(data['name'])
        if 'spec' in data:
            row.spec = self._spec(data['spec'])
        if 'position' in data:
            if not isinstance(data['position'], int) or isinstance(data['position'], bool) or data['position'] < 0:
                raise NoteFilterError('Position must be a non-negative integer')
            row.position = data['position']
        self._commit()
        return serialize_note_filter(row)

    def delete(self, root_id, user_id, filter_id):
        self.db.delete(self._owned(root_id, user_id, filter_id))
        self.db.commit()
        return {'deleted': True}
