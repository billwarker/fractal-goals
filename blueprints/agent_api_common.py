"""Shared blueprints and authorization helpers for the AI harness routes."""

import logging
from functools import wraps

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import SQLAlchemyError
from services.agent_access_service import AgentAccessService
from services.agent_harness_service import AgentHarnessError
from services.feature_flag_service import FeatureFlagService

agent_bp = Blueprint("agent", __name__, url_prefix="/api/agent")
agent_oauth_bp = Blueprint("agent_oauth", __name__, url_prefix="/api/agent/oauth")
agent_internal_bp = Blueprint("agent_internal", __name__, url_prefix="/api/agent/internal")
agent_metadata_bp = Blueprint("agent_metadata", __name__)
logger = logging.getLogger(__name__)


def _feature_flags(db_session):
    payload, error, _ = FeatureFlagService(db_session).get_flags()
    if error:
        return {}
    return payload.get("flags", {})


def _require_enabled(db_session, *, writes=False):
    flags = _feature_flags(db_session)
    if not flags.get("ai_agent_connectors", False):
        raise AgentHarnessError("AI connections are not enabled", 404, "feature_disabled")
    if writes and not flags.get("ai_agent_writes", False):
        raise AgentHarnessError("AI write proposals are not enabled", 404, "feature_disabled")


def _require_review_enabled(db_session, *, writes=False):
    flags = _feature_flags(db_session)
    if not (flags.get("ai_agent_connectors") or flags.get("ai_agent_embedded")):
        raise AgentHarnessError("AI assistance is not enabled", 404, "feature_disabled")
    if writes and not flags.get("ai_agent_writes", False):
        raise AgentHarnessError("AI write proposals are not enabled", 404, "feature_disabled")


def _json_error(error, status=None, code=None):
    return jsonify({"error": str(error), "code": code or getattr(error, "code", "invalid_request")}), (
        status or getattr(error, "status", 400)
    )


def agent_database_boundary(message):
    """Log database failures once and return the standard server error shape."""
    def decorate(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            try:
                return view(*args, **kwargs)
            except SQLAlchemyError:
                logger.exception(message)
                return jsonify({"error": "Internal server error"}), 500

        return wrapped

    return decorate


def _internal_secret():
    return request.headers.get("X-Fractal-Agent-Secret", "")


def _internal_principal(db_session):
    header = request.headers.get("Authorization", "")
    token = header[7:] if header.startswith("Bearer ") else ""
    return AgentAccessService(db_session).verify_internal_token(token, _internal_secret())


def _require_internal_scopes(principal, *scopes):
    missing = set(scopes) - principal["scopes"]
    if missing:
        raise AgentHarnessError(
            "Missing delegated permission: " + ", ".join(sorted(missing)),
            403,
            "insufficient_scope",
        )
