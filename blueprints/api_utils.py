import hashlib
import json

from flask import jsonify, request, make_response

from models import Goal, validate_root_goal


def require_owned_root(db_session, root_id: str, user_id: str):
    """Return root if owned by user, else None."""
    return validate_root_goal(db_session, root_id, owner_id=user_id)


def get_goal_in_root(db_session, root_id: str, goal_id: str):
    """Fetch a non-deleted goal scoped to a root."""
    return db_session.query(Goal).filter(
        Goal.id == goal_id,
        Goal.root_id == root_id,
        Goal.deleted_at.is_(None),
    ).first()


def internal_error(logger, message: str = "Internal server error"):
    logger.exception(message)
    return jsonify({"error": "Internal server error"}), 500


def parse_optional_pagination(req, *, max_limit: int = 200):
    """
    Parse optional pagination params from query string.
    Returns (limit, offset) where each may be None if not provided.
    """
    limit = req.args.get("limit")
    offset = req.args.get("offset")

    if limit is None and offset is None:
        return None, None

    try:
        limit_val = int(limit) if limit is not None else 50
        offset_val = int(offset) if offset is not None else 0
    except ValueError:
        return 50, 0

    limit_val = max(1, min(limit_val, max_limit))
    offset_val = max(0, offset_val)
    return limit_val, offset_val


def etag_json_response(payload, status: int = 200):
    """Return JSON response with a stable ETag.

    We intentionally avoid API-level 304 short-circuiting because several
    frontend flows rely on always receiving a JSON payload (and can surface
    stale UI state when a 304 empty response path is taken).
    """
    raw = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    etag = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    resp = make_response(jsonify(payload), status)
    resp.set_etag(etag)
    return resp
