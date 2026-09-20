"""Authlib-backed OAuth authorization-code and refresh-token server."""

import datetime as dt
import threading

from authlib.integrations.flask_oauth2 import AuthorizationServer
from authlib.oauth2.rfc6749 import InvalidGrantError, grants
from authlib.oauth2.rfc7636 import CodeChallenge
from flask import current_app, g

from config import config
from models import AgentAuthorizationCode, AgentCredential, AgentGrant, AgentOAuthClient, User, utc_now
from services.agent_access_service import (
    ACCESS_TOKEN_TYPE,
    REFRESH_TOKEN_TYPE,
    _token_hash,
    _utc,
    _valid_resource,
)


_server_init_lock = threading.RLock()


def _db_session():
    session = getattr(g, "db_session", None)
    if session is None:
        raise RuntimeError("OAuth callbacks require a request-scoped database session")
    return session


class StrictS256CodeChallenge(CodeChallenge):
    DEFAULT_CODE_CHALLENGE_METHOD = "S256"
    SUPPORTED_CODE_CHALLENGE_METHOD = ["S256"]


class AgentAuthorizationCodeGrant(grants.AuthorizationCodeGrant):
    TOKEN_ENDPOINT_AUTH_METHODS = ["none"]

    def save_authorization_code(self, code, request):
        session = _db_session()
        grant_id = getattr(g, "agent_oauth_grant_id", None)
        grant = session.query(AgentGrant).filter_by(id=grant_id).with_for_update().first()
        if not grant:
            raise InvalidGrantError("The consent grant could not be found")
        payload = request.payload.data
        challenge_method = payload.get("code_challenge_method") or "S256"
        if challenge_method != "S256":
            raise InvalidGrantError("Only PKCE S256 is supported")
        session.add(AgentAuthorizationCode(
            code_hash=_token_hash(code),
            grant_id=grant.id,
            client_id=request.client.id,
            redirect_uri=request.payload.redirect_uri,
            scope=request.scope,
            code_challenge=payload.get("code_challenge", ""),
            code_challenge_method=challenge_method,
            state=request.payload.state,
            resource=grant.audience,
            expires_at=utc_now() + dt.timedelta(minutes=5),
        ))
        session.flush()

    def query_authorization_code(self, code, client):
        now = utc_now()
        return _db_session().query(AgentAuthorizationCode).filter(
            AgentAuthorizationCode.code_hash == _token_hash(code),
            AgentAuthorizationCode.client_id == client.id,
            AgentAuthorizationCode.consumed_at.is_(None),
            AgentAuthorizationCode.expires_at > now,
        ).with_for_update().first()

    def delete_authorization_code(self, authorization_code):
        authorization_code.consumed_at = utc_now()
        _db_session().flush()

    def authenticate_user(self, authorization_code):
        session = _db_session()
        grant = session.query(AgentGrant).filter(
            AgentGrant.id == authorization_code.grant_id,
            AgentGrant.client_id == authorization_code.client_id,
            AgentGrant.revoked_at.is_(None),
            AgentGrant.expires_at > utc_now(),
        ).with_for_update().first()
        if not grant:
            return None
        return session.query(User).filter(
            User.id == grant.user_id,
            User.is_active.is_(True),
            User.erasure_requested_at.is_(None),
        ).first()

    def validate_token_request(self):
        super().validate_token_request()
        authorization_code = self.request.authorization_code
        resource = self.request.form.get("resource")
        if resource and resource != authorization_code.resource:
            raise InvalidGrantError("The token request resource does not match authorization")
        _valid_resource(authorization_code.resource)


class AgentRefreshTokenGrant(grants.RefreshTokenGrant):
    TOKEN_ENDPOINT_AUTH_METHODS = ["none"]
    INCLUDE_NEW_REFRESH_TOKEN = True

    def authenticate_refresh_token(self, refresh_token):
        session = _db_session()
        now = utc_now()
        credential = session.query(AgentCredential).filter(
            AgentCredential.token_hash == _token_hash(refresh_token),
            AgentCredential.token_type == REFRESH_TOKEN_TYPE,
        ).with_for_update().first()
        if not credential or _utc(credential.expires_at) <= now:
            return None
        if credential.revoked_at is not None:
            grant = session.query(AgentGrant).filter_by(id=credential.grant_id).first()
            if grant and grant.revoked_at is None:
                # A refresh credential revoked by rotation is evidence of reuse.
                # The route commits this family revocation alongside the OAuth error.
                g.agent_refresh_replay_grant_id = grant.id
            return None
        grant = session.query(AgentGrant).filter(
            AgentGrant.id == credential.grant_id,
            AgentGrant.revoked_at.is_(None),
            AgentGrant.expires_at > now,
        ).first()
        return credential if grant else None

    def authenticate_user(self, credential):
        session = _db_session()
        grant = session.get(AgentGrant, credential.grant_id)
        if not grant or grant.revoked_at is not None or _utc(grant.expires_at) <= utc_now():
            return None
        return session.query(User).filter(
            User.id == grant.user_id,
            User.is_active.is_(True),
            User.erasure_requested_at.is_(None),
        ).first()

    def revoke_old_credential(self, credential):
        credential.revoked_at = utc_now()
        credential.replaced_by_id = getattr(self.request, "agent_new_refresh_id", None)
        _db_session().flush()


def _query_client(client_id):
    return _db_session().query(AgentOAuthClient).filter(
        AgentOAuthClient.client_id == client_id,
        AgentOAuthClient.revoked_at.is_(None),
    ).first()


def _save_token(token_data, request):
    session = _db_session()
    authorization_code = getattr(request, "authorization_code", None)
    previous_refresh = getattr(request, "refresh_token", None)
    if authorization_code is None and previous_refresh is None:
        raise InvalidGrantError("The OAuth grant is missing its delegated grant")
    grant_id = authorization_code.grant_id if authorization_code else previous_refresh.grant_id
    grant = session.query(AgentGrant).filter(
        AgentGrant.id == grant_id,
        AgentGrant.client_id == request.client.id,
        AgentGrant.revoked_at.is_(None),
        AgentGrant.expires_at > utc_now(),
    ).with_for_update().first()
    if not grant:
        raise InvalidGrantError("The delegated grant is no longer active")
    resource = authorization_code.resource if authorization_code else previous_refresh.audience
    requested_resource = request.form.get("resource")
    if (requested_resource and requested_resource != resource) or resource != grant.audience:
        raise InvalidGrantError("The token request resource does not match authorization")
    scopes = token_data.get("scope") or grant.scopes
    if set(scopes.split()) - set(grant.scopes.split()):
        raise InvalidGrantError("The token scope exceeds the delegated grant")

    now = utc_now()
    access_expires_at = now + dt.timedelta(seconds=int(token_data["expires_in"]))
    access = AgentCredential(
        token_hash=_token_hash(token_data["access_token"]),
        token_type=ACCESS_TOKEN_TYPE,
        grant_id=grant.id,
        client_id=request.client.id,
        audience=resource,
        scopes=scopes,
        expires_at=access_expires_at,
    )
    session.add(access)
    refresh_id = None
    if token_data.get("refresh_token"):
        refresh_expires_at = min(
            _utc(grant.expires_at),
            now + dt.timedelta(days=config.AGENT_REFRESH_TOKEN_TTL_DAYS),
        )
        refresh = AgentCredential(
            token_hash=_token_hash(token_data["refresh_token"]),
            token_type=REFRESH_TOKEN_TYPE,
            grant_id=grant.id,
            client_id=request.client.id,
            audience=resource,
            scopes=scopes,
            expires_at=refresh_expires_at,
        )
        session.add(refresh)
        session.flush()
        refresh_id = refresh.id
    session.flush()
    if previous_refresh is not None:
        request.agent_new_refresh_id = refresh_id


def get_agent_oauth_server():
    server = current_app.extensions.get("fractal_agent_oauth_server")
    if server is not None:
        return server
    with _server_init_lock:
        server = current_app.extensions.get("fractal_agent_oauth_server")
        if server is not None:
            return server
        current_app.config["OAUTH2_TOKEN_EXPIRES_IN"] = {
            "authorization_code": config.AGENT_ACCESS_TOKEN_TTL_SECONDS,
            "refresh_token": config.AGENT_ACCESS_TOKEN_TTL_SECONDS,
        }
        current_app.config["OAUTH2_REFRESH_TOKEN_GENERATOR"] = True
        server = AuthorizationServer()
        server.init_app(current_app, query_client=_query_client, save_token=_save_token)
        server.register_grant(AgentAuthorizationCodeGrant, [StrictS256CodeChallenge(required=True)])
        server.register_grant(AgentRefreshTokenGrant)
        current_app.extensions["fractal_agent_oauth_server"] = server
        return server
