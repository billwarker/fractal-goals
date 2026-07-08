from html import escape


def render_beta_invite_email(
    signup_url: str,
    use_case: str | None = None,
    invite_key: str | None = None,
) -> dict[str, str]:
    safe_url = escape(signup_url, quote=True)
    safe_invite_key = escape(invite_key) if invite_key else ""
    subject = "Your Fractal Goals private beta invite"
    goal_line = f"\n\nYou mentioned: {use_case}" if use_case else ""
    key_line = f"\n\nInvite key, if the link does not prefill it:\n{invite_key}" if invite_key else ""
    text = (
        "Your Fractal Goals private beta invite is ready.\n\n"
        "Use this link to create your account:\n"
        f"{signup_url}"
        f"{key_line}"
        f"{goal_line}\n\n"
        "Signup is invite-only and this key is single-use. If you need help, reply to this email."
    )
    html_goal = f"<p>You mentioned: {escape(use_case)}</p>" if use_case else ""
    html_invite_key = (
        f"<p>If the link does not prefill the invite key, copy this key into the signup form:</p>"
        f"<p><code>{safe_invite_key}</code></p>"
        if invite_key else ""
    )
    html = f"""
    <p>Your Fractal Goals private beta invite is ready.</p>
    <p><a href="{safe_url}">Create your account</a></p>
    {html_invite_key}
    {html_goal}
    <p>Signup is invite-only and this key is single-use. If you need help, reply to this email.</p>
    """.strip()
    return {"subject": subject, "text": text, "html": html}
