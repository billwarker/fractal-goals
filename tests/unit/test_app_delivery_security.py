"""Production delivery boundaries for assets and browser security policy."""

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


def test_vite_shell_supplies_the_talisman_nonce_template():
    shell = (Path(__file__).parents[2] / "client" / "index.html").read_text()
    assert 'nonce="{{ csp_nonce() }}"' in shell
