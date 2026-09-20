import datetime as dt
from types import SimpleNamespace

from config import config
from models import AgentProposal, AppSetting
from services.agent_harness_service import AgentHarnessService
from services.feature_flag_service import FEATURE_FLAGS_SETTING_KEY


def _enable_agent_flags(db_session):
    flags = db_session.get(AppSetting, FEATURE_FLAGS_SETTING_KEY)
    if flags is None:
        flags = AppSetting(key=FEATURE_FLAGS_SETTING_KEY, value={})
        db_session.add(flags)
    flags.value = {
        "ai_agent_connectors": True,
        "ai_agent_writes": True,
        "ai_agent_embedded": True,
        "ai_agent_embedded_openai": True,
        "ai_agent_embedded_anthropic": False,
    }
    db_session.commit()


def test_first_party_agent_task_and_run_routes(
    db_session, authed_client, sample_ultimate_goal, monkeypatch,
):
    _enable_agent_flags(db_session)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", True)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_MODEL", "test-model")

    context = authed_client.get(f"/api/agent/context/{sample_ultimate_goal.id}")
    assert context.status_code == 200
    assert context.json["root"]["id"] == sample_ultimate_goal.id

    task_response = authed_client.post("/api/agent/tasks", json={
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave a short planning note.",
        "timezone": "UTC",
        "context": {"goal_ids": [sample_ultimate_goal.id]},
    })
    assert task_response.status_code == 201
    task_id = task_response.json["id"]

    assert authed_client.get("/api/agent/tasks", query_string={
        "root_id": sample_ultimate_goal.id,
    }).json["items"][0]["id"] == task_id
    assert authed_client.get(f"/api/agent/tasks/{task_id}").json["id"] == task_id
    assert authed_client.get(f"/api/agent/tasks/{task_id}/proposals").json == {"items": []}
    assert authed_client.get("/api/agent/runs").json["items"] == []
    assert authed_client.get(f"/api/agent/changes/{sample_ultimate_goal.id}").status_code == 200
    assert authed_client.get("/api/agent/connections").json == {"items": []}

    invalid_decision = authed_client.post("/api/agent/proposals/missing/decision", json={})
    assert invalid_decision.status_code == 400
    assert invalid_decision.json["error"] == "validation_failed"

    providers = authed_client.get("/api/agent/embedded/providers")
    assert providers.status_code == 200
    assert providers.json["providers"] == [{"id": "openai", "model": "test-model"}]

    started = authed_client.post("/api/agent/embedded/conversations", json={
        "root_id": sample_ultimate_goal.id,
        "provider": "openai",
        "message": "Help me make a plan.",
        "timezone": "America/Toronto",
    })
    assert started.status_code == 202
    conversation_id = started.json["conversation_id"]
    first_run_id = started.json["id"]

    conversations = authed_client.get("/api/agent/embedded/conversations", query_string={
        "root_id": sample_ultimate_goal.id,
    })
    assert conversations.json["items"][0]["id"] == conversation_id
    conversation = authed_client.get(f"/api/agent/embedded/conversations/{conversation_id}")
    assert conversation.json["messages"][0]["content"] == "Help me make a plan."
    assert authed_client.post(f"/api/agent/embedded/runs/{first_run_id}/cancel").json[
        "status"
    ] == "cancelled"

    next_turn = authed_client.post(
        f"/api/agent/embedded/conversations/{conversation_id}/messages",
        json={"message": "Include a rest day."},
    )
    assert next_turn.status_code == 202
    assert next_turn.json["conversation_id"] == conversation_id
    assert authed_client.post(
        f"/api/agent/embedded/runs/{next_turn.json['id']}/cancel",
    ).json["status"] == "cancelled"


def test_internal_agent_routes_enforce_roots_and_operation_scopes(
    db_session, client, test_user, sample_ultimate_goal, monkeypatch,
):
    from blueprints import agent_internal_api

    _enable_agent_flags(db_session)
    principal = {
        "user_id": test_user.id,
        "grant_id": None,
        "roots": [sample_ultimate_goal.id],
        "scopes": {"goals:read", "goals:write", "notes:write"},
    }
    monkeypatch.setattr(agent_internal_api, "_internal_principal", lambda _session: principal)

    fractals = client.post("/api/agent/internal/fractals")
    assert fractals.status_code == 200
    assert fractals.json["items"][0]["id"] == sample_ultimate_goal.id

    forbidden_context = client.post("/api/agent/internal/goal-context", json={
        "root_id": "outside-root",
    })
    assert forbidden_context.status_code == 403

    task = AgentHarnessService(db_session).create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Add one planning note.",
        "timezone": "UTC",
    })
    assert client.post(f"/api/agent/internal/tasks/{task['id']}").status_code == 200

    proposal_response = client.post(
        f"/api/agent/internal/tasks/{task['id']}/proposals",
        json={"operations": [{
            "operation_id": "note-1",
            "type": "create_note",
            "data": {
                "content": "Review this note before applying it.",
                "context_type": "root",
                "context_id": sample_ultimate_goal.id,
            },
        }]},
    )
    assert proposal_response.status_code == 201
    proposal_id = proposal_response.json["id"]
    assert client.post(f"/api/agent/internal/proposals/{proposal_id}").status_code == 200

    proposal = db_session.query(AgentProposal).filter_by(id=proposal_id).one()
    approved = AgentHarnessService(db_session).decide_proposal(
        test_user.id, proposal_id, proposal.proposal_hash, "approve",
    )
    queued = client.post(f"/api/agent/internal/proposals/{proposal_id}/apply")
    assert queued.status_code == 200
    assert queued.json["id"] == approved["id"]
    assert client.post(f"/api/agent/internal/runs/{approved['id']}").json["status"] == "queued"

    insufficient = {**principal, "scopes": {"goals:read"}}
    monkeypatch.setattr(agent_internal_api, "_internal_principal", lambda _session: insufficient)
    missing_scope = client.post(
        f"/api/agent/internal/tasks/{task['id']}/proposals",
        json={"operations": [{
            "operation_id": "note-2",
            "type": "create_note",
            "data": {
                "content": "This write has no authorization.",
                "context_type": "root",
                "context_id": sample_ultimate_goal.id,
            },
        }]},
    )
    assert missing_scope.status_code == 403
    assert missing_scope.json["code"] == "insufficient_scope"


def test_internal_token_routes_use_adapter_validation(db_session, monkeypatch, client):
    from blueprints import agent_internal_api

    _enable_agent_flags(db_session)
    monkeypatch.setattr(config, "AGENT_ADAPTER_SHARED_SECRET", "adapter-secret")
    credential = SimpleNamespace(expires_at=dt.datetime(2030, 1, 1))
    grant = SimpleNamespace(scopes="goals:read notes:write")
    oauth_client = SimpleNamespace(client_id="client-1", client_name="Test adapter")
    user = SimpleNamespace(id="user-1")
    monkeypatch.setattr(
        agent_internal_api.AgentAccessService,
        "active_access_credential",
        lambda *_args, **_kwargs: (credential, grant, oauth_client, user),
    )
    verified = client.post(
        "/api/agent/internal/verify",
        json={"access_token": "delegated"},
        headers={"X-Fractal-Agent-Secret": "adapter-secret"},
    )
    assert verified.status_code == 200
    assert verified.json["active"] is True
    assert verified.json["scopes"] == ["goals:read", "notes:write"]

    monkeypatch.setattr(
        agent_internal_api.AgentAccessService,
        "exchange_for_internal_token",
        lambda _service, _token, secret: {
            "access_token": "internal" if secret == "adapter-secret" else "rejected",
            "expires_in": 60,
        },
    )
    exchanged = client.post(
        "/api/agent/internal/exchange",
        json={"access_token": "delegated"},
        headers={"X-Fractal-Agent-Secret": "adapter-secret"},
    )
    assert exchanged.json["access_token"] == "internal"
