"""The live demo's public, read-only boundary (blueprints/demo_access.py)."""
import datetime
import importlib
import re
import uuid
from pathlib import Path

import jwt
import pytest

from blueprints.demo_access import DEMO_READ_ENDPOINTS
from config import config
from models import AppSetting, Goal, Note, Session, User
from services.demo_access_service import DEMO_TOKEN_AUDIENCE
from services.demo_account_service import DemoAccountService
from services.landing_publish_service import LandingPublishService

APP_SOURCE = Path(__file__).resolve().parents[2] / 'app.py'


def _all_blueprints():
    from blueprints.agent_api import agent_bp, agent_internal_bp, agent_metadata_bp, agent_oauth_bp
    from blueprints.circuits_api import circuits_bp
    from blueprints.feature_flags_api import feature_flags_bp
    from blueprints.pages import pages_bp
    from blueprints.telemetry_api import telemetry_bp
    return [
        agent_bp, agent_internal_bp, agent_metadata_bp, agent_oauth_bp,
        circuits_bp, feature_flags_bp, pages_bp, telemetry_bp,
    ]


@pytest.fixture
def full_app(app):
    """The test app plus the blueprints it doesn't register, so the matrix sees every route."""
    for blueprint in _all_blueprints():
        if blueprint.name not in app.blueprints:
            app.register_blueprint(blueprint)
    # Every blueprint app.py registers (resolved through its imports), not just the test app's.
    source = APP_SOURCE.read_text()
    module_of = {
        name.strip(): module
        for module, names in re.findall(r'^from (blueprints\.\w+) import ([\w, ]+)$', source, re.M)
        for name in names.split(',')
    }
    registered = re.findall(r'^app\.register_blueprint\((\w+)\)', source, re.M)
    missing = {
        variable for variable in registered
        if getattr(importlib.import_module(module_of[variable]), variable).name not in app.blueprints
    }
    assert not missing, f'app.py registers blueprints the demo matrix does not cover: {missing}'
    return app


@pytest.fixture
def admin_owner(db_session):
    owner = User(
        id=str(uuid.uuid4()),
        username='demo_owner',
        email='demo-owner@example.invalid',
        role='admin',
        terms_accepted_version=config.TERMS_VERSION,
        privacy_accepted_version=config.PRIVACY_VERSION,
    )
    owner.set_password('DemoOwner123!')
    db_session.add(owner)
    db_session.commit()
    return owner


def _root(db_session, owner, name):
    root = Goal(id=str(uuid.uuid4()), name=name, owner_id=owner.id)
    root.root_id = root.id
    db_session.add(root)
    db_session.commit()
    return root


@pytest.fixture
def source_root(db_session, admin_owner):
    return _root(db_session, admin_owner, 'Become a skilled guitar player')


@pytest.fixture
def private_root(db_session, admin_owner):
    return _root(db_session, admin_owner, 'Private plans')


@pytest.fixture
def published(db_session, admin_owner, source_root):
    """Publish the source the real way: the demo serves its snapshot in the demo account."""
    admin_owner.preferences = {
        'completed_primary_color': '#ffaa00',
        'completed_secondary_color': '#332200',
        'theme': {'mode': 'dark'},
    }
    db_session.commit()
    service = LandingPublishService(db_session)
    service.update_landing_example_settings({'examples': [{'root_id': source_root.id, 'label': 'Guitar', 'sort_order': 0}]})
    payload, error, _ = service.publish_landing_examples()
    assert error is None, error
    return payload['examples'][0]['snapshot']['root_id']


@pytest.fixture
def demo_root(db_session, published):
    return db_session.get(Goal, published)


@pytest.fixture
def demo_headers(client, published):
    response = client.post('/api/public/demo-session')
    assert response.status_code == 201
    return {'Authorization': f"Bearer {response.get_json()['token']}"}


def _url(rule, root_id):
    values = {argument: (root_id if argument == 'root_id' else str(uuid.uuid4())) for argument in rule.arguments}
    return re.sub(r'<(?:[^:<>]+:)?([^<>]+)>', lambda match: values[match.group(1)], rule.rule)


def _protected_rules(app):
    for rule in app.url_map.iter_rules():
        view = app.view_functions[rule.endpoint]
        if getattr(view, 'requires_token', False):
            yield rule


@pytest.mark.integration
class TestDemoAccess:
    def test_issues_a_token_only_while_examples_are_published(self, client, db_session):
        assert client.post('/api/public/demo-session').status_code == 404

    def test_session_carries_only_the_owners_completed_colours(self, client, demo_root):
        body = client.post('/api/public/demo-session').get_json()
        assert body['appearance'] == {
            demo_root.id: {'completed_primary_color': '#ffaa00', 'completed_secondary_color': '#332200'},
        }

    def test_the_token_is_not_a_login_session(self, client, demo_headers):
        assert client.get('/api/auth/me', headers=demo_headers).status_code == 403

    def test_reads_the_snapshot_never_the_source(self, client, demo_headers, demo_root, source_root):
        response = client.get(f'/api/{demo_root.id}/goals', headers=demo_headers)
        assert response.status_code == 200
        assert response.get_json()['name'] == 'Become a skilled guitar player'
        assert demo_root.id != source_root.id
        assert client.get(f'/api/{source_root.id}/goals', headers=demo_headers).status_code == 404

    def test_never_reaches_the_owners_other_fractals(self, client, demo_headers, private_root):
        assert client.get(f'/api/{private_root.id}/goals', headers=demo_headers).status_code == 404
        assert client.get(f'/api/goal-levels?root_id={private_root.id}', headers=demo_headers).status_code == 404

    def test_the_demo_runs_as_the_demo_account_not_the_admin(self, db_session, demo_root, admin_owner):
        account = DemoAccountService(db_session).get()
        assert demo_root.owner_id == account.id != admin_owner.id
        assert account.role == 'demo'

    def test_lists_only_the_published_examples(self, client, demo_headers, demo_root, private_root):
        response = client.get('/api/fractals', headers=demo_headers)
        assert response.status_code == 200
        assert [fractal['id'] for fractal in response.get_json()] == [demo_root.id]

    def test_unpublishing_closes_the_demo_immediately(self, client, db_session, demo_headers, demo_root):
        setting = db_session.get(AppSetting, 'landing_example_cache')
        setting.value = {'examples': []}
        db_session.commit()
        assert client.get(f'/api/{demo_root.id}/goals', headers=demo_headers).status_code == 404

    def test_rejects_expired_and_forged_tokens(self, client, published, demo_root):
        now = datetime.datetime.now(datetime.timezone.utc)
        claims = {'aud': DEMO_TOKEN_AUDIENCE, 'roots': [demo_root.id], 'iat': now}
        expired = jwt.encode({**claims, 'exp': now - datetime.timedelta(minutes=1)}, config.JWT_SECRET_KEY, algorithm='HS256')
        forged = jwt.encode({**claims, 'exp': now + datetime.timedelta(hours=1)}, 'not-the-secret', algorithm='HS256')
        for token in (expired, forged):
            response = client.get(f'/api/{demo_root.id}/goals', headers={'Authorization': f'Bearer {token}'})
            assert response.status_code == 401

    def test_cannot_borrow_admin_support_mode(self, client, demo_headers, demo_root, admin_owner):
        response = client.get(
            f'/api/{demo_root.id}/goals?admin_user_id={admin_owner.id}&admin_mode=read_write',
            headers=demo_headers,
        )
        assert response.status_code == 403

    def test_route_matrix(self, full_app, demo_headers, demo_root, private_root, db_session):
        """Every protected route: writes and unlisted reads are refused; listed reads stay on demo roots."""
        client = full_app.test_client()
        counts_before = (db_session.query(Goal).count(), db_session.query(Session).count())
        checked = 0
        rejected_by_validation = 0
        for rule in _protected_rules(full_app):
            for method in sorted(rule.methods - {'HEAD', 'OPTIONS'}):
                response = client.open(_url(rule, demo_root.id), method=method, headers=demo_headers, json={})
                label = f'{method} {rule.rule} ({rule.endpoint})'
                if method == 'GET' and rule.endpoint in DEMO_READ_ENDPOINTS:
                    assert response.status_code not in (401, 403, 500), label
                    if 'root_id' in rule.arguments:
                        other = client.get(_url(rule, private_root.id), headers=demo_headers)
                        assert other.status_code == 404, f'{label} on an unpublished root'
                elif response.status_code in (400, 422):
                    # Request validation runs before auth on some routes; it refuses all the same.
                    rejected_by_validation += 1
                else:
                    assert response.status_code == 403, label
                    assert response.get_json().get('code') == 'demo_read_only', label
                checked += 1
        assert checked > 300
        assert rejected_by_validation < checked // 4
        assert (db_session.query(Goal).count(), db_session.query(Session).count()) == counts_before

    def test_ids_from_another_root_stay_hidden_behind_a_demo_root(self, client, db_session, demo_headers, demo_root, private_root, admin_owner):
        private_goal = Goal(id=str(uuid.uuid4()), name='Private child', owner_id=admin_owner.id,
                            parent_id=private_root.id, root_id=private_root.id)
        private_session = Session(id=str(uuid.uuid4()), name='Private session', root_id=private_root.id, owner_id=admin_owner.id)
        db_session.add_all([private_goal, private_session])
        db_session.flush()
        db_session.add_all([
            Note(root_id=private_root.id, context_type='goal', context_id=private_goal.id,
                 goal_id=private_goal.id, content='PRIVATE-GOAL-NOTE'),
            Note(root_id=private_root.id, context_type='session', context_id=private_session.id,
                 session_id=private_session.id, content='PRIVATE-SESSION-NOTE'),
        ])
        db_session.commit()
        for path in (
            f'/api/{demo_root.id}/goals/{private_goal.id}',
            f'/api/{demo_root.id}/goals/{private_goal.id}/timeline',
            f'/api/{demo_root.id}/goals/{private_goal.id}/notes',
            f'/api/{demo_root.id}/sessions/{private_session.id}',
            f'/api/{demo_root.id}/sessions/{private_session.id}/activities',
            f'/api/{demo_root.id}/sessions/{private_session.id}/notes',
        ):
            response = client.get(path, headers=demo_headers)
            # Not found, or an empty list scoped to the demo root: nothing of the other root either way.
            assert response.status_code in (200, 404), path
            assert 'PRIVATE' not in response.get_data(as_text=True), path
            assert 'Private child' not in response.get_data(as_text=True), path
            assert 'Private session' not in response.get_data(as_text=True), path

    def test_every_listed_endpoint_exists(self, full_app):
        endpoints = {rule.endpoint for rule in full_app.url_map.iter_rules()}
        assert DEMO_READ_ENDPOINTS <= endpoints
