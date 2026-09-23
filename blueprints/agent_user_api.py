"""First-party task, review, and connection endpoints."""

from flask import jsonify, request
from pydantic import ValidationError

from blueprints.agent_api_common import (
    agent_bp,
    agent_database_boundary,
    _json_error,
    _require_enabled,
    _require_review_enabled,
)
from blueprints.api_utils import get_db_session
from blueprints.auth_api import token_required
from models import AgentEmbeddedConversation, AgentProposal, AgentTaskBrief
from services.agent_access_service import AgentAccessError, AgentAccessService
from services.agent_embedded_service import AgentEmbeddedService
from services.agent_harness_service import AgentHarnessError, AgentHarnessService
from validators.agent import AgentApprovalSchema


@agent_bp.get("/connections")
@token_required
def list_agent_connections(current_user):
    db_session = get_db_session()
    try:
        return jsonify({"items": AgentAccessService(db_session).list_grants(current_user.id)})
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.delete("/connections/<grant_id>")
@token_required
@agent_database_boundary("Failed to revoke AI connection")
def revoke_agent_connection(current_user, grant_id):
    db_session = get_db_session()
    try:
        return jsonify(AgentAccessService(db_session).revoke_grant(current_user.id, grant_id))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.post("/tasks")
@token_required
@agent_database_boundary("Failed to save AI task brief")
def create_agent_task(current_user):
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        data = request.get_json(silent=True) or {}
        payload = AgentHarnessService(db_session).create_task(
            current_user.id,
            data,
            grant_id=data.get("grant_id"),
        )
        return jsonify(payload), 201
    except ValidationError as error:
        return jsonify({"error": "validation_failed", "details": error.errors()}), 400
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.get("/context/<root_id>")
@token_required
@agent_database_boundary("Failed to load AI task context")
def get_first_party_agent_context(current_user, root_id):
    """Load bounded, owned entity choices for an authenticated task brief."""
    db_session = get_db_session()
    try:
        _require_enabled(db_session)
        return jsonify(AgentHarnessService(db_session).get_goal_context(
            current_user.id,
            root_id,
            goals_offset=request.args.get("goals_offset", 0, type=int),
            activities_offset=request.args.get("activities_offset", 0, type=int),
            programs_offset=request.args.get("programs_offset", 0, type=int),
            templates_offset=request.args.get("templates_offset", 0, type=int),
            page_size=request.args.get("page_size", type=int),
        ))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.get("/tasks")
@token_required
@agent_database_boundary("Failed to list AI task briefs")
def list_agent_tasks(current_user):
    db_session = get_db_session()
    try:
        _require_review_enabled(db_session)
        root_id = request.args.get("root_id")
        task_query = db_session.query(AgentTaskBrief).filter(AgentTaskBrief.user_id == current_user.id)
        if root_id:
            AgentHarnessService(db_session)._root(root_id, current_user.id)
            task_query = task_query.filter(AgentTaskBrief.root_id == root_id)
        rows = task_query.order_by(AgentTaskBrief.created_at.desc()).limit(51).all()
        return jsonify({
            "items": [AgentHarnessService.serialize_task(row) for row in rows[:50]],
            "truncated": len(rows) > 50,
        })
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.get("/tasks/<task_id>")
@token_required
def get_agent_task(current_user, task_id):
    db_session = get_db_session()
    try:
        _require_review_enabled(db_session)
        return jsonify(AgentHarnessService(db_session).get_task(current_user.id, task_id))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.get("/tasks/<task_id>/proposals")
@token_required
def list_task_proposals(current_user, task_id):
    db_session = get_db_session()
    try:
        _require_review_enabled(db_session)
        task = db_session.query(AgentTaskBrief).filter_by(
            id=task_id,
            user_id=current_user.id,
        ).first()
        if not task:
            raise AgentHarnessError("Task not found", 404, "not_found")
        proposals = db_session.query(AgentProposal).filter_by(
            task_id=task.id,
            user_id=current_user.id,
        ).order_by(AgentProposal.revision.desc()).limit(50).all()
        service = AgentHarnessService(db_session)
        return jsonify({"items": [service.serialize_proposal(row) for row in proposals]})
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.post("/proposals/<proposal_id>/decision")
@token_required
@agent_database_boundary("Failed to decide AI proposal")
def decide_agent_proposal(current_user, proposal_id):
    db_session = get_db_session()
    try:
        _require_review_enabled(db_session, writes=True)
        data = AgentApprovalSchema.model_validate(request.get_json(silent=True) or {})
        payload = AgentHarnessService(db_session).decide_proposal(
            current_user.id,
            proposal_id,
            data.proposal_hash,
            data.decision,
        )
        return jsonify(payload)
    except ValidationError as error:
        return jsonify({"error": "validation_failed", "details": error.errors()}), 400
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.get("/runs")
@token_required
@agent_database_boundary("Failed to list AI runs")
def list_agent_runs(current_user):
    db_session = get_db_session()
    try:
        _require_review_enabled(db_session)
        payload = AgentHarnessService(db_session).list_runs(
            current_user.id,
            root_id=request.args.get("root_id"),
            limit=request.args.get("limit", 50, type=int),
        )
        return jsonify(payload)
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.get("/runs/<run_id>")
@token_required
def get_agent_run(current_user, run_id):
    db_session = get_db_session()
    try:
        _require_review_enabled(db_session)
        return jsonify(AgentHarnessService(db_session).get_run(current_user.id, run_id))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.post("/runs/<run_id>/cancel")
@token_required
def cancel_agent_run(current_user, run_id):
    db_session = get_db_session()
    try:
        _require_review_enabled(db_session)
        return jsonify(AgentHarnessService(db_session).request_cancel(current_user.id, run_id))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.post("/runs/<run_id>/undo-proposal")
@token_required
@agent_database_boundary("Failed to create reviewed inverse proposal")
def create_agent_run_undo_proposal(current_user, run_id):
    db_session = get_db_session()
    try:
        _require_review_enabled(db_session, writes=True)
        return jsonify(AgentHarnessService(db_session).create_undo_proposal(current_user.id, run_id)), 201
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.get("/changes/<root_id>")
@token_required
def get_agent_change_cursor(current_user, root_id):
    db_session = get_db_session()
    try:
        _require_review_enabled(db_session)
        return jsonify(AgentHarnessService(db_session).get_change_cursor(current_user.id, root_id))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.get("/embedded/providers")
@token_required
def list_embedded_agent_providers(current_user):
    db_session = get_db_session()
    try:
        return jsonify(AgentEmbeddedService(db_session).available_providers())
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.get("/embedded/conversations")
@token_required
def list_embedded_agent_conversations(current_user):
    db_session = get_db_session()
    try:
        root_id = request.args.get("root_id", "")
        return jsonify(AgentEmbeddedService(db_session).list_conversations(current_user.id, root_id))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.post("/embedded/conversations")
@token_required
@agent_database_boundary("Failed to start embedded AI conversation")
def start_embedded_agent_conversation(current_user):
    db_session = get_db_session()
    try:
        body = request.get_json(silent=True) or {}
        return jsonify(AgentEmbeddedService(db_session).start_turn(
            current_user.id,
            root_id=body.get("root_id"),
            provider=body.get("provider"),
            message=body.get("message"),
            timezone=body.get("timezone", "UTC"),
        )), 202
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.get("/embedded/conversations/<conversation_id>")
@token_required
def get_embedded_agent_conversation(current_user, conversation_id):
    db_session = get_db_session()
    try:
        try:
            page_size = int(request.args.get("limit", 50))
        except (TypeError, ValueError):
            raise AgentHarnessError("limit must be an integer", 400, "invalid_limit")
        return jsonify(AgentEmbeddedService(db_session).get_conversation(
            current_user.id,
            conversation_id,
            before=request.args.get("before"),
            limit=page_size,
        ))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.post("/embedded/conversations/<conversation_id>/messages")
@token_required
@agent_database_boundary("Failed to queue embedded AI message")
def send_embedded_agent_message(current_user, conversation_id):
    db_session = get_db_session()
    try:
        body = request.get_json(silent=True) or {}
        conversation = db_session.query(AgentEmbeddedConversation).filter_by(
            id=conversation_id, user_id=current_user.id,
        ).first()
        if not conversation:
            raise AgentHarnessError("Conversation not found", 404, "not_found")
        return jsonify(AgentEmbeddedService(db_session).start_turn(
            current_user.id,
            root_id=conversation.root_id,
            provider=conversation.provider,
            message=body.get("message"),
            conversation_id=conversation.id,
        )), 202
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()


@agent_bp.post("/embedded/runs/<run_id>/cancel")
@token_required
def cancel_embedded_agent_run(current_user, run_id):
    db_session = get_db_session()
    try:
        return jsonify(AgentEmbeddedService(db_session).cancel(current_user.id, run_id))
    except (AgentHarnessError, AgentAccessError) as error:
        return _json_error(error)
    finally:
        db_session.close()
