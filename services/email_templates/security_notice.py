from html import escape

SUPPORT_CONTACT = "support@fractalgoals.com"


def render_password_changed_email() -> dict[str, str]:
    subject = "Your Fractal Goals password was changed"
    text = (
        "Your Fractal Goals password was changed\n\n"
        "If you made this change, no action is needed.\n\n"
        f"If you did not change your password, contact {SUPPORT_CONTACT} immediately."
    )
    html = f"""
    <p>Your Fractal Goals password was changed.</p>
    <p>If you made this change, no action is needed.</p>
    <p>If you did not change your password, contact
    <a href="mailto:{SUPPORT_CONTACT}">{SUPPORT_CONTACT}</a> immediately.</p>
    """.strip()
    return {"subject": subject, "text": text, "html": html}


def render_email_changed_email(new_email: str) -> dict[str, str]:
    safe_new_email = escape(new_email)
    subject = "Your Fractal Goals account email was changed"
    text = (
        "Your Fractal Goals account email was changed\n\n"
        f"The email address on your account is now: {new_email}\n\n"
        "If you made this change, no action is needed.\n\n"
        f"If you did not change your account email, contact {SUPPORT_CONTACT} immediately."
    )
    html = f"""
    <p>The email address on your Fractal Goals account was changed to
    <strong>{safe_new_email}</strong>.</p>
    <p>If you made this change, no action is needed.</p>
    <p>If you did not change your account email, contact
    <a href="mailto:{SUPPORT_CONTACT}">{SUPPORT_CONTACT}</a> immediately.</p>
    """.strip()
    return {"subject": subject, "text": text, "html": html}
