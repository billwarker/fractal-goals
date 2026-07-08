from sqlalchemy.exc import OperationalError

import blueprints.health_api as health_api


def test_health_returns_healthy(client):
    response = client.get('/health')

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['status'] == 'healthy'
    assert 'environment' in payload
    assert 'database_type' in payload


def test_api_healthz_returns_ok_without_database(client, monkeypatch):
    # Liveness must stay healthy even when the database is unreachable.
    def raise_operational_error():
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    monkeypatch.setattr(health_api, 'get_scoped_session', raise_operational_error)

    response = client.get('/api/healthz')

    assert response.status_code == 200
    assert response.get_json()['status'] == 'ok'


def test_api_readyz_ready_when_database_reachable(client):
    response = client.get('/api/readyz')

    assert response.status_code == 200
    assert response.get_json() == {'status': 'ready'}


def test_api_readyz_returns_503_when_database_unreachable(client, monkeypatch):
    def raise_operational_error():
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    monkeypatch.setattr(health_api, 'get_scoped_session', raise_operational_error)

    response = client.get('/api/readyz')

    assert response.status_code == 503
    # The response must not leak database error details.
    assert response.get_json() == {'status': 'unavailable', 'reason': 'database'}


def test_api_readyz_returns_503_when_query_fails(client, monkeypatch):
    class BrokenSession:
        def execute(self, *_args, **_kwargs):
            raise OperationalError("SELECT 1", {}, Exception("server closed the connection"))

    monkeypatch.setattr(health_api, 'get_scoped_session', lambda: BrokenSession())

    response = client.get('/api/readyz')

    assert response.status_code == 503
    assert response.get_json() == {'status': 'unavailable', 'reason': 'database'}
