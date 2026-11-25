from datetime import timedelta

import pytest

from config import config
from models import DeviceRefreshToken, User, UserDevice, utc_now
from tests.conftest import session_headers_for

PASSWORD = 'DevicePass123!'


@pytest.fixture
def account(db_session, test_user):
    user = db_session.get(User, test_user.id)
    user.set_password(PASSWORD)
    db_session.commit()
    return user


def _sign_in(client, user, **overrides):
    response = client.post('/api/auth/token', json={
        'username_or_email': user.email, 'password': PASSWORD,
        'platform': 'ios', 'device_name': 'Phone', **overrides,
    })
    return response


def _refresh(client, token):
    return client.post('/api/auth/token/refresh', json={'refresh_token': token})


def _bearer(session):
    return {'Authorization': f"Bearer {session['access_token']}"}


def _cookieless(app):
    return app.test_client(use_cookies=False)


def test_sign_in_sets_no_cookie_and_stores_no_raw_token(app, account, db_session):
    client = _cookieless(app)
    response = _sign_in(client, account)
    assert response.status_code == 200
    assert 'Set-Cookie' not in response.headers
    session = response.get_json()
    assert client.get('/api/auth/me', headers=_bearer(session)).status_code == 200
    assert db_session.get(DeviceRefreshToken, session['refresh_token']) is None


@pytest.mark.parametrize('overrides,status', [
    ({'password': 'wrong'}, 401), ({'platform': 'android'}, 400), ({'device_name': ''}, 400),
])
def test_sign_in_rejects(app, account, overrides, status):
    assert _sign_in(_cookieless(app), account, **overrides).status_code == status


def test_refresh_rotates_and_reuse_ends_the_device(app, account):
    client = _cookieless(app)
    first = _sign_in(client, account).get_json()
    second = _refresh(client, first['refresh_token']).get_json()
    third = _refresh(client, second['refresh_token']).get_json()
    assert len({first['refresh_token'], second['refresh_token'], third['refresh_token']}) == 3
    # The first token is two behind: someone else holds it.
    assert _refresh(client, first['refresh_token']).status_code == 401
    assert _refresh(client, third['refresh_token']).status_code == 401
    assert client.get('/api/auth/me', headers=_bearer(third)).status_code == 401


def test_lost_refresh_response_can_be_retried_until_its_replacement_is_used(app, account):
    client = _cookieless(app)
    first = _sign_in(client, account).get_json()
    lost = _refresh(client, first['refresh_token']).get_json()
    retried = _refresh(client, first['refresh_token'])
    assert retried.status_code == 200
    # The lost replacement was itself replaced, so using it now is reuse.
    assert _refresh(client, lost['refresh_token']).status_code == 401


def test_access_token_cannot_renew_itself(app, account):
    client = _cookieless(app)
    session = _sign_in(client, account).get_json()
    assert client.post('/api/auth/refresh', headers=_bearer(session)).status_code == 401


def test_revoking_one_device_leaves_the_other(app, account):
    client = _cookieless(app)
    phone = _sign_in(client, account).get_json()
    mac = _sign_in(client, account, platform='macos', device_name='Mac').get_json()
    listed = client.get('/api/auth/devices', headers=_bearer(mac)).get_json()['devices']
    assert {item['id'] for item in listed} == {phone['device']['id'], mac['device']['id']}
    assert client.delete(f"/api/auth/devices/{phone['device']['id']}", headers=_bearer(mac)).status_code == 200
    assert client.get('/api/auth/me', headers=_bearer(phone)).status_code == 401
    assert _refresh(client, phone['refresh_token']).status_code == 401
    assert client.get('/api/auth/me', headers=_bearer(mac)).status_code == 200


def test_another_users_device_is_not_found(app, account, db_session):
    client = _cookieless(app)
    phone = _sign_in(client, account).get_json()
    other = User(username='other-device', email='other-device@example.test',
                 terms_accepted_version=config.TERMS_VERSION, privacy_accepted_version=config.PRIVACY_VERSION)
    other.set_password(PASSWORD)
    db_session.add(other)
    db_session.commit()
    response = client.delete(f"/api/auth/devices/{phone['device']['id']}", headers=session_headers_for(other))
    assert response.status_code == 404
    assert client.get('/api/auth/me', headers=_bearer(phone)).status_code == 200


def test_sign_out_everywhere_ends_device_sessions(app, account):
    client = _cookieless(app)
    session = _sign_in(client, account).get_json()
    assert client.post('/api/auth/sessions/revoke', headers=_bearer(session)).status_code == 200
    assert _refresh(client, session['refresh_token']).status_code == 401


def test_password_change_keeps_only_the_acting_device(app, account):
    client = _cookieless(app)
    acting, other = (_sign_in(client, account).get_json() for _ in range(2))
    response = client.put('/api/auth/account/password', headers=_bearer(acting), json={
        'current_password': PASSWORD, 'new_password': 'ChangedPass123!',
    })
    assert response.status_code == 200, response.get_json()
    assert 'Set-Cookie' not in response.headers
    assert client.get('/api/auth/me', headers={'Authorization': f"Bearer {response.get_json()['token']}"}).status_code == 200
    assert _refresh(client, acting['refresh_token']).status_code == 200
    assert _refresh(client, other['refresh_token']).status_code == 401


@pytest.mark.parametrize('days,status', [(-1, 200), (1, 401)])
def test_idle_devices_lapse(app, account, db_session, days, status):
    client = _cookieless(app)
    session = _sign_in(client, account).get_json()
    device = db_session.get(UserDevice, session['device']['id'])
    device.last_seen_at = (utc_now() - timedelta(days=config.DEVICE_SESSION_IDLE_DAYS + days)).replace(tzinfo=None)
    db_session.commit()
    assert _refresh(client, session['refresh_token']).status_code == status


def test_sign_out_is_silent_about_unknown_tokens(app, account):
    client = _cookieless(app)
    session = _sign_in(client, account).get_json()
    for token in (session['refresh_token'], 'x' * 64):
        assert client.post('/api/auth/token/revoke', json={'refresh_token': token}).status_code == 200
    assert _refresh(client, session['refresh_token']).status_code == 401


@pytest.mark.parametrize('platform,build,status', [
    ('ios', '10', 200), ('ios', '9', 426), ('ios', '', 426), ('ios', '-1', 426), ('macos', '1', 200), ('', '', 200),
])
def test_old_builds_are_told_to_update(app, monkeypatch, platform, build, status):
    monkeypatch.setitem(config.MIN_SUPPORTED_BUILDS, 'ios', 10)
    response = _cookieless(app).get('/api/healthz', headers={
        'X-Client-Platform': platform, 'X-Client-Build': build,
    })
    assert response.status_code == status


def _media(client, session):
    return client.post('/api/auth/media-token', headers=_bearer(session)).get_json()['media_token']


def _media_status(client, token, path='content', **query):
    return client.get(f'/api/some-root/media/some-asset/{path}', query_string={'media_token': token, **query}).status_code


def test_media_token_opens_media_routes_only(app, account):
    client = _cookieless(app)
    session = _sign_in(client, account).get_json()
    token = _media(client, session)
    # Past authentication: the fractal does not exist.
    assert _media_status(client, token) == 404
    assert _media_status(client, token, 'thumbnail') == 404
    assert _media_status(client, token, 'usage') == 401
    assert client.get('/api/auth/me', query_string={'media_token': token}).status_code == 401
    assert client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'}).status_code == 401
    assert client.post('/api/auth/refresh', headers={'Authorization': f'Bearer {token}'}).status_code == 401
    # A session token is not a media token.
    assert _media_status(client, session['access_token']) == 401


def test_media_token_ends_with_its_device(app, account):
    client = _cookieless(app)
    phone, mac = (_sign_in(client, account).get_json() for _ in range(2))
    token = _media(client, phone)
    client.delete(f"/api/auth/devices/{phone['device']['id']}", headers=_bearer(mac))
    assert _media_status(client, token) == 401


def test_media_token_ends_with_the_accounts_sessions(app, account):
    client = _cookieless(app)
    session = _sign_in(client, account).get_json()
    token = _media(client, session)
    client.post('/api/auth/sessions/revoke', headers=_bearer(session))
    assert _media_status(client, token) == 401


def test_media_token_never_acts_for_another_account(app, account, db_session):
    account.role = 'admin'
    db_session.commit()
    client = _cookieless(app)
    token = _media(client, _sign_in(client, account).get_json())
    assert _media_status(client, token, admin_user_id='someone', admin_mode='read_only') == 404


def test_media_token_needs_a_session(app):
    assert _cookieless(app).post('/api/auth/media-token').status_code == 401
