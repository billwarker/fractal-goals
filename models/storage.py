"""User-owned external storage. Original files are never owned/deleted by this database."""
from datetime import datetime
import uuid

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, false, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, utc_now


def new_id():
    return str(uuid.uuid4())


class StorageConnection(Base):
    __tablename__ = 'storage_connections'
    __table_args__ = (
        UniqueConstraint('user_id', 'provider', name='uq_storage_connection_provider'),
        CheckConstraint("provider IN ('google_drive', 'dropbox')", name='ck_storage_provider'),
        CheckConstraint("status IN ('active', 'reconnect_required', 'disconnected')", name='ck_storage_connection_status'),
        # Credentials exist exactly while a connection is usable.
        CheckConstraint("(status = 'active') = (credentials IS NOT NULL)", name='ck_storage_connection_credentials'),
        # At most one account per user receives new uploads.
        Index('uq_storage_connection_upload_default', 'user_id', unique=True, postgresql_where=text('upload_default')),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    account_id: Mapped[str] = mapped_column(String(255))
    account_label: Mapped[str] = mapped_column(String(255))
    credentials: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default='active')
    scopes: Mapped[str | None] = mapped_column(Text)
    upload_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    connected_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    def deactivate(self, status):
        """Destroy local credentials; the status records why the connection stopped working."""
        self.credentials = None
        self.status = status


class StorageAuthorization(Base):
    __tablename__ = 'storage_authorizations'
    state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    verifier: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class MediaAsset(Base):
    __tablename__ = 'media_assets'
    __table_args__ = (
        UniqueConstraint('root_id', 'connection_id', 'file_id', name='uq_media_provider_file'),
        CheckConstraint('size_bytes > 0', name='ck_media_positive_size'),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    root_id: Mapped[str] = mapped_column(ForeignKey('goals.id', ondelete='CASCADE'), index=True)
    connection_id: Mapped[str] = mapped_column(ForeignKey('storage_connections.id', ondelete='CASCADE'), index=True)
    file_id: Mapped[str] = mapped_column(String(255))
    resource_key: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    revision: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    connection: Mapped[StorageConnection] = relationship(lazy='joined')


class NoteAttachment(Base):
    __tablename__ = 'note_attachments'
    __table_args__ = (
        UniqueConstraint('note_id', 'asset_id', name='uq_note_asset'),
        UniqueConstraint('note_id', 'position', name='uq_note_attachment_position'),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    note_id: Mapped[str] = mapped_column(ForeignKey('notes.id', ondelete='CASCADE'), index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey('media_assets.id', ondelete='CASCADE'), index=True)
    position: Mapped[int] = mapped_column(Integer)
    alt_text: Mapped[str] = mapped_column(String(500), default='')
    asset: Mapped[MediaAsset] = relationship(lazy='joined')


class GoalAttachment(Base):
    """A media file attached to a goal's description."""
    __tablename__ = 'goal_attachments'
    __table_args__ = (
        UniqueConstraint('goal_id', 'asset_id', name='uq_goal_asset'),
        UniqueConstraint('goal_id', 'position', name='uq_goal_attachment_position'),
    )
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    goal_id: Mapped[str] = mapped_column(ForeignKey('goals.id', ondelete='CASCADE'), index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey('media_assets.id', ondelete='CASCADE'), index=True)
    position: Mapped[int] = mapped_column(Integer)
    alt_text: Mapped[str] = mapped_column(String(500), default='')
    asset: Mapped[MediaAsset] = relationship(lazy='joined')


class StorageUpload(Base):
    __tablename__ = 'storage_uploads'
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    root_id: Mapped[str] = mapped_column(ForeignKey('goals.id', ondelete='CASCADE'), index=True)
    connection_id: Mapped[str] = mapped_column(ForeignKey('storage_connections.id', ondelete='CASCADE'), index=True)
    provider_session: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    offset: Mapped[int] = mapped_column(Integer, default=0)
    asset_id: Mapped[str | None] = mapped_column(ForeignKey('media_assets.id', ondelete='SET NULL'))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
