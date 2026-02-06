"""
Integration tests for Auth API endpoints.

Tests cover:
- POST /api/auth/signup - Register a new user
- POST /api/auth/login - Authenticate user
- GET /api/auth/me - Get current user info
- PATCH /api/auth/preferences - Update user preferences
- PUT /api/auth/account/password - Change password
- PUT /api/auth/account/email - Change email  
- DELETE /api/auth/account - Delete account
"""

import pytest
import json


@pytest.mark.integration
class TestSignupEndpoint:
    """Test user registration endpoint."""
    
    def test_signup_success(self, client):
        """Test successful user registration."""
        payload = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'securepassword123'
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
        # Password should never be returned
        assert 'password' not in data
        assert 'password_hash' not in data
    
    def test_signup_duplicate_username(self, client, test_user):
        """Test signup with existing username fails."""
        payload = {
            'username': 'testuser',  # Same as test_user
            'email': 'different@example.com',
            'password': 'securepassword123'
        }
        response = client.post(
            '/api/auth/signup',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data
    
    def test_signup_duplicate_email(self, client, test_user):
        """Test signup with existing email fails."""
        payload = {
            'username': 'differentuser',
            'email': 'test@example.com',  # Same as test_user
            'password': 'securepassword123'
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
            'password': 'securepassword123'
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
            'password': 'short'  # Less than 8 characters
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
            'password': 'password123'
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
            'password': 'password123'
        }
        response = client.post(
            '/api/auth/login',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'token' in data
    
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
            'password': 'password123'
        }
        response = client.post(
            '/api/auth/login',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 403
        data = json.loads(response.data)
        assert 'disabled' in data['error'].lower() or 'inactive' in data['error'].lower()


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
    
    def test_get_me_without_auth(self, client):
        """Test getting user info without authentication fails."""
        response = client.get('/api/auth/me')
        assert response.status_code == 401


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


@pytest.mark.integration
class TestPasswordChangeEndpoint:
    """Test password change endpoint."""
    
    def test_change_password_success(self, authed_client, client, test_user):
        """Test successful password change."""
        payload = {
            'current_password': 'password123',
            'new_password': 'newpassword456'
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
            'password': 'newpassword456'
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
            'new_password': 'newpassword456'
        }
        response = authed_client.put(
            '/api/auth/account/password',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 401


@pytest.mark.integration
class TestEmailChangeEndpoint:
    """Test email change endpoint."""
    
    def test_change_email_success(self, authed_client):
        """Test successful email change."""
        payload = {
            'email': 'newemail@example.com',
            'password': 'password123'
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
            'password': 'password123'
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
            'password': 'password123',
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
            'password': 'password123',
            'confirmation': 'delete'  # Should be uppercase DELETE
        }
        response = authed_client.delete(
            '/api/auth/account',
            data=json.dumps(payload),
            content_type='application/json'
        )
        # Should fail validation
        assert response.status_code == 400
