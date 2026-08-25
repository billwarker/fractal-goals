from html import escape

SUPPORT_CONTACT = "support@fractalgoals.com"


def render_account_erasure_requested_email(scheduled_date: str, grace_days: int) -> dict[str, str]:
    """
    Confirms a scheduled account deletion.

    This email is the user's means of reversing an erasure they did not intend,
    so it must state the deadline plainly and say how to cancel.
    """
    safe_date = escape(scheduled_date)
    subject = "Your Fractal Goals account is scheduled for deletion"
    text = (
        "Your Fractal Goals account is scheduled for deletion\n\n"
        f"Your account remains accessible and will be permanently deleted on {scheduled_date} "
        f"({grace_days} days from your request).\n\n"
        "This will permanently remove your account and all of your goals, sessions, "
        "activities, programs and notes. It cannot be undone once it happens.\n\n"
        "You can cancel from Account Settings before that date. If you cannot access your account, "
        f"contact {SUPPORT_CONTACT}."
    )
    html = f"""
    <p>Your Fractal Goals account remains accessible and is scheduled for
    permanent deletion on <strong>{safe_date}</strong> ({grace_days} days from
    your request).</p>
    <p>This will permanently remove your account and all of your goals, sessions,
    activities, programs and notes. It cannot be undone once it happens.</p>
    <p>You can cancel from Account Settings before that date. If you cannot
    access your account, contact <a href="mailto:{SUPPORT_CONTACT}">{SUPPORT_CONTACT}</a>.</p>
    """.strip()
    return {"subject": subject, "text": text, "html": html}
