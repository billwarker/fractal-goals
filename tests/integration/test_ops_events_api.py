import json
import logging

import pytest


@pytest.mark.integration
def test_failed_login_emits_ops_event(client, test_user, caplog):
    caplog.set_level(logging.WARNING, logger="fractal.ops")

    response = client.post(
        '/api/auth/login',
        data=json.dumps({'username_or_email': 'testuser', 'password': 'WrongPassword1'}),
        content_type='application/json',
    )

    assert response.status_code == 401
    ops_lines = [r.message for r in caplog.records if r.name == 'fractal.ops']
    assert any('ops_event=auth.login_failed' in line and 'reason=bad_password' in line for line in ops_lines)


@pytest.mark.integration
def test_rate_limit_handler_returns_json_and_logs(app, client, caplog):
    caplog.set_level(logging.WARNING, logger="fractal.ops")

    from flask import abort

    @app.route('/test-rate-limited')
    def _rate_limited_route():
        abort(429)

    response = client.get('/test-rate-limited')

    assert response.status_code == 429
    payload = response.get_json()
    assert payload['code'] == 'rate_limited'
    ops_lines = [r.message for r in caplog.records if r.name == 'fractal.ops']
    assert any('ops_event=http.rate_limited' in line for line in ops_lines)


@pytest.mark.integration
def test_beta_signup_created_emits_ops_event(client, caplog):
    caplog.set_level(logging.INFO, logger="fractal.ops")

    response = client.post('/api/public/beta-signups', json={'email': 'ops@test.example'})

    assert response.status_code == 201
    ops_lines = [r.message for r in caplog.records if r.name == 'fractal.ops']
    assert any('ops_event=beta.signup_created' in line and 'ops@test.example' in line for line in ops_lines)
