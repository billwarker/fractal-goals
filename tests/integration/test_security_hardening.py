import json
from pathlib import Path

import pytest

from config import Config
from extensions import limiter
from request_identity import PROXY_TOKEN_HEADER
from tests.conftest import TEST_PROXY_SECRET


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
    assert 'TRUSTED_PROXY_HOPS=3' in cloudbuild
    assert cloudbuild.count('TRUSTED_PROXY_SECRET=TRUSTED_PROXY_SECRET:latest') == 2


def test_nginx_attests_every_api_proxy_location():
    nginx = (PROJECT_ROOT / 'client' / 'nginx.conf').read_text()

    assert nginx.count('proxy_pass ${BACKEND_URL};') == nginx.count(
        'proxy_set_header X-Fractal-Proxy-Token "${TRUSTED_PROXY_SECRET}";'
    ) == 2


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
    monkeypatch.setattr(Config, 'TRUSTED_PROXY_HOPS', 3)
    monkeypatch.setattr(Config, 'TRUSTED_PROXY_SECRET', 'p' * 32)

    Config.check_production_security()


def _private_beta_production(monkeypatch):
    monkeypatch.setattr(Config, 'ENV', 'production')
    monkeypatch.setattr(Config, 'JWT_SECRET_KEY', 'test-secret')
    monkeypatch.setattr(Config, 'DEBUG', False)
    monkeypatch.setattr(Config, 'CORS_ORIGINS', ['https://my.fractalgoals.com'])
    monkeypatch.setattr(Config, 'AUTH_COOKIE_SECURE', True)
    monkeypatch.setattr(Config, 'AUTH_COOKIE_SAMESITE', 'Strict')
    monkeypatch.setattr(Config, 'RATELIMIT_STORAGE_URI', 'memory://')
    monkeypatch.setattr(Config, 'ALLOW_IN_MEMORY_RATELIMIT', True)
    monkeypatch.setattr(Config, 'WEB_CONCURRENCY', 1)
    monkeypatch.setattr(Config, 'EMAIL_PROVIDER', 'disabled')
    monkeypatch.setattr(Config, 'TRUSTED_PROXY_HOPS', 3)
    monkeypatch.setattr(Config, 'TRUSTED_PROXY_SECRET', 'p' * 32)


def test_production_security_requires_trusted_proxy_hops(monkeypatch):
    _private_beta_production(monkeypatch)
    monkeypatch.setattr(Config, 'TRUSTED_PROXY_HOPS', 0)

    with pytest.raises(ValueError, match='TRUSTED_PROXY_HOPS'):
        Config.check_production_security()


@pytest.mark.parametrize('secret', ['', 'p' * 31])
def test_production_security_requires_strong_trusted_proxy_secret(monkeypatch, secret):
    _private_beta_production(monkeypatch)
    monkeypatch.setattr(Config, 'TRUSTED_PROXY_SECRET', secret)

    with pytest.raises(ValueError, match='TRUSTED_PROXY_SECRET'):
        Config.check_production_security()


def test_production_security_accepts_minimum_length_proxy_secret(monkeypatch):
    _private_beta_production(monkeypatch)

    Config.check_production_security()


def _proxied_login(client, client_ip, *, token=TEST_PROXY_SECRET):
    return client.post(
        '/api/auth/login',
        json={'username_or_email': 'nobody-here', 'password': 'Password123'},
        headers={
            'X-Forwarded-For': f'{client_ip}, 169.254.1.1, 34.1.1.1',
            PROXY_TOKEN_HEADER: token,
        },
        environ_base={'REMOTE_ADDR': '169.254.8.1'},
    )


def test_login_rate_limit_is_per_client_behind_the_attested_proxy(client):
    limiter.reset()
    statuses = [_proxied_login(client, '203.0.113.10').status_code for _ in range(10)]

    assert statuses == [401] * 10
    assert _proxied_login(client, '203.0.113.10').status_code == 429
    assert _proxied_login(client, '203.0.113.11').status_code == 401
    limiter.reset()


def test_forged_forwarded_chain_without_proxy_token_shares_the_connection_bucket(client):
    limiter.reset()
    statuses = [
        _proxied_login(client, f'198.51.100.{index}', token='forged').status_code
        for index in range(11)
    ]

    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429
    limiter.reset()


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
