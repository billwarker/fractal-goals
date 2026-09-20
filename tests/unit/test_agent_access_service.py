import re
from urllib.parse import parse_qs, urlencode, urlsplit

import pytest

from config import config
from models import AgentAuthorizationCode, AgentCredential, AgentGrant, AgentOAuthClient
from services.agent_access_service import AgentAccessError, AgentAccessService
from services.feature_flag_service import FeatureFlagService
from validators.agent import AgentOAuthClientRegistrationSchema


def _pkce_challenge(verifier):
    import base64
    import hashlib

    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def test_oauth_code_pkce_exchange_refresh_rotation_and_revocation(
    client, auth_headers, db_session, test_user, sample_ultimate_goal, monkeypatch,
):
    resource = "https://mcp.example.test/mcp"
    issuer = "https://app.example.test"
    monkeypatch.setattr(config, "AGENT_MCP_RESOURCE_URI", resource)
    monkeypatch.setattr(config, "AGENT_OAUTH_ISSUER", issuer)
    monkeypatch.setattr(config, "TERMS_VERSION", "accepted-terms")
    monkeypatch.setattr(config, "PRIVACY_VERSION", "accepted-privacy")
    test_user.terms_accepted_version = "accepted-terms"
    test_user.privacy_accepted_version = "accepted-privacy"
    db_session.commit()
    FeatureFlagService(db_session).update_flags({
        "ai_agent_connectors": True,
        "ai_agent_writes": True,
    })

    registration = client.post(
        "/api/agent/oauth/register",
        json={
            "client_name": "Test connector",
            "redirect_uris": ["https://connector.example.test/callback"],
        },
    )
    assert registration.status_code == 201
    oauth_client_id = registration.json["client_id"]

    verifier = "f" * 43
    challenge = _pkce_challenge(verifier)
    authorization_params = {
        "client_id": oauth_client_id,
        "redirect_uri": "https://connector.example.test/callback",
        "response_type": "code",
        "scope": "goals:read notes:write",
        "state": "state-123",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "resource": resource,
    }
    authorize_url = f"/api/agent/oauth/authorize?{urlencode(authorization_params)}"
    consent = client.get(authorize_url, headers=auth_headers)
    assert consent.status_code == 200
    csrf = re.search(r'name="csrf_token" value="([^"]+)"', consent.get_data(as_text=True)).group(1)

    browser_form_headers = {
        **auth_headers,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    authorization = client.post("/api/agent/oauth/authorize", data={
        **authorization_params,
        "csrf_token": csrf,
        "decision": "allow",
        "root_ids": [sample_ultimate_goal.id],
        "scopes": ["goals:read", "notes:write"],
    }, headers=browser_form_headers)
    assert authorization.status_code == 302
    callback = urlsplit(authorization.headers["Location"])
    callback_query = parse_qs(callback.query)
    code = callback_query["code"][0]
    assert callback_query["state"] == ["state-123"]
    assert callback_query["iss"] == [issuer]

    tokens = client.post("/api/agent/oauth/token", data={
        "grant_type": "authorization_code",
        "client_id": oauth_client_id,
        "code": code,
        "redirect_uri": authorization_params["redirect_uri"],
        "code_verifier": verifier,
    })
    assert tokens.status_code == 200, tokens.get_data(as_text=True)
    first_pair = tokens.json
    assert first_pair["token_type"].lower() == "bearer"
    assert set(first_pair["scope"].split()) == {"goals:read", "notes:write"}
    assert len(db_session.query(AgentAuthorizationCode).filter(
        AgentAuthorizationCode.consumed_at.isnot(None),
    ).all()) == 1

    replay = client.post("/api/agent/oauth/token", data={
        "grant_type": "authorization_code",
        "client_id": oauth_client_id,
        "code": code,
        "redirect_uri": authorization_params["redirect_uri"],
        "code_verifier": verifier,
        "resource": resource,
    })
    assert replay.status_code == 400

    rotated_response = client.post("/api/agent/oauth/token", data={
        "grant_type": "refresh_token",
        "client_id": oauth_client_id,
        "refresh_token": first_pair["refresh_token"],
    })
    assert rotated_response.status_code == 200, rotated_response.get_data(as_text=True)
    rotated = rotated_response.json
    assert rotated["refresh_token"] != first_pair["refresh_token"]
    assert rotated["access_token"] != first_pair["access_token"]

    refresh_replay = client.post("/api/agent/oauth/token", data={
        "grant_type": "refresh_token",
        "client_id": oauth_client_id,
        "refresh_token": first_pair["refresh_token"],
        "resource": resource,
    })
    assert refresh_replay.status_code == 400

    credential_count = db_session.query(AgentCredential).count()
    grant = db_session.query(AgentGrant).one()
    assert grant.revoked_at is not None
    assert db_session.query(AgentCredential).filter_by(grant_id=grant.id, revoked_at=None).count() == 0
    assert db_session.query(AgentOAuthClient).filter_by(client_id=oauth_client_id).count() == 1
    assert credential_count == 4


def test_client_registration_rejects_untrusted_redirect_uri(db_session):
    service = AgentAccessService(db_session)
    schema = AgentOAuthClientRegistrationSchema.model_validate({
        "client_name": "Unsafe connector",
        "redirect_uris": ["https://trusted.example.test/callback", "https://trusted.example.test/callback"],
    })
    with pytest.raises(AgentAccessError, match="unique"):
        service.register_client(schema)
