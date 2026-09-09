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
