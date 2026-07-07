from html import escape


def render_password_reset_email(reset_url: str) -> dict[str, str]:
    safe_url = escape(reset_url, quote=True)
    subject = "Reset your Fractal Goals password"
    text = (
        "Reset your Fractal Goals password\n\n"
        "Use this link to choose a new password. It expires in 60 minutes:\n"
        f"{reset_url}\n\n"
        "If you did not request this, you can ignore this email."
    )
    html = f"""
    <p>Use this link to choose a new Fractal Goals password. It expires in 60 minutes.</p>
    <p><a href="{safe_url}">Reset your password</a></p>
    <p>If you did not request this, you can ignore this email.</p>
    """.strip()
    return {"subject": subject, "text": text, "html": html}
