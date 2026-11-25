import uuid

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from .base import Base, utc_now

DEVICE_PLATFORMS = ('ios', 'macos')


class UserDevice(Base):
    """One signed-in native install. Revoking it ends that install's session only."""

    __tablename__ = 'user_devices'
    __table_args__ = (
        sa.CheckConstraint("platform IN ('ios', 'macos')", name='ck_user_devices_platform'),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    platform = Column(String(16), nullable=False)
    name = Column(String(80), nullable=False)
    # The user's session version at sign-in: "sign out everywhere" outdates the device too.
    session_version = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.text('now()'))
    last_seen_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.text('now()'))
    revoked_at = Column(DateTime, nullable=True)


class DeviceRefreshToken(Base):
    """Every refresh token a device has been given, hashed, so a reused one is recognised."""

    __tablename__ = 'device_refresh_tokens'

    token_hash = Column(String(64), primary_key=True)
    device_id = Column(String, ForeignKey('user_devices.id', ondelete='CASCADE'), nullable=False, index=True)
    parent_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.text('now()'))
    superseded_at = Column(DateTime, nullable=True)
