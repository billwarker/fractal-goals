"""Bounded resumable uploads. Provider originals survive cancellations and account deletion."""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from models import MediaAsset, StorageConnection, StorageUpload
from services import storage_providers as provider_api
from services.media_service import MediaService
from services.storage_common import CHUNK_BYTES, StorageError, seal, serialize_asset, unseal, validate_file, verify_signature
from services.storage_connection_service import StorageConnectionService


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class StorageUploadService:
    def __init__(self, db: Session):
        self.db = db
        self.media = MediaService(db)
        self.connections = StorageConnectionService(db)

    def start(self, root_id, user_id, provider, name, mime_type, size):
        self.media.owned_root(root_id, user_id)
        validate_file(name, mime_type, size)
        if len(name) > 180:
            raise StorageError('Use a file name shorter than 181 characters')
        connection = self.connections.connection(user_id, provider)
        token = self.connections.access_token(connection.id, user_id)
        self.db.query(StorageUpload).filter(StorageUpload.expires_at < now()).delete()
        if self.db.query(StorageUpload).filter(StorageUpload.root_id == root_id, StorageUpload.asset_id.is_(None)).count() >= 16:
            raise StorageError('Finish or cancel existing uploads before starting another', 409)
        session = provider_api.start_upload(provider, token, name, mime_type, size)
        row = StorageUpload(root_id=root_id, connection_id=connection.id, name=name, mime_type=mime_type,
                            size_bytes=size, provider_session=seal(session), expires_at=now() + timedelta(hours=24))
        self.db.add(row)
        self.db.commit()
        return self.serialize(row)

    def owned_upload(self, root_id, user_id, upload_id):
        self.media.owned_root(root_id, user_id)
        row = self.db.query(StorageUpload).join(StorageConnection).filter(
            StorageUpload.id == upload_id, StorageUpload.root_id == root_id, StorageConnection.user_id == user_id,
        ).with_for_update(of=StorageUpload).first()
        if not row:
            raise StorageError('Upload not found', 404)
        if row.expires_at <= now():
            raise StorageError('Upload expired. Choose the file again.', 410)
        return row

    def chunk(self, root_id, user_id, upload_id, offset, body):
        row = self.owned_upload(root_id, user_id, upload_id)
        if row.asset_id:
            return self.serialize(row)
        if not isinstance(offset, int) or offset < 0 or offset > row.size_bytes or not 0 < len(body) <= CHUNK_BYTES:
            raise StorageError('Invalid upload chunk')
        if offset < row.offset:
            return self.serialize(row)
        if offset != row.offset or offset + len(body) > row.size_bytes:
            raise StorageError('Upload offset changed. Retry from the confirmed position.', 409, 'upload_offset_conflict')
        if offset + len(body) < row.size_bytes and len(body) != CHUNK_BYTES:
            raise StorageError('Nonfinal chunks must be exactly 1 MiB')
        if offset == 0:
            verify_signature(row.mime_type, body[:32])
        # Refresh may commit; acquire the upload lock again before sending bytes.
        connection = self.db.get(StorageConnection, row.connection_id)
        if connection is None:
            raise StorageError('Storage account unavailable', 404)
        provider = connection.provider
        token = self.connections.access_token(row.connection_id, user_id)
        row = self.owned_upload(root_id, user_id, upload_id)
        if row.asset_id or row.offset != offset:
            return self.serialize(row)
        session = unseal(row.provider_session)
        confirmed, file_id = provider_api.upload_status(provider, token, session, row.name, row.size_bytes, row.id)
        if file_id:
            return self.finish(row, user_id, provider, token, file_id)
        if confirmed is not None and confirmed != offset:
            if not 0 <= confirmed <= row.size_bytes:
                raise StorageError('Invalid upload offset from provider', 502)
            row.offset = confirmed
            self.db.commit()
            return self.serialize(row)
        confirmed, file_id = provider_api.upload_chunk(provider, token, session, row.name, row.mime_type,
                                                       row.size_bytes, offset, body, row.id)
        if not 0 <= confirmed <= row.size_bytes:
            raise StorageError('Invalid upload offset from provider', 502)
        row.offset = confirmed
        if file_id:
            return self.finish(row, user_id, provider, token, file_id)
        self.db.commit()
        return self.serialize(row)

    def finish(self, row, user_id, provider, token, file_id):
        data = provider_api.metadata(provider, token, file_id)
        if data['size_bytes'] != row.size_bytes or data['mime_type'] != row.mime_type:
            raise StorageError('Uploaded file metadata does not match. Check the original in your storage.', 409)
        asset = self.media.store_asset(row.root_id, row.connection_id, data)
        row.asset_id, row.offset = asset.id, row.size_bytes
        self.db.commit()
        return self.serialize(row)

    def cancel(self, root_id, user_id, upload_id):
        row = self.owned_upload(root_id, user_id, upload_id)
        self.db.delete(row)
        self.db.commit()
        return {'cancelled': True, 'originals_preserved': True}

    def serialize(self, row):
        asset = self.db.get(MediaAsset, row.asset_id) if row.asset_id else None
        return {'id': row.id, 'offset': row.offset, 'size_bytes': row.size_bytes, 'chunk_bytes': CHUNK_BYTES,
                'asset': serialize_asset(asset) if asset else None}
