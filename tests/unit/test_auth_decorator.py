from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from flask import Flask
from sqlalchemy.exc import SQLAlchemyError

from blueprints import auth_api
from config import config


@pytest.fixture
def authenticated_user():
    return SimpleNamespace(
        id='user-1',
        preferences={},
        terms_accepted_version=config.TERMS_VERSION,
        privacy_accepted_version=config.PRIVACY_VERSION,
        is_admin=False,
    )


def test_token_required_does_not_relabel_protected_handler_database_errors(
    monkeypatch,
    authenticated_user,
):
    app = Flask(__name__)
    db_session = Mock()
    monkeypatch.setattr(auth_api, 'get_db_session', lambda: db_session)
    monkeypatch.setattr(
        auth_api.AuthService,
        'get_current_user_for_token',
        lambda _service, _token: (authenticated_user, None, 200),
    )

    @auth_api.token_required
    def failing_handler(_current_user):
        raise SQLAlchemyError('protected handler failed')

    with app.test_request_context(
        '/protected',
        method='GET',
        headers={'Authorization': 'Bearer test-token'},
    ):
        with pytest.raises(SQLAlchemyError, match='protected handler failed'):
            failing_handler()

    db_session.close.assert_called_once_with()


def test_token_required_still_handles_authentication_database_errors(monkeypatch):
    app = Flask(__name__)
    db_session = Mock()
    monkeypatch.setattr(auth_api, 'get_db_session', lambda: db_session)

    def fail_authentication(_service, _token):
        raise SQLAlchemyError('authentication failed')

    monkeypatch.setattr(
        auth_api.AuthService,
        'get_current_user_for_token',
        fail_authentication,
    )

    @auth_api.token_required
    def protected_handler(_current_user):
        return 'unreachable'

    with app.test_request_context(
        '/protected',
        method='GET',
        headers={'Authorization': 'Bearer test-token'},
    ):
        response, status = protected_handler()

    assert status == 500
    assert response.get_json() == {'error': 'Internal server error during authentication'}
    db_session.close.assert_called_once_with()
