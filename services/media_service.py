"""Tenant-scoped durable media references and atomic note attachment validation."""
import re

from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session

from models import Goal, GoalAttachment, MediaAsset, Note, NoteAttachment, validate_root_goal
from services import storage_providers as provider_api
from services.storage_common import (
    MAX_ATTACHMENTS, StorageError, canonical_media_type, media_kind, serialize_asset, validate_file, validate_file_id, verify_signature,
)
from services.media_stream import bounded_range
from services.storage_connection_service import StorageConnectionService


class MediaService:
    def __init__(self, db: Session):
        self.db = db
        self.connections = StorageConnectionService(db)

    def owned_root(self, root_id, user_id):
        if not validate_root_goal(self.db, root_id, owner_id=user_id):
            raise StorageError('Fractal not found', 404)

    def import_file(self, root_id, user_id, provider, file_id, resource_key=None):
        self.owned_root(root_id, user_id)
        validate_file_id(provider, file_id)
        if resource_key and (not isinstance(resource_key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,255}', resource_key)):
            raise StorageError('Invalid file resource key')
        connection = self.connections.connection(user_id, provider)
        token = self.connections.access_token(connection.id, user_id)
        data = provider_api.metadata(provider, token, file_id, resource_key)
        data['mime_type'] = validate_file(data['name'], data['mime_type'], data['size_bytes'])
        if data['file_id'] != file_id:
            raise StorageError('Provider returned an unexpected file', 502)
        with provider_api.download(provider, token, file_id, resource_key, 'bytes=0-31') as response:
            head = next(response.iter_content(chunk_size=32), b'')
            verify_signature(data['mime_type'], head)
        asset = self.store_asset(root_id, connection.id, data, resource_key)
        self.db.commit()
        return serialize_asset(asset)

    def store_asset(self, root_id, connection_id, data, resource_key=None):
        data = {**data, 'mime_type': validate_file(data['name'], data['mime_type'], data['size_bytes'])}
        if not self.db.query(Goal.id).filter(Goal.id == root_id, Goal.deleted_at.is_(None)).with_for_update().first():
            raise StorageError('Fractal not found', 404)
        asset = self.db.query(MediaAsset).filter_by(root_id=root_id, connection_id=connection_id, file_id=data['file_id']).first()
        if asset and asset.revision != data.get('revision'):
            raise StorageError('The source file changed. Existing evidence is preserved; choose a new file.', 409, 'media_revision_changed')
        if not asset:
            if self.db.query(MediaAsset).filter_by(root_id=root_id).count() >= 1000:
                raise StorageError('This fractal has reached its media reference limit', 409)
            asset = MediaAsset(root_id=root_id, connection_id=connection_id, resource_key=resource_key, **data)
            self.db.add(asset)
            self.db.flush()
        elif resource_key:
            asset.resource_key = resource_key
        return asset

    def validate_attachments(self, root_id, user_id, attachments):
        if not isinstance(attachments, list) or len(attachments) > MAX_ATTACHMENTS:
            raise StorageError(f'Attach at most {MAX_ATTACHMENTS} files')
        ids = []
        for item in attachments:
            if not isinstance(item, dict) or set(item) - {'asset_id', 'alt_text'}:
                raise StorageError('Invalid attachment')
            asset_id, alt_text = item.get('asset_id'), item.get('alt_text', '')
            if not isinstance(asset_id, str) or asset_id in ids or not isinstance(alt_text, str) or len(alt_text) > 500:
                raise StorageError('Invalid or duplicate attachment')
            ids.append(asset_id)
        assets = self.db.query(MediaAsset).filter(MediaAsset.id.in_(ids), MediaAsset.root_id == root_id).all()
        if len(assets) != len(ids) or any(asset.connection.user_id != user_id or asset.connection.status != 'active' for asset in assets):
            raise StorageError('Attachment not found or storage disconnected', 404)
        return attachments

    def replace_attachments(self, note, attachments):
        self._replace(NoteAttachment, 'note_id', note, attachments)

    def goal_attachments(self, root_id, user_id, goal_id):
        """Media on a goal's description, read on demand so goal trees don't load it."""
        self.owned_root(root_id, user_id)
        goal = self.db.query(Goal).filter(Goal.id == goal_id, Goal.root_id == root_id, Goal.deleted_at.is_(None)).first()
        if not goal:
            raise StorageError('Goal not found', 404)
        rows = self.db.query(GoalAttachment).filter_by(goal_id=goal.id).order_by(GoalAttachment.position).all()
        return [serialize_attachment(row) for row in rows]

    def replace_goal_attachments(self, goal, attachments):
        """Media on a goal's description; validated with validate_attachments like a note's."""
        self._replace(GoalAttachment, 'goal_id', goal, attachments)

    def _replace(self, model, owner_key, owner, attachments):
        # Delete first so reordering does not collide with unique positions.
        self.db.query(model).filter_by(**{owner_key: owner.id}).delete(synchronize_session=False)
        self.db.flush()
        for position, item in enumerate(attachments):
            self.db.add(model(**{owner_key: owner.id}, asset_id=item['asset_id'], position=position,
                              alt_text=item.get('alt_text', '').strip()))
        self.db.flush()
        self.db.expire(owner, ['attachments'])

    def owned_asset(self, root_id, user_id, asset_id):
        self.owned_root(root_id, user_id)
        asset = self.db.query(MediaAsset).filter_by(id=asset_id, root_id=root_id).first()
        if not asset or asset.connection.user_id != user_id:
            raise StorageError('Attachment not found', 404)
        return asset

    def web_url(self, root_id, user_id, asset_id):
        """Where to view the original in Google Drive or Dropbox."""
        asset = self.owned_asset(root_id, user_id, asset_id)
        provider = asset.connection.provider
        token = None
        if provider == 'dropbox' and asset.connection.status == 'active':
            try:
                token = self.connections.access_token(asset.connection_id, user_id)
            except StorageError:
                token = None  # Falls back to the app folder rather than an error page.
        return provider_api.web_url(provider, asset.file_id, asset.resource_key, token)

    def _same_file(self, asset):
        """Every reference to this provider file: one asset per fractal it was attached in."""
        return self.db.query(MediaAsset).filter_by(connection_id=asset.connection_id, file_id=asset.file_id)

    def usage(self, root_id, user_id, asset_id):
        asset = self.owned_asset(root_id, user_id, asset_id)
        ids = [row.id for row in self._same_file(asset).all()]
        notes = self.db.query(func.count(func.distinct(NoteAttachment.note_id))).join(
            Note, Note.id == NoteAttachment.note_id,
        ).filter(NoteAttachment.asset_id.in_(ids), Note.deleted_at.is_(None)).scalar()
        goals = self.db.query(func.count(func.distinct(GoalAttachment.goal_id))).join(
            Goal, Goal.id == GoalAttachment.goal_id,
        ).filter(GoalAttachment.asset_id.in_(ids), Goal.deleted_at.is_(None)).scalar()
        return {'notes': int(notes or 0), 'goals': int(goals or 0), 'provider': asset.connection.provider}

    def rename(self, root_id, user_id, asset_id, name):
        """Rename the original in the user's storage; the extension (and so the type) cannot change."""
        asset = self.owned_asset(root_id, user_id, asset_id)
        name = name.strip() if isinstance(name, str) else ''
        validate_file(name, asset.mime_type, asset.size_bytes)
        if name != asset.name:
            token = self.connections.access_token(asset.connection_id, user_id)
            name = provider_api.rename(asset.connection.provider, token, asset.file_id, name, asset.resource_key)
            self._same_file(asset).update({'name': name[:255]}, synchronize_session=False)
            self.db.commit()
            self.db.refresh(asset)
        return serialize_asset(asset)

    def delete_from_storage(self, root_id, user_id, asset_id):
        """Move the original to the provider's trash and remove it from every note that used it."""
        asset = self.owned_asset(root_id, user_id, asset_id)
        result = self.usage(root_id, user_id, asset_id)
        token = self.connections.access_token(asset.connection_id, user_id)
        provider_api.trash(asset.connection.provider, token, asset.file_id, asset.resource_key)
        # Note and goal attachments cascade with their assets in the database.
        self._same_file(asset).delete(synchronize_session=False)
        self.db.commit()
        return {'deleted': True, 'notes_updated': result['notes'], 'goals_updated': result['goals']}

    def playable_asset(self, root_id, user_id, asset_id):
        self.owned_root(root_id, user_id)
        # Playable while attached to a live note or goal in this fractal, or while attached to
        # nothing yet (a file just chosen or uploaded, previewed before its note or goal is saved).
        # Media whose only attachments are on deleted notes or goals stays unavailable.
        on_note = exists().where(NoteAttachment.asset_id == MediaAsset.id, Note.id == NoteAttachment.note_id,
                                 Note.root_id == root_id, Note.deleted_at.is_(None))
        on_goal = exists().where(GoalAttachment.asset_id == MediaAsset.id, Goal.id == GoalAttachment.goal_id,
                                 Goal.root_id == root_id, Goal.deleted_at.is_(None))
        unattached = ~exists().where(NoteAttachment.asset_id == MediaAsset.id) & ~exists().where(GoalAttachment.asset_id == MediaAsset.id)
        asset = self.db.query(MediaAsset).filter(
            MediaAsset.id == asset_id, MediaAsset.root_id == root_id, or_(on_note, on_goal, unattached),
        ).first()
        if not asset or asset.connection.user_id != user_id:
            raise StorageError('Attachment not found', 404)
        return asset

    def thumbnail(self, root_id, user_id, asset_id):
        """The provider's preview image for a playable file (a video's poster frame)."""
        asset = self.playable_asset(root_id, user_id, asset_id)
        if media_kind(asset.mime_type) != 'video':
            raise StorageError('No preview image for this file', 404, 'media_no_thumbnail')
        token = self.connections.access_token(asset.connection_id, user_id)
        return provider_api.thumbnail(asset.connection.provider, token, asset.file_id, asset.resource_key)

    def open_content(self, root_id, user_id, asset_id, byte_range=None):
        asset = self.playable_asset(root_id, user_id, asset_id)
        if byte_range and not re.fullmatch(r'bytes=(?:\d+-\d*|-\d+)', byte_range):
            raise StorageError('Use a single valid byte range', 416, 'media_invalid_range')
        token = self.connections.access_token(asset.connection_id, user_id)
        current = provider_api.metadata(asset.connection.provider, token, asset.file_id, asset.resource_key)
        if (current['revision'] != asset.revision or current['size_bytes'] != asset.size_bytes
                or canonical_media_type(current['mime_type'], asset.name) != asset.mime_type):
            raise StorageError('The source file changed. Relink a new file to preserve this evidence.', 409, 'media_revision_changed')
        response = provider_api.download(asset.connection.provider, token, asset.file_id, asset.resource_key,
                                         bounded_range(byte_range, asset.size_bytes))
        return asset, response


def serialize_attachment(attachment):
    return {**serialize_asset(attachment.asset), 'alt_text': attachment.alt_text, 'position': attachment.position}
