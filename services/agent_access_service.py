"""OAuth grants and adapter-bound credentials for remote AI connectors."""

import datetime as dt
import hashlib
import hmac
import secrets
from urllib.parse import urlsplit

import jwt

from config import config
from models import (
    AgentCredential,
    AgentGrant,
    AgentOAuthClient,
    User,
    utc_now,
)


AGENT_SCOPES = frozenset({
    "goals:read",
    "goals:write",
    "activities:write",
    "programs:write",
    "notes:write",
})
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
INTERNAL_TOKEN_AUDIENCE = "fractal-agent-api"


class AgentAccessError(ValueError):
    def __init__(self, error, status=400):
        super().__init__(error)
        self.status = status
        self.error = error


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _scope_set(scope_string: str) -> set[str]:
    return {part for part in (scope_string or "").split() if part}


def _utc(value):
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=dt.timezone.utc)


def _token_value():
    return secrets.token_urlsafe(48)


def _valid_resource(resource):
    expected = config.AGENT_MCP_RESOURCE_URI
    if not expected or resource != expected:
        raise AgentAccessError("Invalid resource audience", 400)
    parsed = urlsplit(resource)
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        raise AgentAccessError("The MCP resource must use HTTPS", 400)
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise AgentAccessError("Invalid MCP resource URI", 400)


def _valid_redirect_uri(uri):
    if not isinstance(uri, str) or len(uri) > 2048:
        return False
    parsed = urlsplit(uri)
    if not parsed.scheme or not parsed.netloc or parsed.username or parsed.password or parsed.fragment:
        return False
    if parsed.scheme == "https":
        return True
    return parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}


class AgentAccessService:
    def __init__(self, db_session):
        self.db_session = db_session

    def register_client(self, data):
        redirect_uris = list(dict.fromkeys(data.redirect_uris))
        if len(redirect_uris) != len(data.redirect_uris) or any(
            not _valid_redirect_uri(uri) for uri in redirect_uris
        ):
            raise AgentAccessError("Every redirect URI must be unique and use HTTPS or a loopback HTTP URI")
        if data.application_type == "native" and any(
            urlsplit(uri).scheme == "https" and urlsplit(uri).hostname in {"localhost", "127.0.0.1", "::1"}
            for uri in redirect_uris
        ):
            raise AgentAccessError("Native loopback redirects must use HTTP")
        client_id = _token_value()
        client = AgentOAuthClient(
            client_id=client_id,
            client_name=data.client_name[:120],
            redirect_uris=redirect_uris,
            grant_types=data.grant_types,
            token_endpoint_auth_method="none",
        )
        self.db_session.add(client)
        self.db_session.commit()
        return {
            "client_id": client.client_id,
            "client_name": client.client_name,
            "redirect_uris": redirect_uris,
            "token_endpoint_auth_method": "none",
            "grant_types": list(client.grant_types),
            "response_types": ["code"],
        }

    def get_client_for_authorization(self, client_id, redirect_uri):
        client = self.db_session.query(AgentOAuthClient).filter(
            AgentOAuthClient.client_id == client_id,
            AgentOAuthClient.revoked_at.is_(None),
        ).first()
        if not client or redirect_uri not in (client.redirect_uris or []):
            raise AgentAccessError("Invalid OAuth client or redirect URI", 400)
        return client

    def create_consent_grant(
        self,
        *,
        user_id,
        client,
        root_ids,
        scopes,
        resource,
    ):
        _valid_resource(resource)
        requested_scopes = set(scopes)
        if not requested_scopes or not requested_scopes.issubset(AGENT_SCOPES):
            raise AgentAccessError("Invalid scope", 400)
        if not root_ids or len(root_ids) > 50 or len(set(root_ids)) != len(root_ids):
            raise AgentAccessError("Select between 1 and 50 fractals", 400)
        from models import Goal, validate_root_goal
        owned = {
            root_id
            for root_id in root_ids
            if validate_root_goal(self.db_session, root_id, owner_id=user_id)
        }
        if owned != set(root_ids):
            raise AgentAccessError("A selected fractal is unavailable", 400)
        grant = AgentGrant(
            user_id=user_id,
            client_id=client.id,
            allowed_roots=sorted(owned),
            scopes=" ".join(sorted(requested_scopes)),
            audience=resource,
            expires_at=utc_now() + dt.timedelta(days=config.AGENT_REFRESH_TOKEN_TTL_DAYS),
        )
        self.db_session.add(grant)
        self.db_session.flush()
        return grant

    def active_access_credential(self, raw_token, *, expected_audience=None):
        now = utc_now()
        credential = self.db_session.query(AgentCredential).filter(
            AgentCredential.token_hash == _token_hash(raw_token or ""),
            AgentCredential.token_type == ACCESS_TOKEN_TYPE,
            AgentCredential.revoked_at.is_(None),
            AgentCredential.expires_at > now,
        ).first()
        if not credential:
            return None
        if expected_audience and credential.audience != expected_audience:
            return None
        grant = self.db_session.query(AgentGrant).filter(
            AgentGrant.id == credential.grant_id,
            AgentGrant.revoked_at.is_(None),
            AgentGrant.expires_at > now,
        ).first()
        client = self.db_session.query(AgentOAuthClient).filter(
            AgentOAuthClient.id == credential.client_id,
            AgentOAuthClient.revoked_at.is_(None),
        ).first()
        user = self.db_session.query(User).filter(
            User.id == (grant.user_id if grant else None),
            User.is_active.is_(True),
            User.erasure_requested_at.is_(None),
        ).first()
        if not grant or not client or not user or credential.scopes != grant.scopes:
            return None
        return credential, grant, client, user

    def verify_adapter_secret(self, supplied_secret):
        expected = config.AGENT_ADAPTER_SHARED_SECRET
        return bool(expected) and hmac.compare_digest(expected, supplied_secret or "")

    def exchange_for_internal_token(self, raw_token, adapter_secret):
        if not self.verify_adapter_secret(adapter_secret):
            raise AgentAccessError("Adapter authentication failed", 401)
        active = self.active_access_credential(
            raw_token,
            expected_audience=config.AGENT_MCP_RESOURCE_URI,
        )
        if not active:
            raise AgentAccessError("invalid_token", 401)
        credential, grant, client, user = active
        remaining = int((_utc(credential.expires_at) - utc_now()).total_seconds())
        expires_in = max(1, min(60, remaining))
        claims = {
            "iss": config.AGENT_OAUTH_ISSUER,
            "aud": INTERNAL_TOKEN_AUDIENCE,
            "sub": user.id,
            "grant_id": grant.id,
            "client_id": client.client_id,
            "credential_id": credential.id,
            "roots": grant.allowed_roots or [],
            "scope": grant.scopes,
            "adapter_id": config.AGENT_ADAPTER_ID,
            "exp": utc_now() + dt.timedelta(seconds=expires_in),
            "iat": utc_now(),
        }
        return {
            "access_token": jwt.encode(claims, config.JWT_SECRET_KEY, algorithm="HS256"),
            "token_type": "Bearer",
            "expires_in": expires_in,
        }

    def verify_internal_token(self, raw_token, adapter_secret):
        if not self.verify_adapter_secret(adapter_secret):
            raise AgentAccessError("Adapter authentication failed", 401)
        try:
            claims = jwt.decode(
                raw_token or "",
                config.JWT_SECRET_KEY,
                algorithms=["HS256"],
                audience=INTERNAL_TOKEN_AUDIENCE,
                issuer=config.AGENT_OAUTH_ISSUER,
                options={"require": ["sub", "exp", "iat", "credential_id", "grant_id", "roots", "scope"]},
            )
        except jwt.InvalidTokenError as error:
            raise AgentAccessError("Invalid internal API credential", 401) from error
        if claims.get("adapter_id") != config.AGENT_ADAPTER_ID:
            raise AgentAccessError("Invalid adapter identity", 401)
        credential = self.db_session.get(AgentCredential, claims.get("credential_id"))
        active = self.active_access_credential_for_row(credential)
        if not active:
            raise AgentAccessError("Delegated grant is no longer active", 401)
        _, grant, client, user = active
        if (
            claims.get("sub") != user.id
            or claims.get("grant_id") != grant.id
            or claims.get("client_id") != client.client_id
            or claims.get("roots") != (grant.allowed_roots or [])
            or claims.get("scope") != grant.scopes
        ):
            raise AgentAccessError("Internal API credential scope changed", 401)
        return {
            "user_id": user.id,
            "grant_id": grant.id,
            "client_id": client.client_id,
            "credential_id": credential.id,
            "roots": list(grant.allowed_roots or []),
            "scopes": _scope_set(grant.scopes),
        }

    def active_access_credential_for_row(self, credential):
        if (
            not credential
            or credential.token_type != ACCESS_TOKEN_TYPE
            or credential.revoked_at is not None
            or _utc(credential.expires_at) <= utc_now()
        ):
            return None
        return self.active_access_credential_by_id(credential)

    def active_access_credential_by_id(self, credential):
        grant = self.db_session.query(AgentGrant).filter(
            AgentGrant.id == credential.grant_id,
            AgentGrant.revoked_at.is_(None),
            AgentGrant.expires_at > utc_now(),
        ).first()
        client = self.db_session.query(AgentOAuthClient).filter(
            AgentOAuthClient.id == credential.client_id,
            AgentOAuthClient.revoked_at.is_(None),
        ).first()
        user = self.db_session.query(User).filter(
            User.id == (grant.user_id if grant else None),
            User.is_active.is_(True),
            User.erasure_requested_at.is_(None),
        ).first()
        if not grant or not client or not user or credential.scopes != grant.scopes:
            return None
        return credential, grant, client, user

    def list_grants(self, user_id):
        rows = self.db_session.query(AgentGrant, AgentOAuthClient).join(
            AgentOAuthClient,
            AgentOAuthClient.id == AgentGrant.client_id,
        ).filter(
            AgentGrant.user_id == user_id,
            AgentGrant.revoked_at.is_(None),
            AgentGrant.expires_at > utc_now(),
        ).order_by(AgentGrant.created_at.desc()).all()
        return [
            {
                "id": grant.id,
                "client_name": client.client_name,
                "scopes": sorted(_scope_set(grant.scopes)),
                "root_ids": list(grant.allowed_roots or []),
                "created_at": grant.created_at.isoformat() if grant.created_at else None,
                "expires_at": grant.expires_at.isoformat() if grant.expires_at else None,
            }
            for grant, client in rows
        ]

    def revoke_grant(self, user_id, grant_id):
        grant = self.db_session.query(AgentGrant).filter(
            AgentGrant.id == grant_id,
            AgentGrant.user_id == user_id,
            AgentGrant.revoked_at.is_(None),
        ).with_for_update().first()
        if not grant:
            raise AgentAccessError("Connection not found", 404)
        grant.revoked_at = utc_now()
        now = utc_now()
        self.db_session.query(AgentCredential).filter(
            AgentCredential.grant_id == grant.id,
            AgentCredential.revoked_at.is_(None),
        ).update({AgentCredential.revoked_at: now}, synchronize_session=False)
        self.db_session.commit()
        return {"id": grant.id, "revoked": True}
