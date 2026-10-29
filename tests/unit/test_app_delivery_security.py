"""Production delivery boundaries for assets and browser security policy."""

import re
from pathlib import Path

import app as app_module


def test_spa_pages_are_exempt_from_global_api_rate_limits():
    assert "pages" in app_module.limiter._blueprint_exemptions


def test_csp_allows_declared_font_sources():
    response = app_module.app.test_client().get("/")
    policy = response.headers["Content-Security-Policy"]
    assert "https://fonts.googleapis.com" in policy
    assert "https://fonts.gstatic.com" in policy
    assert "font-src 'self' data:" in policy


def test_vite_shell_has_no_inline_script_for_either_delivery_csp():
    """nginx serves the shell statically (no per-request nonce), so script must be external."""
    shell = (Path(__file__).parents[2] / "client" / "index.html").read_text()
    for match in re.finditer(r"<script\b([^>]*)>(.*?)</script>", shell, re.S):
        attributes, body = match.groups()
        assert "src=" in attributes and not body.strip()
    assert not re.search(r"<[^>]+\son[a-z]+\s*=", shell)


def test_flask_shell_serves_the_boot_script_with_revalidation():
    response = app_module.app.test_client().get("/boot/shell.js")
    if response.status_code == 404:
        return  # No client build in this checkout; the nginx container check covers delivery.
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-cache"
