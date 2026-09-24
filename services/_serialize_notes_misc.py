"""Serializers for users, notes, dashboards, page layouts, and event logs.
"""

from account_tiers import DEFAULT_ACCOUNT_TIER
from config import config
from models import _safe_load_json
from .account_flags import must_change_password as _must_change_password
from .goal_type_utils import get_canonical_goal_type
from .session_runtime import get_session_template_color, get_session_template_name
from services._serialize_common import calculate_smart_status, format_utc


def serialize_user(user):
    """Serialize a User object."""
    terms_version = getattr(user, "terms_accepted_version", None)
    privacy_version = getattr(user, "privacy_accepted_version", None)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
        "role": getattr(user, "role", "user") or "user",
        "is_admin": bool(getattr(user, "is_admin", False)),
        "preferences": _safe_load_json(user.preferences, {}),
        "must_change_password": _must_change_password(user),
        "membership_tier": getattr(user, "membership_tier", DEFAULT_ACCOUNT_TIER) or DEFAULT_ACCOUNT_TIER,
        "subscription_status": getattr(user, "subscription_status", "none") or "none",
        "paid_amount_cad_cents": getattr(user, "paid_amount_cad_cents", None),
        "storage_limit_bytes": getattr(user, "storage_limit_bytes", None),
        "last_login_at": format_utc(getattr(user, "last_login_at", None)),
        # Shown in Settings -> Legal so a user can see exactly what they
        # agreed to and when, and used to detect a pending re-acceptance.
        "legal_acceptance": {
            "terms": {
                "version": getattr(user, "terms_accepted_version", None),
                "accepted_at": format_utc(getattr(user, "terms_accepted_at", None)),
            },
            "privacy": {
                "version": getattr(user, "privacy_accepted_version", None),
                "accepted_at": format_utc(getattr(user, "privacy_accepted_at", None)),
            },
        },
        "legal_acceptance_required": (
            terms_version != config.TERMS_VERSION
            or privacy_version != config.PRIVACY_VERSION
        ),
        "erasure_requested_at": format_utc(getattr(user, "erasure_requested_at", None)),
        "created_at": format_utc(user.created_at)
    }


def serialize_note(note):
    """Serialize a Note object."""
    note_kind = getattr(note, "note_kind", None)
    activity_set = getattr(note, "activity_set", None)
    set_index = activity_set.sort_order if activity_set is not None else None
    resolved_note_type = derive_note_type(
        note.context_type,
        set_index,
        note_kind=note_kind,
        activity_set_id=getattr(note, "activity_set_id", None),
    )
    result = {
        "id": note.id,
        "context_type": note.context_type,
        "context_id": note.context_id,
        "session_id": note.session_id,
        "activity_instance_id": note.activity_instance_id,
        "activity_definition_id": note.activity_definition_id,
        "set_index": set_index,
        "activity_set_id": getattr(note, "activity_set_id", None),
        "content": note.content,
        "note_kind": note_kind,
        "note_type": resolved_note_type,
        "note_type_label": note_type_label(resolved_note_type),
        "created_at": format_utc(note.created_at),
        "updated_at": format_utc(note.updated_at),
        "goal_id": note.goal_id,
        "agent_grant_id": getattr(note, "agent_grant_id", None),
        "agent_run_id": getattr(note, "agent_run_id", None),
        "pinned_at": format_utc(note.pinned_at) if note.pinned_at else None,
        "is_pinned": note.pinned_at is not None,
    }
    return result


def derive_note_type(context_type, set_index=None, note_kind=None, activity_set_id=None):
    """Derive a semantic note type from the stored note context."""
    if context_type == "goal" and note_kind == "goal_completion":
        return "goal_completion_note"
    if context_type == "root":
        return "fractal_note"
    if context_type == "goal":
        return "goal_note"
    if context_type == "session":
        return "session_note"
    if context_type == "program":
        return "program_note"
    if context_type == "activity_definition":
        return "activity_definition_note"
    if context_type == "activity_instance":
        return "activity_set_note" if set_index is not None or activity_set_id else "activity_instance_note"
    if context_type == "circuit_run":
        return "circuit_run_note"
    if context_type == "circuit_round":
        return "circuit_round_note"
    return "note"


def note_type_label(note_type):
    labels = {
        "fractal_note": "Fractal Note",
        "goal_note": "Goal Note",
        "session_note": "Session Note",
        "program_note": "Program Note",
        "activity_instance_note": "Activity Instance Note",
        "activity_set_note": "Activity Set Note",
        "activity_definition_note": "Activity Definition Note",
        "circuit_run_note": "Activity Circuit Note",
        "circuit_round_note": "Circuit Round Note",
        "goal_completion_note": "Goal Completion Note",
        "note": "Note",
    }
    return labels.get(note_type, "Note")


def serialize_note_display(note):
    """Serialize a note with the display context used on note-dedicated surfaces."""
    result = serialize_note(note)

    if note.session:
        result["session_name"] = note.session.name
        result["session_date"] = format_utc(note.session.session_start or note.session.created_at)
        session_attrs = _safe_load_json(getattr(note.session, "attributes", None), {})
        session_data = session_attrs.get("session_data") if isinstance(session_attrs, dict) else {}
        if not isinstance(session_data, dict):
            session_data = {}
        template_name = get_session_template_name(note.session)
        result["session_template_name"] = template_name or note.session.name
        template_color = get_session_template_color(note.session)
        if template_color:
            result["session_template_color"] = template_color

    display_goal = note.goal
    if display_goal:
        result["goal_name"] = display_goal.name
        result["goal_type"] = get_canonical_goal_type(display_goal)
        result["goal_is_smart"] = bool(all(calculate_smart_status(display_goal).values()))

    if note.activity_definition:
        result["activity_definition_name"] = note.activity_definition.name

    return result


def serialize_analytics_dashboard(dashboard):
    """Serialize an AnalyticsDashboard object."""
    return {
        "id": dashboard.id,
        "root_id": dashboard.root_id,
        "user_id": dashboard.user_id,
        "name": dashboard.name,
        "kind": dashboard.kind or "dashboard",
        "layout": dashboard.layout,
        "created_at": format_utc(dashboard.created_at),
        "updated_at": format_utc(dashboard.updated_at),
    }


def serialize_page_surface_layout(layout):
    """Serialize a PageSurfaceLayout object."""
    return {
        "id": layout.id,
        "root_id": layout.root_id,
        "user_id": layout.user_id,
        "page": layout.page,
        "name": layout.name,
        "is_default": bool(layout.is_default),
        "desktop_config": layout.desktop_config,
        "mobile_config": layout.mobile_config,
        "created_at": format_utc(layout.created_at),
        "updated_at": format_utc(layout.updated_at),
    }


def serialize_event_log(log):
    """Serialize an EventLog object."""
    return {
        "id": log.id,
        "event_type": log.event_type,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "description": log.description,
        "payload": log.payload,
        "source": log.source,
        "timestamp": format_utc(log.timestamp)
    }
