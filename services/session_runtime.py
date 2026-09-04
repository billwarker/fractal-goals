import models

DEFAULT_TEMPLATE_COLOR = '#4A90E2'
SESSION_TYPE_NORMAL = 'normal'
SESSION_TYPE_QUICK = 'quick'
VALID_SESSION_TYPES = {SESSION_TYPE_NORMAL, SESSION_TYPE_QUICK}


def normalize_session_type(value):
    if not isinstance(value, str):
        return SESSION_TYPE_NORMAL
    lowered = value.strip().lower()
    if lowered in VALID_SESSION_TYPES:
        return lowered
    return SESSION_TYPE_NORMAL


def get_template_session_type(template_data):
    if not isinstance(template_data, dict):
        return SESSION_TYPE_NORMAL
    return normalize_session_type(template_data.get('session_type'))


def get_template_color(template_data):
    template_data = models._safe_load_json(template_data, {})
    if not isinstance(template_data, dict):
        return None
    color = template_data.get('template_color')
    if isinstance(color, str) and color.strip():
        return color.strip()
    return None


def get_session_runtime_data(session):
    attrs = models._safe_load_json(getattr(session, 'attributes', None), {})
    if not isinstance(attrs, dict):
        return {}

    session_data = attrs.get('session_data')
    if isinstance(session_data, dict):
        return session_data
    return attrs


def get_session_template_name(session):
    """Resolve the historical display name, falling back to the linked template."""
    snapshot_name = get_session_runtime_data(session).get('template_name')
    if isinstance(snapshot_name, str) and snapshot_name.strip():
        return snapshot_name.strip()

    template_name = getattr(getattr(session, 'template', None), 'name', None)
    if isinstance(template_name, str) and template_name.strip():
        return template_name.strip()
    return None


def get_session_template_color(session):
    """Resolve presentation color from the live template, then the session snapshot."""
    template_data = models._safe_load_json(
        getattr(getattr(session, 'template', None), 'template_data', None),
        {},
    )
    current_color = get_template_color(template_data)
    if current_color:
        return current_color
    return get_template_color(get_session_runtime_data(session))


def is_quick_session(session) -> bool:
    return normalize_session_type(get_session_runtime_data(session).get('session_type')) == SESSION_TYPE_QUICK
