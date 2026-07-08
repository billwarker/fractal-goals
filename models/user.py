from sqlalchemy import Column, String, Boolean, DateTime, Integer, BigInteger, ForeignKey
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
from .base import Base, utc_now, JSON_TYPE

class User(Base):
    """
    Represents a user in the system.
    """
    __tablename__ = 'users'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(80), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    preferences = Column(JSON_TYPE, default={})  # Store UI preferences like goal colors
    role = Column(String(32), default='user', nullable=False, index=True)
    membership_tier = Column(String(32), default='free', nullable=False)
    quota_overrides = Column(JSON_TYPE, nullable=True)
    storage_limit_bytes = Column(BigInteger, default=104857600, nullable=True)
    stripe_customer_id = Column(String(255), nullable=True)
    stripe_subscription_id = Column(String(255), nullable=True)
    subscription_status = Column(String(32), default='none', nullable=False)
    paid_amount_cad_cents = Column(Integer, nullable=True)
    
    # Auth & Security Improvements
    last_login_at = Column(DateTime, nullable=True)
    failed_login_count = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    # Relationships
    # Using string reference for Goal to avoid circular import
    goals = relationship("Goal", back_populates="owner", cascade="all, delete-orphan")
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self):
        return (self.role or 'user').lower() == 'admin'


class SignupInviteKey(Base):
    """
    Hashed one-time invite keys for tester onboarding.
    Raw keys are never stored.
    """
    __tablename__ = 'signup_invite_keys'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key_hash = Column(String(64), unique=True, nullable=False, index=True)
    label = Column(String(255), nullable=True)
    assigned_email = Column(String(120), nullable=True, index=True)
    created_by_user_id = Column(String, ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    used_by_user_id = Column(String, ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    created_at = Column(DateTime, default=utc_now)
    expires_at = Column(DateTime, nullable=True)
    used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    creator = relationship("User", foreign_keys=[created_by_user_id])
    used_by = relationship("User", foreign_keys=[used_by_user_id])


class BetaSignupRequest(Base):
    """
    Public private-beta request queue.
    This is intentionally separate from invite keys: admins still decide who receives
    an account invite, while public visitors can ask to be considered.
    """
    __tablename__ = 'beta_signup_requests'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # name/use_case are optional: the public landing form collects email and an
    # optional free-text goal (stored in use_case). They stay on the model for
    # compatibility with the API's optional fields.
    name = Column(String(120), nullable=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    use_case = Column(String(280), nullable=True)
    note = Column(String(1000), nullable=True)
    status = Column(String(32), default='new', nullable=False, index=True)
    source = Column(String(80), default='landing_page', nullable=False)
    invited_at = Column(DateTime, nullable=True)
    invite_key_id = Column(String, ForeignKey('signup_invite_keys.id', ondelete='SET NULL'), nullable=True, index=True)
    last_invite_email_sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    invite_key = relationship("SignupInviteKey", foreign_keys=[invite_key_id])


class PasswordResetToken(Base):
    """
    Single-use password reset token storage. Raw tokens are emailed once and
    never persisted; token_hash is enough to validate a later reset request.
    """
    __tablename__ = 'password_reset_tokens'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    used_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=utc_now)

    user = relationship("User")


class EmailDeliveryEvent(Base):
    """
    Operator-facing audit trail for transactional email attempts. It stores
    workflow metadata and provider ids/errors, not raw email bodies or secrets.
    """
    __tablename__ = 'email_delivery_events'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    provider = Column(String(32), nullable=False, index=True)
    template_key = Column(String(80), nullable=False, index=True)
    entity_type = Column(String(80), nullable=True, index=True)
    entity_id = Column(String, nullable=True, index=True)
    recipient_user_id = Column(String, ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    beta_signup_id = Column(String, ForeignKey('beta_signup_requests.id', ondelete='SET NULL'), nullable=True, index=True)
    provider_message_id = Column(String(255), nullable=True)
    idempotency_key = Column(String(255), nullable=True, index=True)
    status = Column(String(32), default='pending', nullable=False, index=True)
    error_summary = Column(String(500), nullable=True)
    last_event_type = Column(String(80), nullable=True)
    last_event_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    sent_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)

    recipient_user = relationship("User", foreign_keys=[recipient_user_id])
    beta_signup = relationship("BetaSignupRequest", foreign_keys=[beta_signup_id])


class EmailWebhookEvent(Base):
    """
    Idempotency ledger for provider webhook callbacks. The payload is stored as
    metadata for audit/debugging, but never includes app-generated raw secrets.
    """
    __tablename__ = 'email_webhook_events'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    provider = Column(String(32), nullable=False, index=True)
    provider_event_id = Column(String(255), nullable=False, unique=True, index=True)
    provider_message_id = Column(String(255), nullable=True, index=True)
    event_type = Column(String(80), nullable=False, index=True)
    payload = Column(JSON_TYPE, nullable=True)
    created_at = Column(DateTime, default=utc_now)
