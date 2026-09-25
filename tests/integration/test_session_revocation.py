"""Session tokens are bound to users.session_version and a bounded lifetime."""

import hashlib
import json
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from config import config
from models import PasswordResetToken
from services.account_flags import revoke_user_sessions
from services.admin_service import AdminService
from services.agent_access_service import INTERNAL_TOKEN_AUDIENCE
from tests.conftest import session_token_for


def _bearer(token):
    return {'Authorization': f'Bearer {token}'}


def _me_status(client, token):
    return client.get('/api/auth/me', headers=_bearer(token)).status_code


def _refresh(client, token):
    return client.post('/api/auth/refresh', headers=_bearer(token))


def _signed(claims):
    return jwt.encode(claims, config.JWT_SECRET_KEY, algorithm='HS256')


@pytest.mark.integration
class TestSessionVersion:
    def test_token_at_current_version_is_accepted(self, client, test_user):
        assert _me_status(client, session_token_for(test_user)) == 200

    def test_token_one_version_behind_is_rejected_for_requests_and_refresh(
        self, client, db_session, test_user,
    ):
        token = session_token_for(test_user)
        revoke_user_sessions(test_user)
        db_session.commit()

        response = client.get('/api/auth/me', headers=_bearer(token))
        assert response.status_code == 401
        assert 'revoked' in response.get_json()['error']
        assert _refresh(client, token).status_code == 401
        assert _me_status(client, session_token_for(test_user)) == 200

    def test_legacy_token_without_session_claims_is_rejected(self, client, test_user):
        legacy = _signed({
            'user_id': test_user.id,
            'exp': datetime.now(timezone.utc) + timedelta(hours=1),
        })

        assert _me_status(client, legacy) == 401
        assert _refresh(client, legacy).status_code == 401

    def test_agent_internal_token_is_not_a_session(self, client, test_user):
        agent_token = _signed({
            'aud': INTERNAL_TOKEN_AUDIENCE,
            'sub': test_user.id,
            'user_id': test_user.id,
            'sv': 0,
            'auth_time': int(datetime.now(timezone.utc).timestamp()),
            'exp': datetime.now(timezone.utc) + timedelta(minutes=1),
        })

        assert _me_status(client, agent_token) == 401


@pytest.mark.integration
class TestAbsoluteSessionLifetime:
    def _token_with_auth_time(self, user, days_ago):
        auth_time = datetime.now(timezone.utc) - timedelta(days=days_ago)
        return session_token_for(
            user,
            expires_delta=-timedelta(hours=1),
            auth_time=int(auth_time.timestamp()),
        )

    def test_refresh_just_inside_lifetime_keeps_original_auth_time(self, client, test_user):
        token = self._token_with_auth_time(test_user, config.SESSION_MAX_LIFETIME_DAYS - 1)
        original_auth_time = jwt.decode(token, options={'verify_signature': False})['auth_time']

        response = _refresh(client, token)

        assert response.status_code == 200
        refreshed = jwt.decode(response.get_json()['token'], options={'verify_signature': False})
        assert refreshed['auth_time'] == original_auth_time

    def test_refresh_just_past_lifetime_requires_login(self, client, test_user):
        token = self._token_with_auth_time(test_user, config.SESSION_MAX_LIFETIME_DAYS + 1)

        response = _refresh(client, token)

        assert response.status_code == 401
        assert 'log in again' in response.get_json()['error']


@pytest.mark.integration
class TestRevocationTriggers:
    def test_sign_out_everywhere_revokes_every_session_and_clears_cookies(self, client, test_user):
        first_device = session_token_for(test_user)
        second_device = session_token_for(test_user)

        response = client.post('/api/auth/sessions/revoke', headers=_bearer(first_device))

        assert response.status_code == 200
        set_cookies = ' '.join(response.headers.getlist('Set-Cookie'))
        assert 'fractal_auth_token=;' in set_cookies
        assert 'fractal_csrf_token=;' in set_cookies
        assert _me_status(client, first_device) == 401
        assert _me_status(client, second_device) == 401

    def test_sign_out_everywhere_requires_authentication(self, client):
        assert client.post('/api/auth/sessions/revoke').status_code == 401

    def test_sign_out_everywhere_stays_available_while_password_change_is_required(
        self, client, db_session, test_user,
    ):
        AdminService(db_session).set_force_password_change(test_user.id, True)
        token = session_token_for(test_user)

        assert client.post('/api/auth/sessions/revoke', headers=_bearer(token)).status_code == 200

    def test_password_reset_revokes_existing_sessions(self, client, db_session, test_user):
        token = session_token_for(test_user)
        raw_reset = 'reset-token-for-revocation-test'
        db_session.add(PasswordResetToken(
            user_id=test_user.id,
            token_hash=hashlib.sha256(raw_reset.encode('utf-8')).hexdigest(),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        db_session.commit()

        response = client.post(
            '/api/auth/password/reset',
            data=json.dumps({'token': raw_reset, 'new_password': 'Newpassword456'}),
            content_type='application/json',
        )

        assert response.status_code == 200
        assert _me_status(client, token) == 401

    def test_admin_temporary_password_revokes_existing_sessions(self, client, db_session, test_user):
        token = session_token_for(test_user)

        _, error, _ = AdminService(db_session).generate_temporary_password(test_user.id)

        assert error is None
        assert _me_status(client, token) == 401

    def test_reactivation_does_not_revive_tokens_issued_before_suspension(
        self, client, db_session, test_user,
    ):
        token = session_token_for(test_user)
        admin = AdminService(db_session)

        admin.update_status(test_user.id, False)
        admin.update_status(test_user.id, True)

        assert _me_status(client, token) == 401
        assert _me_status(client, session_token_for(test_user)) == 200

    def test_reactivating_an_active_user_keeps_their_sessions(self, client, db_session, test_user):
        token = session_token_for(test_user)

        AdminService(db_session).update_status(test_user.id, True)

        assert _me_status(client, token) == 200
