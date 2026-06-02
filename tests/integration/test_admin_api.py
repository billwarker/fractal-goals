import json
import uuid

import jwt
import pytest

from config import config
from models import User


def auth_headers_for(user):
    import datetime
    from datetime import timezone

    token = jwt.encode({
        'user_id': user.id,
        'exp': datetime.datetime.now(timezone.utc) + datetime.timedelta(hours=24),
    }, config.JWT_SECRET_KEY, algorithm="HS256")
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


@pytest.fixture
def admin_user(db_session):
    user = User(
        id=str(uuid.uuid4()),
        username='adminuser',
        email='admin@example.com',
        role='admin',
    )
    user.set_password('Password123')
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def admin_client(client, admin_user):
    class AdminClient:
        def __init__(self, client, user):
            self.client = client
            self.headers = auth_headers_for(user)

        def get(self, *args, **kwargs):
            return self.client.get(*args, headers=self.headers, **kwargs)

        def post(self, *args, **kwargs):
            return self.client.post(*args, headers=self.headers, **kwargs)

        def patch(self, *args, **kwargs):
            return self.client.patch(*args, headers=self.headers, **kwargs)

        def delete(self, *args, **kwargs):
            return self.client.delete(*args, headers=self.headers, **kwargs)

    return AdminClient(client, admin_user)


@pytest.mark.integration
def test_non_admin_cannot_access_admin_api(authed_client):
    response = authed_client.get('/api/admin/summary')
    assert response.status_code == 403


@pytest.mark.integration
def test_admin_can_create_and_revoke_invite_key(admin_client):
    response = admin_client.post(
        '/api/admin/invite-keys',
        data=json.dumps({'label': 'Tester wave'}),
        content_type='application/json',
    )
    assert response.status_code == 201
    payload = json.loads(response.data)
    assert payload['key'].startswith('fg_invite_')
    assert payload['status'] == 'available'

    list_response = admin_client.get('/api/admin/invite-keys')
    assert list_response.status_code == 200
    keys = json.loads(list_response.data)
    assert 'key' not in keys[0]

    revoke_response = admin_client.patch(f"/api/admin/invite-keys/{payload['id']}/revoke")
    assert revoke_response.status_code == 200
    assert json.loads(revoke_response.data)['status'] == 'revoked'


@pytest.mark.integration
def test_signup_requires_and_consumes_invite_key(client, admin_client):
    missing_response = client.post(
        '/api/auth/signup',
        data=json.dumps({
            'username': 'nokey',
            'email': 'nokey@example.com',
            'password': 'Password123',
        }),
        content_type='application/json',
    )
    assert missing_response.status_code == 400

    invite_response = admin_client.post(
        '/api/admin/invite-keys',
        data=json.dumps({'label': 'Signup key'}),
        content_type='application/json',
    )
    invite_key = json.loads(invite_response.data)['key']
    signup_response = client.post(
        '/api/auth/signup',
        data=json.dumps({
            'username': 'invited',
            'email': 'invited@example.com',
            'password': 'Password123',
            'invite_key': invite_key,
        }),
        content_type='application/json',
    )
    assert signup_response.status_code == 201

    reuse_response = client.post(
        '/api/auth/signup',
        data=json.dumps({
            'username': 'reuse',
            'email': 'reuse@example.com',
            'password': 'Password123',
            'invite_key': invite_key,
        }),
        content_type='application/json',
    )
    assert reuse_response.status_code == 400


@pytest.mark.integration
def test_admin_users_include_entity_and_storage_metrics(admin_client, test_user, sample_ultimate_goal):
    response = admin_client.get('/api/admin/users')
    assert response.status_code == 200
    payload = json.loads(response.data)
    target = next(user for user in payload['users'] if user['id'] == test_user.id)
    assert set(target['resources']) == {
        'fractals',
        'goals',
        'sessions',
        'activity_instances',
        'activities',
        'metrics',
        'session_templates',
        'notes',
        'programs',
    }
    assert target['usage']['fractals'] == 1
    assert 'used_bytes' in target['storage']
    assert target['storage']['limit_bytes'] == 104857600
    assert target['fractals'][0]['id'] == sample_ultimate_goal.id


@pytest.mark.integration
def test_admin_can_update_storage_limit(admin_client, test_user):
    response = admin_client.patch(
        f'/api/admin/users/{test_user.id}',
        data=json.dumps({'storage_limit_bytes': 2048}),
        content_type='application/json',
    )
    assert response.status_code == 200
    assert json.loads(response.data)['storage']['limit_bytes'] == 2048


@pytest.mark.integration
def test_admin_can_delete_user(admin_client, db_session, test_user):
    response = admin_client.delete(f'/api/admin/users/{test_user.id}')
    assert response.status_code == 200
    db_session.refresh(test_user)
    assert test_user.is_active is False
    assert test_user.role == 'user'
    assert test_user.username.startswith('deleted_')


@pytest.mark.integration
def test_admin_cannot_delete_self(admin_client, admin_user):
    response = admin_client.delete(f'/api/admin/users/{admin_user.id}')
    assert response.status_code == 400


@pytest.mark.integration
def test_admin_read_only_and_read_write_fractal_access(client, admin_user, test_user, sample_ultimate_goal):
    headers = auth_headers_for(admin_user)
    root_id = sample_ultimate_goal.id

    get_response = client.get(
        f'/api/{root_id}/goals?admin_user_id={test_user.id}&admin_mode=read_only',
        headers=headers,
    )
    assert get_response.status_code == 200

    write_response = client.post(
        f'/api/{root_id}/goals?admin_user_id={test_user.id}&admin_mode=read_only',
        headers=headers,
        data=json.dumps({'name': 'Blocked', 'type': 'LongTermGoal'}),
        content_type='application/json',
    )
    assert write_response.status_code == 403

    write_ok_response = client.post(
        f'/api/{root_id}/goals?admin_user_id={test_user.id}&admin_mode=read_write',
        headers=headers,
        data=json.dumps({'name': 'Allowed', 'type': 'LongTermGoal'}),
        content_type='application/json',
    )
    assert write_ok_response.status_code == 201


@pytest.mark.integration
def test_storage_limit_blocks_large_note(authed_client, db_session, test_user, sample_ultimate_goal):
    test_user.storage_limit_bytes = 1
    db_session.commit()

    response = authed_client.post(
        f'/api/{sample_ultimate_goal.id}/notes',
        data=json.dumps({
            'context_type': 'root',
            'context_id': sample_ultimate_goal.id,
            'content': 'too much text',
        }),
        content_type='application/json',
    )
    assert response.status_code == 403
    assert json.loads(response.data)['error']['error'] == 'Storage quota reached'
