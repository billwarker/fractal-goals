"""OAuth registration, consent, token, and discovery endpoints."""

import html
import secrets
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from flask import jsonify, redirect, request, make_response
from flask import g
from authlib.oauth2 import OAuth2Error
from pydantic import ValidationError
from blueprints.api_utils import get_db_session
from blueprints.auth_api import _get_request_token
from config import config
from extensions import limiter
from models import AgentCredential, AgentGrant, Goal, utc_now
from services.agent_access_service import AGENT_SCOPES, AgentAccessError, AgentAccessService, _token_hash, _valid_resource
from services.agent_harness_service import AgentHarnessError
from services.agent_oauth_server import get_agent_oauth_server
from services.auth_service import AuthService
from validators.agent import AgentOAuthClientRegistrationSchema
from blueprints.agent_api_common import (
    agent_oauth_bp,
    agent_metadata_bp,
    agent_database_boundary,
    _json_error,
    _require_enabled,
)

OAUTH_PREFIX = "/api/agent/oauth"

def _origin(value):
    parsed = urlsplit(value or "")
    if not parsed.scheme or not parsed.netloc or parsed.username or parsed.password:
        raise AgentAccessError("OAuth issuer is not configured", 503)
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise AgentAccessError("OAuth issuer must use HTTPS", 503)
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise AgentAccessError("OAuth issuer must be a canonical origin", 503)
    return f"{parsed.scheme}://{parsed.netloc}"

def _oauth_issuer():
    return _origin(config.AGENT_OAUTH_ISSUER)

def _absolute_oauth(path):
    return f"{_oauth_issuer()}{OAUTH_PREFIX}/{path}"

def _redirect_with_query(uri, values):
    parsed = urlsplit(uri)
    query = parse_qsl(parsed.query, keep_blank_values=True)
    query.extend((key, value) for key, value in values.items() if value is not None)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))

def _current_browser_user(db_session):
    token, _ = _get_request_token()
    if not token:
        return None
    user, error, _ = AuthService(db_session).get_current_user_for_token(token)
    if error or not user:
        return None
    return user

def _login_redirect():
    app_url = (config.APP_BASE_URL or "/").rstrip("/")
    resume = request.url
    return redirect(f"{app_url}/?{urlencode({'oauth_authorize': resume})}")

def _escape(value):
    return html.escape(str(value or ""), quote=True)

def _consent_html(client, scopes, roots, csrf_token, params, error=None):
    client_name = _escape(client.client_name)
    root_hint = params.get("root_id")
    root_options = []
    for root in roots:
        checked = " checked" if root.id == root_hint else ""
        root_options.append(
            '<label class="option"><input type="checkbox" name="root_ids" value="'
            + _escape(root.id) + '"' + checked + '> '
            + _escape(root.name) + '</label>'
        )
    scope_options = [
        '<label class="option"><input type="checkbox" name="scopes" value="'
        + _escape(scope) + '" checked> ' + _escape(scope) + '</label>'
        for scope in scopes
    ]
    hidden = [
        ("client_id", params.get("client_id")),
        ("redirect_uri", params.get("redirect_uri")),
        ("response_type", params.get("response_type")),
        ("scope", params.get("scope")),
        ("state", params.get("state")),
        ("code_challenge", params.get("code_challenge")),
        ("code_challenge_method", params.get("code_challenge_method")),
        ("resource", params.get("resource")),
    ]
    hidden_html = "".join(
        '<input type="hidden" name="' + _escape(key) + '" value="' + _escape(value) + '">'
        for key, value in hidden if value is not None
    )
    error_html = f'<p role="alert">{_escape(error)}</p>' if error else ""
    return (
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>Connect " + client_name + " · Fractal Goals</title>"
        "<style>body{font:16px system-ui;max-width:620px;margin:3rem auto;padding:0 1rem;"
        "color:#222}fieldset{margin:1.5rem 0;padding:1rem;border:1px solid #bbb;border-radius:8px}"
        "legend{font-weight:650}.option{display:block;padding:.5rem 0}button{padding:.7rem 1rem;"
        "font:inherit}p{line-height:1.5}</style><main><h1>Connect " + client_name + "</h1>"
        "<p>This AI service will be able to read the fractals and perform the write permissions "
        "you select below. Writes still require review in Fractal Goals.</p>" + error_html
        + '<form method="post">' + hidden_html
        + '<input type="hidden" name="csrf_token" value="' + _escape(csrf_token) + '">'
        + '<fieldset><legend>Allowed fractals</legend>'
        + ("".join(root_options) if root_options else "<p>No fractals are available for this account.</p>")
        + '</fieldset><fieldset><legend>Permissions</legend>'
        + "".join(scope_options)
        + '</fieldset><button type="submit" name="decision" value="allow">Allow connection</button> '
        + '<button type="submit" name="decision" value="deny">Cancel</button></form></main></html>'
    )

def _authorize_params(params, access_service):
    client_id = params.get("client_id", "")
    redirect_uri = params.get("redirect_uri", "")
    client = access_service.get_client_for_authorization(client_id, redirect_uri)
    if params.get("response_type") != "code":
        raise AgentAccessError("Only authorization code flow is supported")
    if params.get("code_challenge_method") != "S256" or not params.get("code_challenge"):
        raise AgentAccessError("PKCE S256 is required")
    challenge = params["code_challenge"]
    if len(challenge) != 43 or any(char not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for char in challenge):
        raise AgentAccessError("Invalid PKCE challenge")
    _valid_resource(params.get("resource"))
    requested = params.get("scope", "goals:read").split()
    if not requested or not set(requested).issubset(AGENT_SCOPES):
        raise AgentAccessError("Unsupported OAuth scope")
    state = params.get("state")
    if state is not None and len(state) > 500:
        raise AgentAccessError("OAuth state is too long")
    return client, sorted(set(requested))

@agent_metadata_bp.get("/.well-known/oauth-authorization-server")
def oauth_metadata():
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        issuer = _oauth_issuer()
        return jsonify({
            "issuer": issuer,
            "authorization_endpoint": _absolute_oauth("authorize"),
            "token_endpoint": _absolute_oauth("token"),
            "registration_endpoint": _absolute_oauth("register"),
            "revocation_endpoint": _absolute_oauth("revoke"),
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code", "refresh_token"],
            "token_endpoint_auth_methods_supported": ["none"],
            "code_challenge_methods_supported": ["S256"],
            "scopes_supported": sorted(AGENT_SCOPES),
            "authorization_response_iss_parameter_supported": True,
            "client_id_metadata_document_supported": False,
        })
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()

@agent_metadata_bp.get("/.well-known/oauth-protected-resource")
@agent_metadata_bp.get("/.well-known/oauth-protected-resource/mcp")
def protected_resource_metadata():
    try:
        resource = config.AGENT_MCP_RESOURCE_URI
        if not resource:
            raise AgentAccessError("MCP resource metadata is not configured", 503)
        _valid_resource(resource)
        return jsonify({
            "resource": resource,
            "authorization_servers": [_oauth_issuer()],
            "scopes_supported": sorted(AGENT_SCOPES),
            "bearer_methods_supported": ["header"],
        })
    except AgentAccessError as error:
        return _json_error(error)

@agent_oauth_bp.post("/register")
@limiter.limit("10 per hour")
@agent_database_boundary("Failed to register AI OAuth client")
def oauth_register_client():
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        data = AgentOAuthClientRegistrationSchema.model_validate(request.get_json(force=True))
        return jsonify(AgentAccessService(db_session).register_client(data)), 201
    except ValidationError as error:
        return jsonify({"error": "invalid_client_metadata", "details": error.errors()}), 400
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()

@agent_oauth_bp.route("/authorize", methods=["GET", "POST"])
@agent_database_boundary("Failed to authorize AI OAuth client")
def oauth_authorize():
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        params = request.args if request.method == "GET" else request.form
        service = AgentAccessService(db_session)
        client, scopes = _authorize_params(params, service)
        user = _current_browser_user(db_session)
        if not user:
            return _login_redirect()
        if not user.is_active or user.erasure_requested_at:
            raise AgentAccessError("This account cannot authorize a connection", 403)
        if user.terms_accepted_version != config.TERMS_VERSION or user.privacy_accepted_version != config.PRIVACY_VERSION:
            raise AgentAccessError("Accept the current legal documents in Fractal Goals before connecting", 403)
        oauth_server = get_agent_oauth_server()
        oauth_grant = oauth_server.get_consent_grant(end_user=user)
        if oauth_grant.client.id != client.id:
            raise AgentAccessError("OAuth client changed during authorization", 400)
        csrf_cookie = request.cookies.get(config.CSRF_COOKIE_NAME)
        if request.method == "GET":
            csrf_cookie = csrf_cookie or secrets.token_urlsafe(32)
            roots = db_session.query(Goal).filter(
                Goal.owner_id == user.id,
                Goal.parent_id.is_(None),
                Goal.root_id == Goal.id,
                Goal.deleted_at.is_(None),
            ).order_by(Goal.name).limit(51).all()
            if len(roots) > 50:
                roots = roots[:50]
            response = make_response(_consent_html(client, scopes, roots, csrf_cookie, params))
            response.headers["Content-Type"] = "text/html; charset=utf-8"
            response.headers["Cache-Control"] = "no-store"
            response.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
            if not request.cookies.get(config.CSRF_COOKIE_NAME):
                response.set_cookie(
                    config.CSRF_COOKIE_NAME,
                    csrf_cookie,
                    httponly=False,
                    secure=config.AUTH_COOKIE_SECURE,
                    samesite=config.AUTH_COOKIE_SAMESITE,
                    path="/",
                )
            return response

        csrf_form = request.form.get("csrf_token", "")
        if not csrf_cookie or not secrets.compare_digest(csrf_cookie, csrf_form):
            raise AgentAccessError("CSRF token missing or invalid", 403)
        if request.form.get("decision") != "allow":
            return _oauth_error_redirect(params, "access_denied", "The user cancelled authorization")
        selected_scopes = set(request.form.getlist("scopes"))
        selected_roots = request.form.getlist("root_ids")
        if not selected_scopes.issubset(set(scopes)):
            raise AgentAccessError("Requested permissions changed", 400)
        delegated_grant = service.create_consent_grant(
            user_id=user.id,
            client=client,
            root_ids=selected_roots,
            scopes=selected_scopes,
            resource=params.get("resource"),
        )
        oauth_grant.request.scope = " ".join(sorted(selected_scopes))
        g.agent_oauth_grant_id = delegated_grant.id
        response = oauth_server.create_authorization_response(grant=oauth_grant, grant_user=user)
        db_session.commit()
        location = response.headers.get("Location")
        if location:
            response.headers["Location"] = _redirect_with_query(location, {"iss": _oauth_issuer()})
        response.headers["Cache-Control"] = "no-store"
        return response
    except (AgentHarnessError, AgentAccessError) as error:
        if request.method == "POST":
            return _oauth_error_redirect(request.form, "invalid_request", str(error))
        return _json_error(error)
    except OAuth2Error as error:
        db_session.rollback()
        if request.method == "POST":
            return _oauth_error_redirect(request.form, "invalid_request", str(error))
        return jsonify({"error": error.error, "error_description": error.description}), error.status_code
    finally:
        db_session.close()

def _oauth_error_redirect(params, error, description):
    db_session = get_db_session()
    try:
        issuer = _oauth_issuer()
        AgentAccessService(db_session).get_client_for_authorization(
            params.get("client_id"),
            params.get("redirect_uri"),
        )
    except AgentAccessError:
        return jsonify({"error": error, "error_description": description}), 400
    finally:
        db_session.close()
    query = {
        "error": error,
        "error_description": description[:200],
        "iss": issuer,
    }
    if params.get("state"):
        query["state"] = params.get("state")
    return redirect(_redirect_with_query(params.get("redirect_uri"), query))

@agent_oauth_bp.post("/token")
@agent_database_boundary("Failed to issue AI OAuth token")
def oauth_token():
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        response = get_agent_oauth_server().create_token_response()
        replay_grant_id = getattr(g, "agent_refresh_replay_grant_id", None)
        if replay_grant_id:
            grant = db_session.query(AgentGrant).filter_by(id=replay_grant_id).first()
            if grant:
                AgentAccessService(db_session).revoke_grant(grant.user_id, grant.id)
        elif response.status_code < 400:
            db_session.commit()
        else:
            db_session.rollback()
        return response
    except (AgentHarnessError, AgentAccessError) as error:
        return jsonify({"error": getattr(error, "error", "invalid_grant"), "error_description": str(error)}), getattr(error, "status", 400)
    finally:
        db_session.close()

@agent_oauth_bp.post("/revoke")
@agent_database_boundary("Failed to revoke AI OAuth token")
def oauth_revoke():
    db_session = get_db_session()
    try:
        raw_token = request.form.get("token", "")
        credential = db_session.query(AgentCredential).filter(
            AgentCredential.token_hash == _token_hash(raw_token),
        ).first()
        if credential:
            grant = db_session.query(AgentGrant).filter_by(id=credential.grant_id).with_for_update().first()
            if grant:
                grant.revoked_at = utc_now()
                db_session.query(AgentCredential).filter_by(grant_id=grant.id).update(
                    {AgentCredential.revoked_at: utc_now()},
                    synchronize_session=False,
                )
                db_session.commit()
        return "", 200
    finally:
        db_session.close()
