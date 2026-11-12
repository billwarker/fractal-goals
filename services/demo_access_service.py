"""Read-only public access to the published landing examples (the live demo).

A demo token is a short-lived JWT with its own audience, so it can never pass
as a login session. It names the published example roots it may read; every
request is still checked against the currently published set, so unpublishing
an example closes the demo for it immediately. `blueprints/demo_access.py`
decides which routes a demo token may reach.
"""
import datetime
import logging

import jwt

from config import config
from models import Goal, User, _safe_load_json
from services.app_settings import get_app_setting
from services._landing_common import LANDING_EXAMPLE_CACHE_KEY
from services.ops_log import log_ops_event
from services.service_types import JsonDict, ServiceResult

logger = logging.getLogger(__name__)

DEMO_TOKEN_AUDIENCE = "fractal:demo"
DEMO_TOKEN_TTL = datetime.timedelta(hours=2)
# The only owner preferences a demo visitor sees: how the example's completed goals are coloured.
DEMO_APPEARANCE_PREFERENCES = ('completed_primary_color', 'completed_secondary_color')


class DemoAccessService:
    def __init__(self, db_session):
        self.db_session = db_session

    def published_root_ids(self) -> list[str]:
        cache = get_app_setting(self.db_session, LANDING_EXAMPLE_CACHE_KEY, {}) or {}
        return [
            str(example["root_id"])
            for example in cache.get("examples") or []
            if isinstance(example, dict) and example.get("root_id")
        ]

    def issue_demo_token(self) -> ServiceResult[JsonDict]:
        root_ids = self.published_root_ids()
        if not root_ids:
            return None, "The demo isn't available right now", 404
        now = datetime.datetime.now(datetime.timezone.utc)
        expires_at = now + DEMO_TOKEN_TTL
        token = jwt.encode({
            'aud': DEMO_TOKEN_AUDIENCE,
            'roots': root_ids,
            'iat': now,
            'exp': expires_at,
        }, config.JWT_SECRET_KEY, algorithm="HS256")
        log_ops_event("demo_session_issued", root_count=len(root_ids))
        return {
            'token': token,
            'expires_at': expires_at.isoformat(),
            'roots': root_ids,
            'appearance': self.root_appearance(root_ids),
        }, None, 201

    def root_appearance(self, root_ids: list[str]) -> dict[str, JsonDict]:
        """Each example's colour preferences from its owner, so the demo looks as the owner made it."""
        rows = (
            self.db_session.query(Goal.id, User.preferences)
            .join(User, Goal.owner_id == User.id)
            .filter(Goal.id.in_(root_ids), Goal.parent_id.is_(None))
            .all()
        )
        appearance = {}
        for root_id, raw_preferences in rows:
            preferences = _safe_load_json(raw_preferences, {}) or {}
            appearance[str(root_id)] = {
                key: preferences[key] for key in DEMO_APPEARANCE_PREFERENCES if preferences.get(key)
            }
        return appearance

    @staticmethod
    def is_demo_token(token: str) -> bool:
        try:
            claims = jwt.decode(token, options={"verify_signature": False})
        except jwt.InvalidTokenError:
            return False
        return claims.get('aud') == DEMO_TOKEN_AUDIENCE

    def resolve_demo_roots(self, token: str) -> ServiceResult[list[str]]:
        """The token's roots that are still published, or an auth error."""
        try:
            claims = jwt.decode(
                token,
                config.JWT_SECRET_KEY,
                algorithms=["HS256"],
                audience=DEMO_TOKEN_AUDIENCE,
                options={"require": ["exp", "roots"]},
            )
        except jwt.ExpiredSignatureError:
            return None, 'Token has expired', 401
        except jwt.InvalidTokenError:
            return None, 'Invalid token', 401
        published = set(self.published_root_ids())
        roots = [root_id for root_id in claims.get('roots') or [] if root_id in published]
        return roots, None, 200

    def load_root_owner(self, root_id: str) -> User | None:
        """The active owner of a demo root, detached so the request can't write through it."""
        owner = (
            self.db_session.query(User)
            .join(Goal, Goal.owner_id == User.id)
            .filter(
                Goal.id == root_id,
                Goal.parent_id.is_(None),
                Goal.deleted_at.is_(None),
                User.is_active.is_(True),
            )
            .first()
        )
        if owner is not None:
            self.db_session.expunge(owner)
        return owner
