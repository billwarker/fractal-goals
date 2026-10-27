"""Outbound OAuth connections, single-use state, and serialized token refresh."""
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import logging
import secrets
import time

from sqlalchemy import func
from sqlalchemy.orm import Session

from config import config
from models import MediaAsset, Note, NoteAttachment, StorageAuthorization, StorageConnection, User
from models.base import utc_now
from services import storage_providers as provider_api
from services.storage_common import MAX_ATTACHMENTS, PROVIDERS, StorageError, provider_config, seal, unseal

logger = logging.getLogger(__name__)


class StorageConnectionService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def redirect_uri(provider):
        return f'{config.APP_BASE_URL.rstrip("/")}/api/storage/{provider}/callback'

    def list_connections(self, user_id):
        """Settings view of each provider. Never includes credentials, scopes or provider account IDs."""
        rows = {row.provider: row for row in self.db.query(StorageConnection).filter_by(user_id=user_id).all()}
        rows_with_counts = (self.db.query(MediaAsset.connection_id, func.count(NoteAttachment.id))
                            .join(NoteAttachment, NoteAttachment.asset_id == MediaAsset.id)
                            .join(Note, Note.id == NoteAttachment.note_id)
                            .join(StorageConnection, StorageConnection.id == MediaAsset.connection_id)
                            .filter(StorageConnection.user_id == user_id, Note.deleted_at.is_(None))
                            .group_by(MediaAsset.connection_id).all())
        counts: dict[str, int] = {connection_id: count for connection_id, count in rows_with_counts}
        providers = []
        chosen = next((provider for provider, row in rows.items() if row.upload_default), None)
        for provider in PROVIDERS:
            try:
                provider_config(provider)
                configured = provider != 'google_drive' or bool(config.GOOGLE_PICKER_API_KEY and config.GOOGLE_PICKER_APP_ID)
            except StorageError:
                configured = False
            row = rows.get(provider)
            status = row.status if row else 'not_connected'
            providers.append({
                'provider': provider, 'configured': configured,
                'status': status if configured else 'unavailable',
                'connected': configured and status == 'active',
                'account_label': row.account_label if row else None,
                'connected_at': row.connected_at.isoformat() + 'Z' if row and row.connected_at else None,
                'attachment_count': counts.get(row.id, 0) if row else 0,
            })
        usable = [item['provider'] for item in providers if item['connected']]
        return {'providers': providers,
                # The chosen account while it is usable, otherwise the first connected one.
                'upload_destination': chosen if chosen in usable else (usable[0] if usable else None),
                'limits': {'max_file_bytes': config.STORAGE_MAX_FILE_BYTES, 'max_attachments': MAX_ATTACHMENTS}}

    def set_upload_destination(self, user_id, provider):
        row = self.connection(user_id, provider)
        self.db.query(StorageConnection).filter(StorageConnection.user_id == user_id,
                                                StorageConnection.id != row.id).update({'upload_default': False})
        self.db.flush()  # Clear the old default before the partial unique index sees the new one.
        row.upload_default = True
        self.db.commit()
        return {'upload_destination': provider}

    def start(self, user_id, provider):
        provider_config(provider)
        user = self.db.get(User, user_id)
        if not user or not bool(user.is_active) or user.erasure_requested_at is not None:
            raise StorageError('An active account without pending deletion is required', 409)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        self.db.query(StorageAuthorization).filter(StorageAuthorization.expires_at < now).delete()
        self.db.query(StorageAuthorization).filter_by(user_id=user_id, provider=provider).delete()
        state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(64)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
        self.db.add(StorageAuthorization(state_hash=hashlib.sha256(state.encode()).hexdigest(),
                                         user_id=user_id, provider=provider, verifier=seal(verifier),
                                         expires_at=now + timedelta(minutes=10)))
        self.db.commit()
        return {'url': provider_api.authorization_url(provider, self.redirect_uri(provider), state, challenge)}

    def callback(self, provider, state, code):
        if not isinstance(state, str) or not 20 <= len(state) <= 200 or not isinstance(code, str) or not 1 <= len(code) <= 4096:
            raise StorageError('Storage authorization was cancelled or expired')
        authorization = self.db.query(StorageAuthorization).filter_by(
            state_hash=hashlib.sha256(state.encode()).hexdigest(), provider=provider,
        ).with_for_update().first()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if not authorization or authorization.expires_at <= now:
            raise StorageError('Storage authorization expired. Connect again.')
        user_id, verifier = authorization.user_id, unseal(authorization.verifier)
        self.db.delete(authorization)
        self.db.commit()  # A code exchange is attempted once even if its remote response is lost.
        user = self.db.get(User, user_id)
        if not user or not bool(user.is_active) or user.erasure_requested_at is not None:
            raise StorageError('Account unavailable', 403)
        tokens = provider_api.token_request(provider, code=code, code_verifier=verifier,
                                           redirect_uri=self.redirect_uri(provider), grant_type='authorization_code')
        if not tokens.get('access_token') or not tokens.get('refresh_token'):
            raise StorageError('Offline storage access was not granted. Connect again.', 409, 'storage_permissions')
        required = provider_api.GOOGLE_SCOPE if provider == 'google_drive' else provider_api.DROPBOX_SCOPE
        granted = tokens.get('scope', '')
        if not set(required.split()).issubset(set(granted.split())):
            raise StorageError('Required storage permissions were not granted. Connect again.', 409, 'storage_permissions')
        account_id, label = provider_api.account(provider, tokens['access_token'])
        # Consent may finish after erasure was requested during the provider round trip.
        # Refresh and lock the user before saving credentials so erasure either wins here
        # or waits for this commit and then destroys the new connection.
        user = self.db.query(User).filter_by(id=user_id).populate_existing().with_for_update().first()
        if not user or not bool(user.is_active) or user.erasure_requested_at is not None:
            raise StorageError('Account unavailable', 403)
        row = self.db.query(StorageConnection).filter_by(user_id=user_id, provider=provider).with_for_update().first()
        if row and row.account_id != account_id and self.db.query(MediaAsset.id).filter_by(connection_id=row.id).first():
            raise StorageError('Reconnect the original storage account to preserve existing attachments', 409,
                               'storage_account_mismatch')
        if not row:
            row = StorageConnection(user_id=user_id, provider=provider, account_id=account_id, account_label=label)
            self.db.add(row)
        row.account_id, row.account_label = account_id, label[:255]
        row.credentials, row.status = seal(self._credentials(tokens)), 'active'
        row.scopes, row.connected_at = ' '.join(sorted(set(granted.split()))), utc_now()
        self.db.commit()

    @staticmethod
    def _credentials(tokens):
        return {'access_token': tokens['access_token'], 'refresh_token': tokens['refresh_token'],
                'expires_at': time.time() + min(14400, max(60, int(tokens.get('expires_in', 3600))))}

    def connection(self, user_id, provider):
        provider_config(provider)
        row = self.db.query(StorageConnection).filter_by(user_id=user_id, provider=provider).first()
        if not row or row.status != 'active':
            raise StorageError('Connect your storage account first', 409, 'storage_reconnect')
        return row

    def access_token(self, connection_id, user_id):
        row = self.db.query(StorageConnection).filter_by(id=connection_id, user_id=user_id).with_for_update().first()
        if not row or row.status != 'active':
            raise StorageError('Reconnect your storage account', 409, 'storage_reconnect')
        credentials = unseal(row.credentials)
        if credentials['expires_at'] <= time.time() + 120:
            try:
                tokens = provider_api.token_request(row.provider, grant_type='refresh_token', refresh_token=credentials['refresh_token'])
            except StorageError as exc:
                if exc.code == 'storage_reconnect':
                    # The grant was revoked or expired at the provider; keep no dead secret.
                    row.deactivate('reconnect_required')
                    self.db.commit()
                raise
            tokens.setdefault('refresh_token', credentials['refresh_token'])
            row.credentials = seal(self._credentials(tokens))
            credentials = unseal(row.credentials)
        self.db.commit()  # Release the token-refresh row lock before media/network streaming.
        return credentials['access_token']

    def disconnect(self, user_id, provider):
        if provider not in PROVIDERS:
            raise StorageError('Unknown storage provider', 404)
        self._deactivate(user_id, provider)
        return {'disconnected': True}

    def disconnect_all(self, user_id):
        """Destroy all credentials in one transaction before best-effort remote revocation."""
        self._deactivate(user_id)

    def _deactivate(self, user_id, provider=None):
        filters = {'user_id': user_id, **({'provider': provider} if provider else {})}
        grants = []
        for row in self.db.query(StorageConnection).filter_by(**filters).with_for_update().all():
            if row.credentials:
                try:
                    grants.append((row.provider, unseal(row.credentials)))
                except StorageError:
                    logger.warning('Undecryptable storage connection %s removed', row.id)
                row.deactivate('disconnected')
        self.db.query(StorageAuthorization).filter_by(**filters).delete()
        # Local credentials are gone before any network call, so a slow provider holds no lock.
        self.db.commit()
        for name, credentials in grants:
            try:
                provider_api.revoke(name, self._revocation_token(name, credentials))
            except (StorageError, KeyError):
                logger.warning('Provider revocation unavailable for %s', name)

    @staticmethod
    def _revocation_token(provider, credentials):
        if provider == 'google_drive':
            return credentials['refresh_token']  # Revoking the refresh token ends the whole grant.
        if credentials['expires_at'] > time.time() + 30:
            return credentials['access_token']
        return provider_api.token_request(provider, grant_type='refresh_token',
                                          refresh_token=credentials['refresh_token'])['access_token']

    def picker(self, user_id):
        if not config.GOOGLE_PICKER_API_KEY or not config.GOOGLE_PICKER_APP_ID:
            raise StorageError('Google Picker is not configured', 503)
        row = self.connection(user_id, 'google_drive')
        return {'access_token': self.access_token(row.id, user_id), 'api_key': config.GOOGLE_PICKER_API_KEY,
                'app_id': config.GOOGLE_PICKER_APP_ID}
