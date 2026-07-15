"""Greppable operational log events.

Every operationally interesting event is emitted as a single log line on the
``fractal.ops`` logger in ``key=value`` form:

    ops_event=auth.login_failed user_id=... reason=bad_password

Grep contract (stable event names):

- ``auth.login_failed``            reason=unknown_user|disabled|locked|bad_password
- ``auth.password_reset_requested`` / ``auth.password_reset_completed``
- ``email.invite_sent`` / ``email.invite_failed``
- ``email.webhook_rejected`` / ``email.webhook_error``
- ``beta.signup_created`` / ``beta.signup_status_changed``
- ``quota.denied``
- ``http.rate_limited``
- ``http.server_error``
- ``landing.publish_delivered`` / ``landing.publish_failed``

Values are sanitized: never log secrets, passwords, tokens, or email bodies.
Prefer ``user_id`` over email except operator-facing invite/beta events where
the email address is the natural key.
"""
import logging

logger = logging.getLogger("fractal.ops")

_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}


def _sanitize_value(value) -> str:
    if value is None:
        return "-"
    text = str(value)
    # Keep one event per line and keep key=value parsing trivial.
    text = text.replace("\n", " ").replace("\r", " ").replace('"', "'")
    if len(text) > 200:
        text = text[:200]
    if " " in text or "=" in text:
        return f'"{text}"'
    return text


def log_ops_event(event: str, level: str = "info", **fields) -> None:
    """Emit one greppable ops event line; never raises."""
    try:
        parts = [f"ops_event={event}"]
        parts.extend(f"{key}={_sanitize_value(value)}" for key, value in fields.items())
        logger.log(_LEVELS.get(level, logging.INFO), " ".join(parts))
    except Exception:  # pragma: no cover - logging must never break a request
        logging.getLogger(__name__).exception("Failed to emit ops event %s", event)
