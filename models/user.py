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
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
