import json


def test_oversized_json_payload_is_rejected(client):
    payload = {'username_or_email': 'x' * (2 * 1024 * 1024), 'password': 'Password123'}

    response = client.post(
        '/api/auth/login',
        data=json.dumps(payload),
        content_type='application/json',
    )

    assert response.status_code == 413
