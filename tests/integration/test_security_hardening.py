import json
from pathlib import Path

import pytest

from config import Config


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_oversized_json_payload_is_rejected(client):
    payload = {'username_or_email': 'x' * (2 * 1024 * 1024), 'password': 'Password123'}

    response = client.post(
        '/api/auth/login',
        data=json.dumps(payload),
        content_type='application/json',
    )

    assert response.status_code == 413


def test_cloudbuild_sets_private_beta_production_security_env():
    cloudbuild = (PROJECT_ROOT / 'cloudbuild.yaml').read_text()

    assert 'FLASK_ENV=production' in cloudbuild
    assert 'FLASK_DEBUG=false' in cloudbuild
    assert "'--build-arg', 'VITE_API_URL=/api'" in cloudbuild
    assert 'BACKEND_URL=https://fractal-backend-195572181270.us-east1.run.app' in cloudbuild
    assert 'AUTH_COOKIE_SAMESITE=Strict' in cloudbuild
    assert 'RATELIMIT_STORAGE_URI=memory://' in cloudbuild
    assert 'ALLOW_IN_MEMORY_RATELIMIT=true' in cloudbuild
    assert 'WEB_CONCURRENCY=1' in cloudbuild
    assert "'--max-instances', '1'" in cloudbuild
    assert 'LANDING_EXAMPLES_MAX_UNCOMPRESSED_BYTES=4000000' in cloudbuild
    assert 'LANDING_EXAMPLES_MAX_COMPRESSED_BYTES=500000' in cloudbuild


def test_cloudbuild_does_not_bake_cross_site_api_url_into_frontend():
    cloudbuild = (PROJECT_ROOT / 'cloudbuild.yaml').read_text()

    assert 'VITE_API_URL=https://fractal-backend' not in cloudbuild


def test_production_security_accepts_explicit_single_worker_private_beta(monkeypatch):
    monkeypatch.setattr(Config, 'ENV', 'production')
    monkeypatch.setattr(Config, 'JWT_SECRET_KEY', 'test-secret')
    monkeypatch.setattr(Config, 'DEBUG', False)
    monkeypatch.setattr(Config, 'CORS_ORIGINS', ['https://my.fractalgoals.com'])
    monkeypatch.setattr(Config, 'AUTH_COOKIE_SECURE', True)
    monkeypatch.setattr(Config, 'AUTH_COOKIE_SAMESITE', 'Strict')
    monkeypatch.setattr(Config, 'RATELIMIT_STORAGE_URI', 'memory://')
    monkeypatch.setattr(Config, 'ALLOW_IN_MEMORY_RATELIMIT', True)
    monkeypatch.setattr(Config, 'WEB_CONCURRENCY', 1)

    Config.check_production_security()


def test_production_security_rejects_multi_worker_memory_limiter(monkeypatch):
    monkeypatch.setattr(Config, 'ENV', 'production')
    monkeypatch.setattr(Config, 'JWT_SECRET_KEY', 'test-secret')
    monkeypatch.setattr(Config, 'DEBUG', False)
    monkeypatch.setattr(Config, 'CORS_ORIGINS', ['https://my.fractalgoals.com'])
    monkeypatch.setattr(Config, 'AUTH_COOKIE_SECURE', True)
    monkeypatch.setattr(Config, 'AUTH_COOKIE_SAMESITE', 'Strict')
    monkeypatch.setattr(Config, 'RATELIMIT_STORAGE_URI', 'memory://')
    monkeypatch.setattr(Config, 'ALLOW_IN_MEMORY_RATELIMIT', True)
    monkeypatch.setattr(Config, 'WEB_CONCURRENCY', 2)

    with pytest.raises(ValueError, match='WEB_CONCURRENCY=1'):
        Config.check_production_security()


def test_production_cors_allows_csrf_header(client):
    response = client.options(
        '/api/auth/refresh',
        headers={
            'Origin': 'http://localhost:5173',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,x-csrf-token',
        },
    )

    assert response.status_code in (200, 204)
    allowed_headers = response.headers.get('Access-Control-Allow-Headers', '').lower()
    assert 'x-csrf-token' in allowed_headers


def test_production_cors_exposes_csrf_header(client):
    response = client.options(
        '/api/auth/csrf',
        headers={
            'Origin': 'http://localhost:5173',
            'Access-Control-Request-Method': 'GET',
        },
    )

    assert response.status_code in (200, 204)
    exposed_headers = response.headers.get('Access-Control-Expose-Headers', '').lower()
    assert 'x-csrf-token' in exposed_headers
