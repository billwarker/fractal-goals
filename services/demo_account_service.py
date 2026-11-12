"""The account that owns the live demo's snapshots.

Nobody signs in to it: login refuses the role, and its password is random and never
stored anywhere. It exists so the demo reads frozen copies instead of a real person's
data, and so feature flags and preferences are those of an ordinary user.
"""
import secrets
import uuid

from config import config
from models import User

DEMO_ACCOUNT_ROLE = 'demo'
DEMO_ACCOUNT_USERNAME = 'fractal-demo'
DEMO_ACCOUNT_EMAIL = 'demo@fractalgoals.invalid'


class DemoAccountService:
    def __init__(self, db_session):
        self.db_session = db_session

    def get(self) -> User | None:
        return self.db_session.query(User).filter(User.role == DEMO_ACCOUNT_ROLE).first()

    def ensure(self) -> User:
        """The demo account, created on first use. Caller commits."""
        account = self.get()
        if account is not None:
            return account
        account = User(
            id=str(uuid.uuid4()),
            username=DEMO_ACCOUNT_USERNAME,
            email=DEMO_ACCOUNT_EMAIL,
            role=DEMO_ACCOUNT_ROLE,
            is_active=True,
            preferences={},
            terms_accepted_version=config.TERMS_VERSION,
            privacy_accepted_version=config.PRIVACY_VERSION,
        )
        account.set_password(secrets.token_urlsafe(48))
        self.db_session.add(account)
        self.db_session.flush()
        return account
