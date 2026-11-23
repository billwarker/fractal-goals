"""The built client must support direct navigation and browser reloads."""

import pytest
from flask import Flask
from blueprints.pages import pages_bp


@pytest.mark.parametrize(
    "path",
    [
        "/root/goals",
        "/root/sessions",
        "/root/session/session-id",
        "/root/programs",
        "/root/programs/program-id",
        "/root/programs/program-id/blocks",
        "/root/analytics",
        "/root/notes",
        "/root/logs",
        "/root/create-session",
        "/root/manage-activities",
        "/root/manage-session-templates",
        "/admin",
        "/reset-password",
        "/terms",
        "/privacy",
        "/storage/connected",
    ],
)
def test_canonical_client_routes_serve_the_spa(path, tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text(
        '<html><head></head><body><div id="root"></div></body></html>'
    )
    monkeypatch.setattr("blueprints.pages.CLIENT_BUILD_DIR", str(tmp_path))
    app = Flask(__name__)
    app.register_blueprint(pages_bp)
    response = app.test_client().get(path)
    assert response.status_code == 200
    assert b'<div id="root">' in response.data
    assert b'name="viewport"' in response.data
    assert app.test_client().get("/api/unknown").status_code == 404


@pytest.mark.parametrize(
    "path",
    [
        "/favicon.svg",
        "/favicon-16.png",
        "/favicon-32.png",
        "/apple-touch-icon.png",
        "/icons/icon-192.png",
        "/icons/icon-maskable-512.png",
        "/workbox-2ff6bd68.js",
    ],
)
def test_precached_app_shell_files_are_served(path, tmp_path, monkeypatch):
    # The service worker never installs if any precached URL fails to load.
    (tmp_path / "icons").mkdir()
    (tmp_path / path.lstrip("/")).write_bytes(b"x")
    monkeypatch.setattr("blueprints.pages.CLIENT_BUILD_DIR", str(tmp_path))
    app = Flask(__name__)
    app.register_blueprint(pages_bp)
    assert app.test_client().get(path).status_code == 200
