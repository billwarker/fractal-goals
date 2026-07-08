"""
Integration tests for Auth API endpoints.

Tests cover:
- POST /api/auth/signup - Register a new user
- POST /api/auth/login - Authenticate user (includes lockout behavior)
- POST /api/auth/refresh - Silent token refresh
- GET /api/auth/me - Get current user info
- PATCH /api/auth/preferences - Update user preferences
- PUT /api/auth/account/password - Change password
- PUT /api/auth/account/email - Change email  
- PUT /api/auth/account/username - Change username
- DELETE /api/auth/account - Delete account
"""

import pytest
import json
from datetime import timedelta
from urllib.parse import parse_qs, urlparse
from models import PasswordResetToken, utc_now
from services.admin_service import hash_invite_key
from services.email_service import EmailService, TEST_EMAIL_OUTBOX
from services.quota_service import TIER_DEFAULT_LIMITS_SETTING_KEY


def create_invite_key(db_session, raw_key='fg_invite_test'):
    from models import SignupInviteKey
    invite = SignupInviteKey(key_hash=hash_invite_key(raw_key), label='Test invite')
    db_session.add(invite)
    db_session.commit()
    return raw_key


@pytest.mark.integration
class TestSignupEndpoint:
    """Test user registration endpoint."""
    
    def test_signup_success(self, client, db_session):
        """Test successful user registration."""
        from models import AppSetting

        db_session.add(AppSetting(
            key=TIER_DEFAULT_LIMITS_SETTING_KEY,
            value={'storage_limit_bytes': {'free': 222222222}},
        ))
        db_session.commit()
        invite_key = create_invite_key(db_session)
        payload = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'Securepassword123',
            'invite_key': invite_key,
        }
        response = client.post(
            '/api/auth/signup',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['username'] == 'newuser'
        assert data['email'] == 'newuser@example.com'
        assert 'id' in data
        assert data['storage_limit_bytes'] == 222222222
        # Password should never be returned
        assert 'password' not in data
        assert 'password_hash' not in data
    
    def test_signup_duplicate_username(self, client, test_user, db_session):
        """Test signup with existing username fails."""
        invite_key = create_invite_key(db_session, 'fg_invite_dup_user')
        payload = {
            'username': 'testuser',  # Same as test_user
            'email': 'different@example.com',
            'password': 'Securepassword123',
            'invite_key': invite_key,
        }
        response = client.post(
            '/api/auth/signup',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data
    
    def test_signup_duplicate_email(self, client, test_user, db_session):
        """Test signup with existing email fails."""
        invite_key = create_invite_key(db_session, 'fg_invite_dup_email')
        payload = {
            'username': 'differentuser',
            'email': 'test@example.com',  # Same as test_user
            'password': 'Securepassword123',
            'invite_key': invite_key,
        }
        response = client.post(
            '/api/auth/signup',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data
    
    def test_signup_invalid_email(self, client):
        """Test signup with invalid email format fails."""
        payload = {
            'username': 'newuser',
            'email': 'not-an-email',
            'password': 'Securepassword123',
            'invite_key': 'fg_invite_invalid_email',
        }
        response = client.post(
            '/api/auth/signup',
            data=json.dumps(payload),
            content_type='application/json'
        )
        # Should return 400 for validation error
        assert response.status_code == 400
    
    def test_signup_short_password(self, client):
        """Test signup with password too short fails."""
        payload = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'short',  # Less than 8 characters
            'invite_key': 'fg_invite_short_password',
        }
        response = client.post(
            '/api/auth/signup',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400

    def test_signup_missing_fields(self, client):
        """Test signup with missing fields fails."""
        payload = {
            'username': 'newuser'
            # Missing email and password
        }
        response = client.post(
            '/api/auth/signup',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400


@pytest.mark.integration
class TestLoginEndpoint:
    """Test user login endpoint."""
    
    def test_login_success_with_username(self, client, test_user):
        """Test successful login with username."""
        payload = {
            'username_or_email': 'testuser',
            'password': 'Password123'
        }
        response = client.post(
            '/api/auth/login',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'token' in data
        assert 'user' in data
        assert data['user']['username'] == 'testuser'
    
    def test_login_success_with_email(self, client, test_user):
        """Test successful login with email."""
        payload = {
            'username_or_email': 'test@example.com',
            'password': 'Password123'
        }
        response = client.post(
            '/api/auth/login',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'token' in data

    def test_login_sets_http_only_cookie(self, client, test_user):
        """Login should set a browser cookie that can authenticate follow-up requests."""
        from config import config

        response = client.post(
            '/api/auth/login',
            data=json.dumps({
                'username_or_email': 'testuser',
                'password': 'Password123'
            }),
            content_type='application/json'
        )

        assert response.status_code == 200
        cookie_header = response.headers.get('Set-Cookie', '')
        assert config.AUTH_COOKIE_NAME in cookie_header
        assert 'HttpOnly' in cookie_header
        assert 'Max-Age' not in cookie_header

        me_response = client.get('/api/auth/me')
        assert me_response.status_code == 200
        assert json.loads(me_response.data)['username'] == 'testuser'

    def test_login_remember_me_sets_persistent_cookie(self, client, test_user):
        """Remember-me login should persist auth and CSRF cookies on this device."""
        from config import config

        response = client.post(
            '/api/auth/login',
            data=json.dumps({
                'username_or_email': 'testuser',
                'password': 'Password123',
                'remember_me': True,
            }),
            content_type='application/json'
        )

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['remember_me'] is True

        cookie_headers = response.headers.getlist('Set-Cookie')
        auth_cookie = next(header for header in cookie_headers if config.AUTH_COOKIE_NAME in header)
        csrf_cookie = next(header for header in cookie_headers if config.CSRF_COOKIE_NAME in header)
        assert 'HttpOnly' in auth_cookie
        assert 'Max-Age=' in auth_cookie
        assert 'Max-Age=' in csrf_cookie
    
    def test_login_wrong_password(self, client, test_user):
        """Test login with wrong password fails."""
        payload = {
            'username_or_email': 'testuser',
            'password': 'wrongpassword'
        }
        response = client.post(
            '/api/auth/login',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 401
        data = json.loads(response.data)
        assert 'error' in data
    
    def test_login_nonexistent_user(self, client):
        """Test login with nonexistent user fails."""
        payload = {
            'username_or_email': 'nonexistent',
            'password': 'anypassword'
        }
        response = client.post(
            '/api/auth/login',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 401
    
    def test_login_inactive_user(self, client, db_session, test_user):
        """Test login with inactive user fails."""
        # Deactivate the user
        test_user.is_active = False
        db_session.commit()
        
        payload = {
            'username_or_email': 'testuser',
            'password': 'Password123'
        }
        response = client.post(
            '/api/auth/login',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 403
        data = json.loads(response.data)
        assert 'disabled' in data['error'].lower() or 'inactive' in data['error'].lower()

    def test_login_empty_body(self, client):
        """Test login without JSON payload fails."""
        response = client.post(
            '/api/auth/login',
            data=json.dumps({}),
            content_type='application/json'
        )
        assert response.status_code == 400


@pytest.mark.integration
class TestPasswordResetEndpoint:
    def test_forgot_password_is_enumeration_safe_for_unknown_email(self, client, db_session):
        EmailService.clear_test_outbox()
        response = client.post(
            '/api/auth/password/forgot',
            data=json.dumps({'email': 'nobody@example.com'}),
            content_type='application/json',
        )

        assert response.status_code == 200
        assert TEST_EMAIL_OUTBOX == []
        assert db_session.query(PasswordResetToken).count() == 0

    def test_password_reset_flow(self, client, db_session, test_user):
        EmailService.clear_test_outbox()
        response = client.post(
            '/api/auth/password/forgot',
            data=json.dumps({'email': test_user.email}),
            content_type='application/json',
        )

        assert response.status_code == 200
        assert len(TEST_EMAIL_OUTBOX) == 1
        reset_url = TEST_EMAIL_OUTBOX[0]['text'].splitlines()[3]
        raw_token = parse_qs(urlparse(reset_url).query)['token'][0]
        stored_token = db_session.query(PasswordResetToken).one()
        assert stored_token.user_id == test_user.id
        assert stored_token.token_hash != raw_token

        reset_response = client.post(
            '/api/auth/password/reset',
            data=json.dumps({'token': raw_token, 'new_password': 'Newpassword456'}),
            content_type='application/json',
        )
        assert reset_response.status_code == 200

        db_session.refresh(stored_token)
        assert stored_token.used_at is not None

        reused_response = client.post(
            '/api/auth/password/reset',
            data=json.dumps({'token': raw_token, 'new_password': 'Anotherpass789'}),
            content_type='application/json',
        )
        assert reused_response.status_code == 400

        login_response = client.post(
            '/api/auth/login',
            data=json.dumps({'username_or_email': 'testuser', 'password': 'Newpassword456'}),
            content_type='application/json',
        )
        assert login_response.status_code == 200

    def test_password_reset_rejects_expired_token(self, client, db_session, test_user):
        EmailService.clear_test_outbox()
        client.post(
            '/api/auth/password/forgot',
            data=json.dumps({'email': test_user.email}),
            content_type='application/json',
        )
        reset_url = TEST_EMAIL_OUTBOX[0]['text'].splitlines()[3]
        raw_token = parse_qs(urlparse(reset_url).query)['token'][0]
        stored_token = db_session.query(PasswordResetToken).one()
        stored_token.expires_at = utc_now() - timedelta(minutes=1)
        db_session.commit()

        response = client.post(
            '/api/auth/password/reset',
            data=json.dumps({'token': raw_token, 'new_password': 'Newpassword456'}),
            content_type='application/json',
        )
        assert response.status_code == 400

    def test_forgot_password_email_cooldown_suppresses_duplicate_send(self, client, db_session, test_user):
        EmailService.clear_test_outbox()
        first = client.post(
            '/api/auth/password/forgot',
            data=json.dumps({'email': test_user.email}),
            content_type='application/json',
            environ_base={'REMOTE_ADDR': '198.51.100.10'},
        )
        second = client.post(
            '/api/auth/password/forgot',
            data=json.dumps({'email': test_user.email}),
            content_type='application/json',
            environ_base={'REMOTE_ADDR': '198.51.100.10'},
        )

        assert first.status_code == 200
        assert second.status_code == 200
        assert len(TEST_EMAIL_OUTBOX) == 1
        assert db_session.query(PasswordResetToken).filter_by(user_id=test_user.id).count() == 1

    def test_forgot_password_rate_limit_counts_invalid_payloads(self, client):
        responses = [
            client.post(
                '/api/auth/password/forgot',
                json={'email': 'not-an-email'},
                environ_base={'REMOTE_ADDR': '198.51.100.11'},
            )
            for _ in range(6)
        ]

        assert [response.status_code for response in responses[:5]] == [400, 400, 400, 400, 400]
        assert responses[5].status_code == 429

    def test_reset_password_rate_limit_counts_invalid_payloads(self, client):
        responses = [
            client.post(
                '/api/auth/password/reset',
                json={'token': 'short', 'new_password': 'weak'},
                environ_base={'REMOTE_ADDR': '198.51.100.12'},
            )
            for _ in range(6)
        ]

        assert [response.status_code for response in responses[:5]] == [400, 400, 400, 400, 400]
        assert responses[5].status_code == 429


@pytest.mark.integration
class TestMeEndpoint:
    """Test get current user endpoint."""
    
    def test_get_me_success(self, authed_client):
        """Test getting current user info."""
        response = authed_client.get('/api/auth/me')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['username'] == 'testuser'
        assert 'email' in data
        assert data['membership_tier'] == 'free'

    def test_get_account_usage_success(self, authed_client, sample_ultimate_goal):
        """Test getting membership and quota usage."""
        response = authed_client.get('/api/auth/account/usage')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['tier'] == 'free'
        assert data['unlimited'] is False
        assert data['usage']['fractals'] == 1
        assert data['limits']['activity_instances'] == 500
        assert data['limits']['metrics'] == 20
        assert data['limits']['session_templates'] == 10
        assert data['scope'] == 'account'

        scoped_response = authed_client.get(f'/api/auth/account/usage?root_ids={sample_ultimate_goal.id}')
        assert scoped_response.status_code == 200
        scoped_data = json.loads(scoped_response.data)
        assert scoped_data['scope'] == 'fractals'
        assert scoped_data['root_ids'] == [sample_ultimate_goal.id]
        assert scoped_data['usage']['fractals'] == 1
    
    def test_get_me_without_auth(self, client):
        """Test getting user info without authentication fails."""
        response = client.get('/api/auth/me')
        assert response.status_code == 401

    def test_logout_clears_cookie(self, client, test_user):
        """Logout should clear cookie-backed authentication."""
        from config import config

        client.post(
            '/api/auth/login',
            data=json.dumps({
                'username_or_email': 'testuser',
                'password': 'Password123'
            }),
            content_type='application/json'
        )
        csrf_cookie = client.get_cookie(config.CSRF_COOKIE_NAME)

        logout_response = client.post(
            '/api/auth/logout',
            headers={config.CSRF_HEADER_NAME: csrf_cookie.value},
        )
        assert logout_response.status_code == 200
        assert client.get('/api/auth/me').status_code == 401


@pytest.mark.integration
class TestPreferencesEndpoint:
    """Test user preferences endpoint."""
    
    def test_update_preferences(self, authed_client):
        """Test updating user preferences."""
        payload = {
            'preferences': {
                'theme': 'dark',
                'timezone': 'America/New_York'
            }
        }
        response = authed_client.patch(
            '/api/auth/preferences',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        # Response should contain the user object with preferences key
        assert 'id' in data  # User object returned
        assert 'preferences' in data  # Preferences field exists

    def test_cookie_authenticated_write_requires_csrf(self, client, test_user):
        response = client.post(
            '/api/auth/login',
            data=json.dumps({
                'username_or_email': 'testuser',
                'password': 'Password123',
            }),
            content_type='application/json',
        )
        assert response.status_code == 200

        write_response = client.patch(
            '/api/auth/preferences',
            data=json.dumps({'preferences': {'theme': 'dark'}}),
            content_type='application/json',
        )
        assert write_response.status_code == 403
        assert 'csrf' in json.loads(write_response.data)['error'].lower()

    def test_cookie_authenticated_write_accepts_matching_csrf(self, client, test_user):
        from config import config

        login_response = client.post(
            '/api/auth/login',
            data=json.dumps({
                'username_or_email': 'testuser',
                'password': 'Password123',
            }),
            content_type='application/json',
        )
        assert login_response.status_code == 200
        csrf_cookie = client.get_cookie(config.CSRF_COOKIE_NAME)
        assert csrf_cookie is not None

        write_response = client.patch(
            '/api/auth/preferences',
            data=json.dumps({'preferences': {'theme': 'dark'}}),
            content_type='application/json',
            headers={config.CSRF_HEADER_NAME: csrf_cookie.value},
        )
        assert write_response.status_code == 200

    def test_csrf_endpoint_returns_readable_token(self, client, test_user):
        from config import config

        login_response = client.post(
            '/api/auth/login',
            data=json.dumps({
                'username_or_email': 'testuser',
                'password': 'Password123',
            }),
            content_type='application/json',
        )
        assert login_response.status_code == 200

        response = client.get('/api/auth/csrf')

        assert response.status_code == 200
        data = json.loads(response.data)
        csrf_cookie = client.get_cookie(config.CSRF_COOKIE_NAME)
        assert data['csrf_cookie_name'] == config.CSRF_COOKIE_NAME
        assert data['csrf_header_name'] == config.CSRF_HEADER_NAME
        assert data['csrf_token']
        assert response.headers[config.CSRF_HEADER_NAME] == data['csrf_token']
        assert csrf_cookie.value == data['csrf_token']


@pytest.mark.integration
class TestPasswordChangeEndpoint:
    """Test password change endpoint."""
    
    def test_change_password_success(self, authed_client, client, test_user):
        """Test successful password change."""
        payload = {
            'current_password': 'Password123',
            'new_password': 'Newpassword456'
        }
        response = authed_client.put(
            '/api/auth/account/password',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        
        # Verify we can login with new password
        login_payload = {
            'username_or_email': 'testuser',
            'password': 'Newpassword456'
        }
        login_response = client.post(
            '/api/auth/login',
            data=json.dumps(login_payload),
            content_type='application/json'
        )
        assert login_response.status_code == 200
    
    def test_change_password_wrong_current(self, authed_client):
        """Test password change with wrong current password fails."""
        payload = {
            'current_password': 'wrongpassword',
            'new_password': 'Newpassword456'
        }
        response = authed_client.put(
            '/api/auth/account/password',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 401
        
    def test_change_password_weak_new_password(self, authed_client):
        """Test password change to a weak password fails validation."""
        payload = {
            'current_password': 'Password123',
            'new_password': 'weak' # Fails Strong Password requirements
        }
        response = authed_client.put(
            '/api/auth/account/password',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400


@pytest.mark.integration
class TestEmailChangeEndpoint:
    """Test email change endpoint."""
    
    def test_change_email_success(self, authed_client):
        """Test successful email change."""
        payload = {
            'email': 'newemail@example.com',
            'password': 'Password123'
        }
        response = authed_client.put(
            '/api/auth/account/email',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['email'] == 'newemail@example.com'
    
    def test_change_email_wrong_password(self, authed_client):
        """Test email change with wrong password fails."""
        payload = {
            'email': 'newemail@example.com',
            'password': 'wrongpassword'
        }
        response = authed_client.put(
            '/api/auth/account/email',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 401
    
    def test_change_email_to_existing(self, authed_client, db_session):
        """Test changing email to one that already exists fails."""
        # Create another user with the target email
        from models import User
        other_user = User(
            username='otheruser',
            email='taken@example.com'
        )
        other_user.set_password('password')
        db_session.add(other_user)
        db_session.commit()
        
        payload = {
            'email': 'taken@example.com',
            'password': 'Password123'
        }
        response = authed_client.put(
            '/api/auth/account/email',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400


@pytest.mark.integration
class TestAccountDeletionEndpoint:
    """Test account deletion endpoint."""
    
    def test_delete_account_success(self, authed_client, db_session, test_user):
        """Test successful account deletion (anonymization)."""
        payload = {
            'password': 'Password123',
            'confirmation': 'DELETE'
        }
        response = authed_client.delete(
            '/api/auth/account',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        
        # Verify user is deactivated
        from models import User
        db_session.expire_all()
        user = db_session.query(User).get(test_user.id)
        assert user.is_active == False
        assert 'deleted' in user.username
    
    def test_delete_account_wrong_password(self, authed_client):
        """Test account deletion with wrong password fails."""
        payload = {
            'password': 'wrongpassword',
            'confirmation': 'DELETE'
        }
        response = authed_client.delete(
            '/api/auth/account',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 401
    
    def test_delete_account_wrong_confirmation(self, authed_client):
        """Test account deletion with wrong confirmation fails."""
        payload = {
            'password': 'Password123',
            'confirmation': 'delete'  # Should be uppercase DELETE
        }
        response = authed_client.delete(
            '/api/auth/account',
            data=json.dumps(payload),
            content_type='application/json'
        )
        # Should fail validation
        assert response.status_code == 400


@pytest.mark.integration
class TestTokenRefreshEndpoint:
    """Test token refresh endpoint."""
    
    def test_refresh_token_success(self, client, test_user):
        import jwt
        from datetime import datetime, timedelta, timezone
        from config import config
        # Create an expired token within refresh window
        token = jwt.encode({
            'user_id': test_user.id,
            'exp': datetime.now(timezone.utc) - timedelta(hours=1)
        }, config.JWT_SECRET_KEY, algorithm='HS256')
        
        response = client.post(
            '/api/auth/refresh',
            headers={'Authorization': f'Bearer {token}'}
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'token' in data
        assert 'user' in data

    def test_cookie_refresh_requires_csrf(self, client, test_user):
        response = client.post(
            '/api/auth/login',
            data=json.dumps({
                'username_or_email': 'testuser',
                'password': 'Password123',
            }),
            content_type='application/json',
        )
        assert response.status_code == 200

        refresh_response = client.post('/api/auth/refresh')
        assert refresh_response.status_code == 403

    def test_cookie_refresh_accepts_matching_csrf(self, client, test_user):
        from config import config

        response = client.post(
            '/api/auth/login',
            data=json.dumps({
                'username_or_email': 'testuser',
                'password': 'Password123',
            }),
            content_type='application/json',
        )
        assert response.status_code == 200
        csrf_cookie = client.get_cookie(config.CSRF_COOKIE_NAME)

        refresh_response = client.post(
            '/api/auth/refresh',
            headers={config.CSRF_HEADER_NAME: csrf_cookie.value},
        )
        assert refresh_response.status_code == 200

    def test_remembered_cookie_refresh_preserves_persistent_cookie(self, client, test_user):
        from config import config

        response = client.post(
            '/api/auth/login',
            data=json.dumps({
                'username_or_email': 'testuser',
                'password': 'Password123',
                'remember_me': True,
            }),
            content_type='application/json',
        )
        assert response.status_code == 200
        csrf_cookie = client.get_cookie(config.CSRF_COOKIE_NAME)

        refresh_response = client.post(
            '/api/auth/refresh',
            headers={config.CSRF_HEADER_NAME: csrf_cookie.value},
        )

        assert refresh_response.status_code == 200
        data = json.loads(refresh_response.data)
        assert data['remember_me'] is True
        cookie_headers = refresh_response.headers.getlist('Set-Cookie')
        auth_cookie = next(header for header in cookie_headers if config.AUTH_COOKIE_NAME in header)
        csrf_cookie_header = next(header for header in cookie_headers if config.CSRF_COOKIE_NAME in header)
        assert 'Max-Age=' in auth_cookie
        assert 'Max-Age=' in csrf_cookie_header

    def test_refresh_token_past_window(self, client, test_user):
        import jwt
        from datetime import datetime, timedelta, timezone
        from config import config
        # Token expired 8 days ago (window is 7 days)
        token = jwt.encode({
            'user_id': test_user.id,
            'exp': datetime.now(timezone.utc) - timedelta(days=8)
        }, config.JWT_SECRET_KEY, algorithm='HS256')
        
        response = client.post(
            '/api/auth/refresh',
            headers={'Authorization': f'Bearer {token}'}
        )
        assert response.status_code == 401

    def test_refresh_token_invalid(self, client):
        """Test refresh with un-decodable garbage string."""
        response = client.post(
            '/api/auth/refresh',
            headers={'Authorization': 'Bearer garbage'}
        )
        assert response.status_code == 401


@pytest.mark.integration
class TestAccountLockout:
    """Test account lockout mechanism."""

    def test_account_lockout_after_five_failures(self, client, test_user):
        payload = {'username_or_email': 'testuser', 'password': 'wrongpassword'}
        # 5 failed attempts
        for _ in range(5):
            response = client.post('/api/auth/login', data=json.dumps(payload), content_type='application/json')
            assert response.status_code == 401
            
        # 6th attempt even with correct password should fail
        correct_payload = {'username_or_email': 'testuser', 'password': 'Password123'}
        response = client.post('/api/auth/login', data=json.dumps(correct_payload), content_type='application/json')
        assert response.status_code == 403
        data = json.loads(response.data)
        assert 'locked' in data['error'].lower()

    def test_account_lockout_recovers_after_15_minutes(self, client, db_session, test_user):
        from datetime import datetime, timedelta, timezone
        from models import User
        # Manually lock account from 16 minutes ago
        test_user.locked_until = datetime.now(timezone.utc) - timedelta(minutes=16)
        db_session.commit()
        
        # Should succeed now
        correct_payload = {'username_or_email': 'testuser', 'password': 'Password123'}
        response = client.post('/api/auth/login', data=json.dumps(correct_payload), content_type='application/json')
        assert response.status_code == 200


@pytest.mark.integration
class TestUsernameUpdateEndpoint:
    """Test username update endpoint."""

    def test_update_username_success(self, authed_client, db_session, test_user):
        payload = {
            'username': 'new_awesome_name',
            'password': 'Password123'
        }
        response = authed_client.put(
            '/api/auth/account/username',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['username'] == 'new_awesome_name'
        
        db_session.expire_all()
        from models import User
        user = db_session.query(User).get(test_user.id)
        assert user.username == 'new_awesome_name'

    def test_update_username_conflict_fails(self, authed_client, db_session):
        # Create another user to conflict with
        from models import User
        other_user = User(
            username='takenname',
            email='taken2@example.com'
        )
        other_user.set_password('password')
        db_session.add(other_user)
        db_session.commit()
        
        payload = {
            'username': 'takenname',
            'password': 'Password123'
        }
        response = authed_client.put(
            '/api/auth/account/username',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400


@pytest.mark.integration
class TestForcePasswordChangeEnforcement:
    """Admin-forced password change must gate API access until resolved."""

    def _force_password_change(self, db_session, user):
        from sqlalchemy.orm.attributes import flag_modified
        from services.account_flags import FORCE_PASSWORD_CHANGE_PREFERENCE

        preferences = dict(user.preferences or {})
        preferences[FORCE_PASSWORD_CHANGE_PREFERENCE] = True
        user.preferences = preferences
        flag_modified(user, 'preferences')
        db_session.commit()

    def test_login_reports_must_change_password(self, client, db_session, test_user):
        self._force_password_change(db_session, test_user)

        response = client.post(
            '/api/auth/login',
            data=json.dumps({'username_or_email': 'testuser', 'password': 'Password123'}),
            content_type='application/json',
        )

        assert response.status_code == 200
        assert json.loads(response.data)['user']['must_change_password'] is True

    def test_gated_endpoint_returns_password_change_required(self, authed_client, db_session, test_user):
        self._force_password_change(db_session, test_user)

        response = authed_client.get('/api/auth/account/usage')

        assert response.status_code == 403
        data = json.loads(response.data)
        assert data['code'] == 'password_change_required'

    def test_me_endpoint_stays_accessible_with_flag(self, authed_client, db_session, test_user):
        self._force_password_change(db_session, test_user)

        response = authed_client.get('/api/auth/me')

        assert response.status_code == 200
        assert json.loads(response.data)['must_change_password'] is True

    def test_password_change_clears_flag_and_unblocks(self, authed_client, db_session, test_user):
        EmailService.clear_test_outbox()
        self._force_password_change(db_session, test_user)

        change_response = authed_client.put(
            '/api/auth/account/password',
            data=json.dumps({'current_password': 'Password123', 'new_password': 'Newpassword456'}),
            content_type='application/json',
        )
        assert change_response.status_code == 200

        unblocked_response = authed_client.get('/api/auth/account/usage')
        assert unblocked_response.status_code == 200

        me_response = authed_client.get('/api/auth/me')
        assert json.loads(me_response.data)['must_change_password'] is False

        notices = [email for email in TEST_EMAIL_OUTBOX if email['template_key'] == 'password_changed_notice']
        assert len(notices) == 1
        assert notices[0]['to'] == test_user.email

    def test_password_reset_clears_flag(self, client, db_session, test_user):
        EmailService.clear_test_outbox()
        self._force_password_change(db_session, test_user)

        client.post(
            '/api/auth/password/forgot',
            data=json.dumps({'email': test_user.email}),
            content_type='application/json',
        )
        reset_url = TEST_EMAIL_OUTBOX[0]['text'].splitlines()[3]
        raw_token = parse_qs(urlparse(reset_url).query)['token'][0]

        reset_response = client.post(
            '/api/auth/password/reset',
            data=json.dumps({'token': raw_token, 'new_password': 'Newpassword456'}),
            content_type='application/json',
        )
        assert reset_response.status_code == 200

        db_session.expire_all()
        from services.account_flags import must_change_password
        from models import User
        refreshed = db_session.get(User, test_user.id)
        assert must_change_password(refreshed) is False

        notices = [email for email in TEST_EMAIL_OUTBOX if email['template_key'] == 'password_changed_notice']
        assert len(notices) == 1
        assert notices[0]['to'] == test_user.email


@pytest.mark.integration
class TestSecurityNoticeEmails:
    def test_email_change_notifies_old_address(self, authed_client, test_user):
        EmailService.clear_test_outbox()
        old_email = test_user.email

        response = authed_client.put(
            '/api/auth/account/email',
            data=json.dumps({'email': 'brand-new@example.com', 'password': 'Password123'}),
            content_type='application/json',
        )
        assert response.status_code == 200

        notices = [email for email in TEST_EMAIL_OUTBOX if email['template_key'] == 'email_changed_notice']
        assert len(notices) == 1
        assert notices[0]['to'] == old_email
        assert 'brand-new@example.com' in notices[0]['text']
