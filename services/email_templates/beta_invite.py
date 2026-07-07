from html import escape


def render_beta_invite_email(signup_url: str, use_case: str | None = None) -> dict[str, str]:
    safe_url = escape(signup_url, quote=True)
    subject = "Your Fractal Goals private beta invite"
    goal_line = f"\n\nYou mentioned: {use_case}" if use_case else ""
    text = (
        "Your Fractal Goals private beta invite is ready.\n\n"
        "Use this link to create your account:\n"
        f"{signup_url}"
        f"{goal_line}\n\n"
        "This invite is single-use. If you need help, reply to this email."
    )
    html_goal = f"<p>You mentioned: {escape(use_case)}</p>" if use_case else ""
    html = f"""
    <p>Your Fractal Goals private beta invite is ready.</p>
    <p><a href="{safe_url}">Create your account</a></p>
    {html_goal}
    <p>This invite is single-use. If you need help, reply to this email.</p>
    """.strip()
    return {"subject": subject, "text": text, "html": html}
