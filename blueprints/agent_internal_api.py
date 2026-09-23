"""Adapter-authenticated execution API endpoints."""

import datetime as dt
from flask import jsonify, request
from pydantic import ValidationError
from blueprints.api_utils import get_db_session
from config import config
from services.agent_access_service import AgentAccessError, AgentAccessService, _scope_set
from services.agent_harness_service import AgentHarnessError, AgentHarnessService
from services.agent_operation_registry import OPERATION_REGISTRY
from blueprints.agent_api_common import (
    agent_internal_bp,
    agent_database_boundary,
    _json_error,
    _require_enabled,
    _internal_principal,
    _internal_secret,
    _require_internal_scopes,
)
from validators.agent import AgentProposalSchema

@agent_internal_bp.post("/verify")
def internal_verify_agent_token():
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        body = request.get_json(silent=True) or {}
        active = AgentAccessService(db_session).active_access_credential(
            body.get("access_token"),
            expected_audience=config.AGENT_MCP_RESOURCE_URI,
        )
        if not active:
            return jsonify({"active": False}), 401
        credential, grant, client, user = active
        if not AgentAccessService(db_session).verify_adapter_secret(_internal_secret()):
            return jsonify({"active": False}), 401
        return jsonify({
            "active": True,
            "user_id": user.id,
            "client_id": client.client_id,
            "client_name": client.client_name,
            "scopes": sorted(_scope_set(grant.scopes)),
            "expires_at": int(credential.expires_at.replace(tzinfo=dt.timezone.utc).timestamp()),
        })
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()

@agent_internal_bp.post("/exchange")
def internal_exchange_agent_token():
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        body = request.get_json(silent=True) or {}
        token = body.get("access_token")
        payload = AgentAccessService(db_session).exchange_for_internal_token(token, _internal_secret())
        return jsonify(payload)
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()

@agent_internal_bp.post("/fractals")
def internal_list_fractals():
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        principal = _internal_principal(db_session)
        _require_internal_scopes(principal, "goals:read")
        return jsonify(AgentHarnessService(db_session).list_fractals(
            principal["user_id"],
            allowed_roots=principal["roots"],
        ))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()

@agent_internal_bp.post("/goal-context")
def internal_goal_context():
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        principal = _internal_principal(db_session)
        _require_internal_scopes(principal, "goals:read")
        body = request.get_json(silent=True) or {}
        return jsonify(AgentHarnessService(db_session).get_goal_context(
            principal["user_id"],
            body.get("root_id", ""),
            goals_offset=body.get("goals_offset", 0),
            activities_offset=body.get("activities_offset", 0),
            programs_offset=body.get("programs_offset", 0),
            templates_offset=body.get("templates_offset", 0),
            page_size=body.get("page_size"),
        )) if body.get("root_id") in principal["roots"] else (_json_error(
            AgentHarnessError("Fractal is outside the AI connection's allowed scope", 403, "root_forbidden")
        ))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()

@agent_internal_bp.post("/program-context")
def internal_program_context():
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        principal = _internal_principal(db_session)
        _require_internal_scopes(principal, "goals:read")
        body = request.get_json(silent=True) or {}
        root_id = body.get("root_id", "")
        if root_id not in principal["roots"]:
            return _json_error(AgentHarnessError(
                "Fractal is outside the AI connection's allowed scope", 403, "root_forbidden",
            ))
        return jsonify(AgentHarnessService(db_session).get_program_context(
            principal["user_id"],
            root_id,
            offset=body.get("offset", 0),
            limit=body.get("limit", 50),
            program_id=body.get("program_id"),
            block_offset=body.get("block_offset", 0),
            block_id=body.get("block_id"),
            day_offset=body.get("day_offset", 0),
            day_id=body.get("day_id"),
            templates_offset=body.get("templates_offset", 0),
        ))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()

@agent_internal_bp.post("/tasks/<task_id>")
def internal_get_task(task_id):
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        principal = _internal_principal(db_session)
        _require_internal_scopes(principal, "goals:read")
        return jsonify(AgentHarnessService(db_session).get_task(
            principal["user_id"],
            task_id,
            grant_id=principal["grant_id"],
            allowed_roots=principal["roots"],
        ))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()

@agent_internal_bp.post("/tasks/<task_id>/proposals")
@agent_database_boundary("Failed to create AI proposal")
def internal_create_proposal(task_id):
    db_session = get_db_session()
    try:
        _require_enabled(db_session, writes=True)
        principal = _internal_principal(db_session)
        body = request.get_json(silent=True) or {}
        proposal = AgentProposalSchema.model_validate(body)
        required = {
            OPERATION_REGISTRY[operation.type]["scope"]
            for operation in proposal.operations
        }
        _require_internal_scopes(principal, *required)
        return jsonify(AgentHarnessService(db_session).create_proposal(
            principal["user_id"],
            task_id,
            body,
            grant_id=principal["grant_id"],
            allowed_roots=principal["roots"],
        )), 201
    except ValidationError as error:
        return jsonify({"error": "validation_failed", "details": error.errors()}), 400
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()

@agent_internal_bp.post("/proposals/<proposal_id>")
def internal_get_proposal(proposal_id):
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        principal = _internal_principal(db_session)
        _require_internal_scopes(principal, "goals:read")
        return jsonify(AgentHarnessService(db_session).get_proposal(
            principal["user_id"],
            proposal_id,
            allowed_roots=principal["roots"],
        ))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()

@agent_internal_bp.post("/proposals/<proposal_id>/apply")
@agent_database_boundary("Failed to queue approved AI proposal")
def internal_apply_proposal(proposal_id):
    db_session = get_db_session()
    try:
        _require_enabled(db_session, writes=True)
        principal = _internal_principal(db_session)
        _require_internal_scopes(principal, "goals:read")
        proposal = AgentHarnessService(db_session).get_proposal(
            principal["user_id"],
            proposal_id,
            allowed_roots=principal["roots"],
        )
        _require_internal_scopes(
            principal,
            *{OPERATION_REGISTRY[operation["type"]]["scope"] for operation in proposal["operations"]},
        )
        return jsonify(AgentHarnessService(db_session).queue_approved_proposal(
            proposal_id,
            principal["user_id"],
        ))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()

@agent_internal_bp.post("/runs/<run_id>")
def internal_get_run(run_id):
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        principal = _internal_principal(db_session)
        _require_internal_scopes(principal, "goals:read")
        return jsonify(AgentHarnessService(db_session).get_run(
            principal["user_id"],
            run_id,
            allowed_roots=principal["roots"],
        ))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()
