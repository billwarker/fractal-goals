import gzip
import json
import uuid
from datetime import datetime
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import text

from config import config
from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    AdminAuditEvent,
    AnalyticsDashboard,
    AppSetting,
    BetaSignupRequest,
    CircuitDefinition,
    CircuitSlot,
    EmailDeliveryEvent,
    Goal,
    GoalLevel,
    MetricDefinition,
    MetricValue,
    Note,
    Program,
    Session,
    SessionTemplate,
    SignupInviteKey,
    GoalCompletionCondition,
    User,
    activity_goal_associations,
)
from services.email_service import EmailService, TEST_EMAIL_OUTBOX
from tests.conftest import session_headers_for


def auth_headers_for(user):
    return session_headers_for(user)


def free_limits_with(**overrides):
    limits = {
        'fractals': 1,
        'goals': 50,
        'sessions': 200,
        'activity_instances': 500,
        'activities': 50,
        'circuits': 25,
        'metrics': 20,
        'session_templates': 10,
        'notes': 1000,
        'programs': 5,
    }
    limits.update(overrides)
    return limits


@pytest.fixture
def admin_user(db_session):
    user = User(
        id=str(uuid.uuid4()),
        username='adminuser',
        email='admin@example.com',
        role='admin',
        terms_accepted_version=config.TERMS_VERSION,
        privacy_accepted_version=config.PRIVACY_VERSION,
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
def test_admin_summary_reports_total_database_storage(admin_client, db_session):
    response = admin_client.get('/api/admin/summary')

    assert response.status_code == 200
    payload = json.loads(response.data)
    database_bytes = int(db_session.execute(text("SELECT pg_database_size(current_database())")).scalar() or 0)
    assert payload["storage_bytes"] == database_bytes


@pytest.mark.integration
def test_admin_can_create_and_revoke_invite_key(admin_client):
    response = admin_client.post(
        '/api/admin/invite-keys',
        data=json.dumps({'label': 'Tester wave', 'email': 'Tester@Example.com'}),
        content_type='application/json',
    )
    assert response.status_code == 201
    payload = json.loads(response.data)
    assert payload['key'].startswith('fg_invite_')
    assert payload['status'] == 'available'
    assert payload['assigned_email'] == 'tester@example.com'

    list_response = admin_client.get('/api/admin/invite-keys')
    assert list_response.status_code == 200
    keys = json.loads(list_response.data)
    assert 'key' not in keys[0]
    assert keys[0]['assigned_email'] == 'tester@example.com'

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
        data=json.dumps({'label': 'Signup key', 'email': 'invited@example.com'}),
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
            'accepted_terms': True,
            'terms_version': config.TERMS_VERSION,
            'privacy_version': config.PRIVACY_VERSION,
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
            'accepted_terms': True,
            'terms_version': config.TERMS_VERSION,
            'privacy_version': config.PRIVACY_VERSION,
        }),
        content_type='application/json',
    )
    assert reuse_response.status_code == 400


@pytest.mark.integration
def test_manual_invite_key_is_bound_to_assigned_email(client, admin_client):
    invite_response = admin_client.post(
        '/api/admin/invite-keys',
        data=json.dumps({'label': 'Bound key', 'email': 'bound@example.com'}),
        content_type='application/json',
    )
    invite_key = json.loads(invite_response.data)['key']

    wrong_email_response = client.post(
        '/api/auth/signup',
        data=json.dumps({
            'username': 'wrongbound',
            'email': 'other@example.com',
            'password': 'Password123',
            'invite_key': invite_key,
            'accepted_terms': True,
            'terms_version': config.TERMS_VERSION,
            'privacy_version': config.PRIVACY_VERSION,
        }),
        content_type='application/json',
    )
    assert wrong_email_response.status_code == 400
    assert json.loads(wrong_email_response.data)['error'] == 'Invite key is assigned to a different email'

    correct_email_response = client.post(
        '/api/auth/signup',
        data=json.dumps({
            'username': 'rightbound',
            'email': 'BOUND@example.com',
            'password': 'Password123',
            'invite_key': invite_key,
            'accepted_terms': True,
            'terms_version': config.TERMS_VERSION,
            'privacy_version': config.PRIVACY_VERSION,
        }),
        content_type='application/json',
    )
    assert correct_email_response.status_code == 201


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
        'circuits',
        'metrics',
        'session_templates',
        'notes',
        'programs',
    }
    assert target['usage']['fractals'] == 1
    assert 'used_bytes' in target['storage']
    assert target['storage']['limit_bytes'] == 104857600
    assert target['tier_default_limits']['free']['goals'] == 50
    assert target['tier_default_limits']['paid']['goals'] == 1000
    assert target['tier_default_limits']['legacy'] is None
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
def test_admin_can_soft_delete_user(admin_client, db_session, test_user):
    response = admin_client.delete(f'/api/admin/users/{test_user.id}/soft-delete')
    assert response.status_code == 200
    db_session.refresh(test_user)
    assert test_user.is_active is False
    assert test_user.role == 'user'
    assert test_user.username.startswith('deleted_')


@pytest.mark.integration
def test_admin_cannot_delete_self(admin_client, admin_user):
    response = admin_client.delete(f'/api/admin/users/{admin_user.id}/soft-delete')
    assert response.status_code == 400


@pytest.mark.integration
def test_legacy_delete_route_soft_deletes_user(admin_client, db_session, test_user):
    response = admin_client.delete(f'/api/admin/users/{test_user.id}')
    assert response.status_code == 200
    db_session.refresh(test_user)
    assert test_user.is_active is False
    assert test_user.username.startswith('deleted_')


@pytest.mark.integration
def test_admin_can_hard_delete_user_and_owned_roots(admin_client, db_session, test_user, sample_ultimate_goal):
    user_id = test_user.id
    root_id = sample_ultimate_goal.id
    activity = ActivityDefinition(root_id=root_id, name='Circuit activity')
    circuit = CircuitDefinition(root_id=root_id, name='Deletion circuit')
    db_session.add_all([activity, circuit])
    db_session.flush()
    db_session.add(CircuitSlot(
        circuit_definition_id=circuit.id,
        activity_definition_id=activity.id,
        sort_order=0,
    ))
    db_session.commit()

    response = admin_client.delete(f'/api/admin/users/{user_id}/hard-delete')

    assert response.status_code == 200
    db_session.expire_all()
    assert db_session.get(User, user_id) is None
    assert db_session.get(Goal, root_id) is None


@pytest.fixture
def admin_landing_fractal(db_session, admin_user):
    ultimate_level = db_session.query(GoalLevel).filter_by(name='Ultimate Goal').first()
    long_level = db_session.query(GoalLevel).filter_by(name='Long Term Goal').first()
    if not ultimate_level:
        ultimate_level = GoalLevel(
            id=str(uuid.uuid4()),
            name='Ultimate Goal',
            color='#4f9cf9',
            secondary_color='#102235',
            icon='twelvePointStar',
        )
        db_session.add(ultimate_level)
    if not long_level:
        long_level = GoalLevel(
            id=str(uuid.uuid4()),
            name='Long Term Goal',
            color='#3bc57c',
            secondary_color='#0f271c',
            icon='hexagon',
        )
        db_session.add(long_level)
    db_session.flush()
    root = Goal(
        id=str(uuid.uuid4()),
        name='Public Demo Fractal',
        description='A public-safe admin demo',
        level_id=getattr(ultimate_level, 'id', None),
        owner_id=admin_user.id,
    )
    root.root_id = root.id
    child = Goal(
        id=str(uuid.uuid4()),
        name='Public Demo Child',
        description='A public-safe child goal',
        deadline=datetime(2030, 1, 1),
        level_id=getattr(long_level, 'id', None),
        parent_id=root.id,
        root_id=root.id,
        owner_id=admin_user.id,
    )
    db_session.add_all([root, child])
    db_session.flush()

    # Make the child a genuinely SMART goal (description, deadline,
    # an associated activity, and a completion condition) so the snapshot's canonical SMART
    # computation marks it is_smart — driving the SMART icon styling on landing.
    child.completion_condition = 'activity_threshold'

    # Associate an activity with the child goal and attach a note, so the
    # published snapshot demonstrably carries embedded activities + notes.
    activity = ActivityDefinition(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Public Demo Activity',
    )
    db_session.add(activity)
    db_session.flush()
    condition = GoalCompletionCondition(
        id=str(uuid.uuid4()), goal_id=child.id, root_id=root.id, activity_definition_id=activity.id,
        kind='consistency', measure='sets', required_count=1,
    )
    # The associated_goals relationship is viewonly, so write the link directly.
    db_session.execute(
        activity_goal_associations.insert().values(
            activity_id=activity.id,
            goal_id=child.id,
        )
    )
    session = Session(
        owner_id=admin_user.id,
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Public Demo Session',
        session_start=datetime(2026, 1, 10, 9, 0),
        session_end=datetime(2026, 1, 10, 9, 45),
        duration_minutes=45,
        total_duration_seconds=2700,
        completed=True,
        completed_at=datetime(2026, 1, 10, 9, 45),
        attributes={
            'session_data': {
                'sections': [{
                    'name': 'Main',
                    'duration_minutes': 45,
                    'activity_ids': [],
                }],
            },
        },
    )
    db_session.add(session)
    db_session.flush()
    instance = ActivityInstance(
        id=str(uuid.uuid4()),
        session_id=session.id,
        activity_definition_id=activity.id,
        root_id=root.id,
        duration_seconds=2700,
        completed=True,
        data={},
    )
    db_session.add(instance)
    db_session.flush()
    session.attributes = {
        'session_data': {
            'sections': [{
                'name': 'Main',
                'duration_minutes': 45,
                'activity_ids': [instance.id],
            }],
        },
    }
    template = SessionTemplate(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Public Demo Template',
        description='A reusable public-safe session shape',
        template_data={
            'sections': [{
                'name': 'Main',
                'activities': [{'activity_id': activity.id, 'name': activity.name}],
            }],
        },
    )
    db_session.add(template)
    note = Note(
        id=str(uuid.uuid4()),
        root_id=root.id,
        context_type='goal',
        context_id=child.id,
        goal_id=child.id,
        content='Public-safe demo note',
    )
    db_session.add_all([condition, note])
    db_session.add(AnalyticsDashboard(
        id=str(uuid.uuid4()),
        root_id=root.id,
        user_id=admin_user.id,
        name='Public Demo Analytics View',
        kind='view',
        layout={
            'version': 3,
            'layout': {
                'type': 'grid',
                'panels': [{'id': 'window-1', 'x': 0, 'y': 0, 'w': 96, 'h': 48}],
            },
            'window_states': {
                'window-1': {
                    'selectedCategory': 'sessions',
                    'selectedVisualization': 'sessionTrends',
                    'selectedActivity': None,
                    'selectedGoal': None,
                    'visualizationState': {'grain': 'week', 'metrics': ['sessions', 'duration']},
                    'visualizationStateByKey': {
                        'sessions:sessionTrends': {'grain': 'week', 'metrics': ['sessions', 'duration']},
                    },
                },
            },
            'selected_window_id': 'window-1',
            'global_filters': {
                'goals': {
                    'goalIds': [],
                    'includeDescendants': True,
                    'includeInheritedActivities': True,
                },
                'activities': {
                    'activityIds': [],
                    'groupIds': [],
                    'includeChildren': True,
                },
            },
            'layout_bounds': {'columns': 96, 'rows': 48},
        },
    ))
    db_session.commit()
    return root


@pytest.mark.integration
def test_admin_can_manage_and_publish_landing_examples(admin_client, client, db_session, admin_landing_fractal):
    settings_response = admin_client.get('/api/admin/landing-examples')
    assert settings_response.status_code == 200
    settings = settings_response.get_json()
    assert any(item['root_id'] == admin_landing_fractal.id for item in settings['eligible_fractals'])

    update_response = admin_client.patch(
        '/api/admin/landing-examples',
        data=json.dumps({
            'examples': [{
                'root_id': admin_landing_fractal.id,
                'label': 'Software demo',
                'sort_order': 0,
            }],
        }),
        content_type='application/json',
    )
    assert update_response.status_code == 200
    assert update_response.get_json()['examples'][0]['label'] == 'Software demo'

    db_session.add(GoalLevel(
        id=str(uuid.uuid4()),
        name='Ultimate Goal',
        color='#66d9ef',
        secondary_color='#102235',
        icon='star',
        owner_id=admin_landing_fractal.owner_id,
        root_id=admin_landing_fractal.id,
    ))
    db_session.commit()

    publish_response = admin_client.post(
        '/api/admin/landing-examples/publish',
        data=json.dumps({}),
        content_type='application/json',
    )
    assert publish_response.status_code == 200
    published = publish_response.get_json()
    assert published['published_example_count'] == 1
    snapshot = published['examples'][0]['snapshot']
    assert snapshot['root_id'] != admin_landing_fractal.id
    assert snapshot['counts']['goals'] == 2 and snapshot['counts']['sessions'] == 1
    assert snapshot['source_changed'] is False

    # The public manifest names the snapshot and carries only what the landing draws.
    public_response = client.get('/api/public/landing-examples')
    assert public_response.status_code == 200
    assert public_response.headers['Cache-Control'] == 'no-store'
    public_payload = public_response.get_json()
    assert public_payload['schema_version'] == 15
    public_example = public_payload['examples'][0]
    assert public_example == {
        'root_id': snapshot['root_id'],
        'label': 'Software demo',
        'sort_order': 0,
        'root_name': 'Public Demo Fractal',
        'icon': {'shape': 'star', 'color': '#66d9ef', 'secondary_color': '#102235', 'smart': False},
        'tour': {
            'goal_id': public_example['tour']['goal_id'],
            'session_id': public_example['tour']['session_id'],
            'program_id': None,
        },
        'appearance': {},
        'preview': public_example['preview'],
    }
    assert public_example['preview']['tree']['name'] == 'Public Demo Fractal'
    tour_goal = db_session.get(Goal, public_example['tour']['goal_id'])
    assert tour_goal.name == 'Public Demo Child' and tour_goal.root_id == snapshot['root_id']
    copied_session = db_session.get(Session, public_example['tour']['session_id'])
    assert copied_session.name == 'Public Demo Session' and copied_session.root_id == snapshot['root_id']

    # Editing the source afterwards is flagged until the next publish.
    db_session.get(Goal, admin_landing_fractal.id).name = 'Renamed source'
    db_session.commit()
    status = admin_client.get('/api/admin/landing-examples').get_json()['examples'][0]['snapshot']
    assert status['source_changed'] is True


@pytest.mark.integration
def test_landing_examples_reject_non_admin_owned_roots(admin_client, sample_ultimate_goal):
    response = admin_client.patch(
        '/api/admin/landing-examples',
        data=json.dumps({
            'examples': [{
                'root_id': sample_ultimate_goal.id,
                'label': 'Private user root',
                'sort_order': 0,
            }],
        }),
        content_type='application/json',
    )
    assert response.status_code == 400


@pytest.mark.integration
def test_non_admin_cannot_manage_landing_examples(authed_client):
    assert authed_client.get('/api/admin/landing-examples').status_code == 403
    response = authed_client.patch(
        '/api/admin/landing-examples',
        data=json.dumps({'examples': []}),
        content_type='application/json',
    )
    assert response.status_code == 403


def _landing_example_payload(root_id, tour=None):
    example = {'root_id': root_id, 'label': 'Software demo', 'sort_order': 0}
    if tour is not None:
        example['tour'] = tour
    return json.dumps({'examples': [example]})


@pytest.mark.integration
def test_tour_picks_round_trip_and_follow_the_snapshot(admin_client, client, db_session, admin_landing_fractal):
    program = Program(id=str(uuid.uuid4()), root_id=admin_landing_fractal.id, name='Featured Program',
                      start_date=datetime(2026, 1, 1), end_date=datetime(2026, 3, 1), weekly_schedule={})
    db_session.add(program)
    db_session.commit()
    session_id = db_session.query(Session).filter(Session.root_id == admin_landing_fractal.id).first().id
    tour = {'session_id': session_id, 'program_id': program.id}

    saved = admin_client.patch('/api/admin/landing-examples', data=_landing_example_payload(admin_landing_fractal.id, tour),
                               content_type='application/json')
    assert saved.status_code == 200
    assert saved.get_json()['examples'][0]['tour'] == tour

    assert admin_client.post('/api/admin/landing-examples/publish', data=json.dumps({}),
                             content_type='application/json').status_code == 200
    published = client.get('/api/public/landing-examples').get_json()['examples'][0]
    assert db_session.get(Program, published['tour']['program_id']).name == 'Featured Program'
    assert published['tour']['program_id'] != program.id
    assert db_session.get(Session, published['tour']['session_id']).root_id == published['root_id']

    # Drafts saved before the snapshot demo kept the picks under `showcase`.
    db_session.get(AppSetting, 'landing_example_settings').value = {'examples': [
        {'root_id': admin_landing_fractal.id, 'label': 'Legacy', 'sort_order': 0,
         'showcase': {'session_id': session_id, 'activity_ids': ['gone']}, 'landing_content': {}},
    ]}
    db_session.commit()
    legacy = admin_client.get('/api/admin/landing-examples').get_json()['examples'][0]
    assert legacy['tour'] == {'session_id': session_id, 'program_id': None}


@pytest.mark.integration
def test_publish_landing_examples_static_delivery_contract(admin_client, admin_landing_fractal, monkeypatch, tmp_path):
    import services._landing_static_snapshot as landing_snapshot_module

    def publish(expected_status=200):
        response = admin_client.post(
            '/api/admin/landing-examples/publish',
            data=_landing_example_payload(admin_landing_fractal.id),
            content_type='application/json',
        )
        assert response.status_code == expected_status
        return response.get_json()

    # No static destination configured in tests by default.
    assert publish()['static_snapshot'] == 'skipped'

    # Production fails closed if a deployment loses its static destination.
    previous_published_at = admin_client.get('/api/admin/landing-examples').get_json()['published_at']
    original_env = config.ENV
    monkeypatch.setattr(config, 'ENV', 'production')
    assert 'not changed' in publish(expected_status=503)['error'].lower()
    assert admin_client.get('/api/admin/landing-examples').get_json()['published_at'] == previous_published_at
    monkeypatch.setattr(config, 'ENV', original_env)

    static_snapshot_path = tmp_path / 'landing-examples.json'
    monkeypatch.setattr(config, 'LANDING_EXAMPLES_STATIC_PATH', str(static_snapshot_path))
    static_publish = publish()
    assert static_publish['static_snapshot'] == 'ok'
    static_payload = json.loads(static_snapshot_path.read_text())
    assert static_payload['schema_version'] == 15
    assert static_payload['published_at'] == static_publish['published_at']
    assert static_payload['examples'][0]['root_name'] == 'Public Demo Fractal'
    monkeypatch.setattr(config, 'LANDING_EXAMPLES_STATIC_PATH', '')

    gcs_uploads = []

    static_blob = None

    class _StaticBlob:
        cache_control = None
        content_encoding = None

        def upload_from_string(self, data, **kwargs):
            gcs_uploads.append({'data': data, **kwargs})

    class _StaticBucket:
        def blob(self, name):
            nonlocal static_blob
            assert name == config.LANDING_EXAMPLES_STATIC_GCS_BLOB
            static_blob = _StaticBlob()
            return static_blob

    class _StaticClient:
        def bucket(self, name):
            assert name == 'landing-snapshots'
            return _StaticBucket()

    monkeypatch.setattr(landing_snapshot_module.storage, 'Client', _StaticClient)
    monkeypatch.setattr(config, 'LANDING_EXAMPLES_STATIC_GCS_BUCKET', 'landing-snapshots')
    gcs_publish = publish()
    assert gcs_publish['static_snapshot'] == 'ok'
    assert len(gcs_uploads) == 1
    assert static_blob.cache_control == 'public, max-age=0, must-revalidate, no-transform'
    assert static_blob.content_encoding == 'gzip'
    assert gcs_uploads[0]['content_type'] == 'application/json'
    assert gcs_uploads[0]['timeout'] == min(5.0, config.LANDING_EXAMPLES_STATIC_UPLOAD_TIMEOUT_SECONDS)
    assert gcs_uploads[0]['retry'] is not None
    gcs_payload = json.loads(gzip.decompress(gcs_uploads[0]['data']).decode('utf-8'))
    assert len(gcs_uploads[0]['data']) < len(json.dumps(gcs_payload).encode('utf-8'))
    assert gcs_payload['published_at'] == gcs_publish['published_at']
    assert gcs_payload['examples'][0]['root_name'] == 'Public Demo Fractal'

    def _timed_out_upload(*args, **kwargs):
        raise TimeoutError('static upload exceeded its delivery budget')

    monkeypatch.setattr(_StaticBlob, 'upload_from_string', _timed_out_upload)
    timed_out_publish = publish(expected_status=503)
    assert 'published examples were not changed' in timed_out_publish['error'].lower()
    unchanged = admin_client.get('/api/admin/landing-examples').get_json()
    assert unchanged['published_at'] == gcs_publish['published_at']
    assert unchanged['delivery']['revision'] == gcs_publish['revision']
    monkeypatch.setattr(config, 'LANDING_EXAMPLES_STATIC_GCS_BUCKET', '')


@pytest.mark.integration
def test_publish_landing_examples_rejects_oversized_snapshot_without_changing_publication(
    admin_client,
    admin_landing_fractal,
    monkeypatch,
):
    initial = admin_client.post(
        '/api/admin/landing-examples/publish',
        data=_landing_example_payload(admin_landing_fractal.id),
        content_type='application/json',
    )
    assert initial.status_code == 200
    initial_payload = initial.get_json()

    monkeypatch.setattr(config, 'LANDING_EXAMPLES_MAX_UNCOMPRESSED_BYTES', 1)
    rejected = admin_client.post(
        '/api/admin/landing-examples/publish',
        data=_landing_example_payload(admin_landing_fractal.id),
        content_type='application/json',
    )

    assert rejected.status_code == 413
    rejected_error = rejected.get_json()['error'].lower()
    assert 'too large to publish' in rejected_error
    assert 'expanded bytes' in rejected_error
    assert 'transfer bytes' in rejected_error
    unchanged = admin_client.get('/api/public/landing-examples').get_json()
    assert unchanged['published_at'] == initial_payload['published_at']
    assert unchanged['revision'] == initial_payload['revision']


@pytest.mark.integration
def test_publish_landing_examples_rejects_oversized_compressed_snapshot(
    admin_client,
    admin_landing_fractal,
    monkeypatch,
):
    monkeypatch.setattr(config, 'LANDING_EXAMPLES_MAX_COMPRESSED_BYTES', 1)

    rejected = admin_client.post(
        '/api/admin/landing-examples/publish',
        data=_landing_example_payload(admin_landing_fractal.id),
        content_type='application/json',
    )

    assert rejected.status_code == 413
    assert rejected.get_json()['error'].startswith('The compressed demo manifest is too large to publish')
    assert admin_client.get('/api/public/landing-examples').get_json()['published_at'] is None


@pytest.mark.integration
def test_publish_leaves_publication_unchanged_when_static_delivery_fails(
    db_session,
    admin_landing_fractal,
    monkeypatch,
):
    from services.landing_publish_service import LandingPublishService

    service = LandingPublishService(db_session)
    monkeypatch.setattr(service, '_write_landing_static_snapshot', lambda *args, **kwargs: 'failed')

    payload, error, status = service.publish_landing_examples(
        examples_override=json.loads(_landing_example_payload(admin_landing_fractal.id))['examples'],
    )

    assert payload is None
    assert status == 503
    assert 'delivery failed' in error
    assert service._get_app_setting_value('landing_example_cache', None) is None


@pytest.mark.integration
def test_publish_restores_static_snapshot_when_database_commit_fails(
    db_session,
    admin_landing_fractal,
    monkeypatch,
):
    from services.landing_publish_service import LandingPublishService

    service = LandingPublishService(db_session)
    restored = []
    monkeypatch.setattr(service, '_write_landing_static_snapshot', lambda *args, **kwargs: 'ok')
    monkeypatch.setattr(
        service,
        '_restore_landing_static_snapshot',
        lambda previous: restored.append(previous) or True,
    )
    monkeypatch.setattr(db_session, 'commit', lambda: (_ for _ in ()).throw(RuntimeError('commit failed')))

    with pytest.raises(RuntimeError, match='commit failed'):
        service.publish_landing_examples(
            examples_override=json.loads(_landing_example_payload(admin_landing_fractal.id))['examples'],
        )

    assert len(restored) == 1
    assert restored[0].get('published_at') is None


@pytest.mark.integration
def test_landing_example_options_endpoint(admin_client, authed_client, db_session, admin_landing_fractal, sample_ultimate_goal):
    root = admin_landing_fractal
    group = ActivityGroup(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Options Group',
        sort_order=0,
    )
    program = Program(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Options Program',
        start_date=datetime(2026, 1, 1),
        end_date=datetime(2026, 3, 1),
        weekly_schedule={},
    )
    db_session.add_all([group, program])
    db_session.flush()
    db_session.query(ActivityDefinition).filter(
        ActivityDefinition.root_id == root.id,
        ActivityDefinition.name == 'Public Demo Activity',
    ).update({'group_id': group.id})
    db_session.commit()

    response = admin_client.get(f'/api/admin/landing-examples/options?root_id={root.id}')
    assert response.status_code == 200
    options = response.get_json()
    assert set(options) == {'root_id', 'sessions', 'programs'}
    assert options['root_id'] == root.id
    assert [session['name'] for session in options['sessions']] == ['Public Demo Session']
    assert options['sessions'][0]['activity_instance_count'] == 1
    assert [item['name'] for item in options['programs']] == ['Options Program']

    assert admin_client.get('/api/admin/landing-examples/options').status_code == 400
    # Roots not owned by an active admin are rejected.
    assert admin_client.get(
        f'/api/admin/landing-examples/options?root_id={sample_ultimate_goal.id}'
    ).status_code == 400
    assert authed_client.get(
        f'/api/admin/landing-examples/options?root_id={root.id}'
    ).status_code == 403


@pytest.mark.integration
def test_admin_cannot_hard_delete_self(admin_client, admin_user):
    response = admin_client.delete(f'/api/admin/users/{admin_user.id}/hard-delete')
    assert response.status_code == 400


@pytest.mark.integration
def test_admin_named_user_actions(admin_client, db_session, test_user):
    tier_response = admin_client.patch(
        f'/api/admin/users/{test_user.id}/tier',
        data=json.dumps({'membership_tier': 'paid'}),
        content_type='application/json',
    )
    assert tier_response.status_code == 200
    assert json.loads(tier_response.data)['membership_tier'] == 'paid'

    quota_response = admin_client.patch(
        f'/api/admin/users/{test_user.id}/quota',
        data=json.dumps({'quota_overrides': {'goals': 123}, 'storage_limit_bytes': 4096}),
        content_type='application/json',
    )
    assert quota_response.status_code == 200
    quota_payload = json.loads(quota_response.data)
    assert quota_payload['quota_overrides']['goals'] == 123
    assert quota_payload['storage']['limit_bytes'] == 4096

    status_response = admin_client.patch(
        f'/api/admin/users/{test_user.id}/status',
        data=json.dumps({'is_active': False}),
        content_type='application/json',
    )
    assert status_response.status_code == 200
    assert json.loads(status_response.data)['is_active'] is False

    test_user.failed_login_count = 5
    test_user.locked_until = datetime.utcnow()
    db_session.commit()
    unlock_response = admin_client.patch(f'/api/admin/users/{test_user.id}/unlock')
    assert unlock_response.status_code == 200
    unlock_payload = json.loads(unlock_response.data)
    assert unlock_payload['failed_login_count'] == 0
    assert unlock_payload['locked_until'] is None

    force_response = admin_client.patch(
        f'/api/admin/users/{test_user.id}/force-password-change',
        data=json.dumps({'force_password_change': True}),
        content_type='application/json',
    )
    assert force_response.status_code == 200
    assert json.loads(force_response.data)['force_password_change'] is True

    role_response = admin_client.patch(
        f'/api/admin/users/{test_user.id}/role',
        data=json.dumps({'role': 'admin'}),
        content_type='application/json',
    )
    assert role_response.status_code == 200
    assert json.loads(role_response.data)['role'] == 'admin'


@pytest.mark.integration
def test_admin_can_manage_tier_quotas_with_apply_scope(admin_client, db_session, test_user):
    settings_response = admin_client.get('/api/admin/tier-quotas')
    assert settings_response.status_code == 200
    settings_payload = json.loads(settings_response.data)
    assert settings_payload['tier_default_limits']['free']['goals'] == 50
    assert settings_payload['tier_storage_limit_bytes']['free'] == 104857600
    assert settings_payload['tier_default_limits']['legacy'] is None

    original_storage_limit = test_user.storage_limit_bytes
    new_users_only_response = admin_client.patch(
        '/api/admin/tier-quotas',
        data=json.dumps({
            'tier': 'free',
            'limits': free_limits_with(goals=88),
            'storage_limit_bytes': 209715200,
            'apply_existing_users': False,
        }),
        content_type='application/json',
    )
    assert new_users_only_response.status_code == 200
    db_session.refresh(test_user)
    assert test_user.quota_overrides['goals'] == 50
    assert test_user.storage_limit_bytes == original_storage_limit

    created_user_response = admin_client.post(
        '/api/admin/users',
        data=json.dumps({
            'username': 'tierstorage',
            'email': 'tierstorage@example.com',
        }),
        content_type='application/json',
    )
    assert created_user_response.status_code == 201
    assert json.loads(created_user_response.data)['storage_limit_bytes'] == 209715200

    apply_existing_response = admin_client.patch(
        '/api/admin/tier-quotas',
        data=json.dumps({
            'tier': 'free',
            'limits': free_limits_with(goals=99),
            'storage_limit_bytes': 314572800,
            'apply_existing_users': True,
        }),
        content_type='application/json',
    )
    assert apply_existing_response.status_code == 200
    db_session.refresh(test_user)
    assert test_user.quota_overrides == {}
    assert test_user.storage_limit_bytes == 314572800
    assert json.loads(apply_existing_response.data)['tier_default_limits']['free']['goals'] == 99
    assert json.loads(apply_existing_response.data)['tier_storage_limit_bytes']['free'] == 314572800


@pytest.mark.integration
def test_admin_tier_quota_update_rejects_legacy_and_invalid_resources(admin_client):
    legacy_response = admin_client.patch(
        '/api/admin/tier-quotas',
        data=json.dumps({
            'tier': 'legacy',
            'limits': free_limits_with(goals=10),
            'storage_limit_bytes': 104857600,
            'apply_existing_users': True,
        }),
        content_type='application/json',
    )
    assert legacy_response.status_code == 400

    invalid_response = admin_client.patch(
        '/api/admin/tier-quotas',
        data=json.dumps({
            'tier': 'free',
            'limits': {'goals': 10},
            'storage_limit_bytes': 104857600,
            'apply_existing_users': True,
        }),
        content_type='application/json',
    )
    assert invalid_response.status_code == 400


@pytest.mark.integration
def test_admin_can_generate_temporary_password(admin_client, db_session, test_user):
    test_user.failed_login_count = 5
    db_session.commit()

    response = admin_client.post(f'/api/admin/users/{test_user.id}/temporary-password')

    assert response.status_code == 200
    payload = json.loads(response.data)
    assert payload['temporary_password'].startswith('A1')
    assert payload['force_password_change'] is True
    db_session.refresh(test_user)
    assert test_user.failed_login_count == 0
    assert test_user.locked_until is None
    assert test_user.check_password(payload['temporary_password'])


@pytest.mark.integration
def test_non_admin_cannot_call_admin_user_actions(authed_client, test_user):
    response = authed_client.post(f'/api/admin/users/{test_user.id}/temporary-password')
    assert response.status_code == 403


@pytest.mark.integration
def test_admin_read_only_and_read_write_fractal_access(client, db_session, admin_user, test_user, sample_ultimate_goal):
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

    rows = db_session.query(AdminAuditEvent).filter_by(
        actor_user_id=admin_user.id,
        target_user_id=test_user.id,
        action='support_access',
    ).all()
    assert [(row.event_metadata['method'], row.event_metadata['mode']) for row in rows] == [
        ('GET', 'read_only'),
        ('POST', 'read_write'),
    ]


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


@pytest.fixture
def sample_beta_signups(db_session):
    signups = [
        BetaSignupRequest(email='new@test.example', use_case='Learn jazz guitar', status='new', source='landing_page'),
        BetaSignupRequest(email='invited@test.example', use_case='Run a sub-20 5K', status='invited', source='landing_page'),
        BetaSignupRequest(email='dismissed@test.example', status='dismissed', source='landing_page'),
    ]
    db_session.add_all(signups)
    db_session.commit()
    return signups


@pytest.mark.integration
def test_non_admin_cannot_list_beta_signups(authed_client):
    response = authed_client.get('/api/admin/beta-signups')
    assert response.status_code == 403


@pytest.mark.integration
def test_admin_lists_beta_signups_with_status_counts(admin_client, sample_beta_signups):
    response = admin_client.get('/api/admin/beta-signups')
    assert response.status_code == 200
    payload = json.loads(response.data)
    assert payload['total'] == 3
    assert payload['status_counts'] == {'new': 1, 'invited': 1, 'dismissed': 1, 'total': 3}
    # Newest-first ordering puts the most recently created signup first.
    assert {r['email'] for r in payload['requests']} == {
        'new@test.example', 'invited@test.example', 'dismissed@test.example',
    }


@pytest.mark.integration
def test_admin_beta_signups_include_latest_invite_email_status(admin_client, db_session, sample_beta_signups):
    target = sample_beta_signups[0]
    older = EmailDeliveryEvent(
        provider='resend',
        template_key='beta_invite',
        beta_signup_id=target.id,
        provider_message_id='email-old',
        status='sent',
        created_at=datetime(2026, 7, 7, 12, 0, 0),
    )
    latest = EmailDeliveryEvent(
        provider='resend',
        template_key='beta_invite',
        beta_signup_id=target.id,
        provider_message_id='email-new',
        status='delivered',
        last_event_type='email.delivered',
        created_at=datetime(2026, 7, 7, 12, 1, 0),
    )
    db_session.add_all([older, latest])
    db_session.commit()

    response = admin_client.get('/api/admin/beta-signups')
    assert response.status_code == 200
    request = next(item for item in json.loads(response.data)['requests'] if item['id'] == target.id)
    assert request['invite_email_status'] == 'delivered'
    assert request['invite_email_last_event_type'] == 'email.delivered'


@pytest.mark.integration
def test_admin_filters_beta_signups_by_status(admin_client, sample_beta_signups):
    response = admin_client.get('/api/admin/beta-signups?status=new')
    assert response.status_code == 200
    payload = json.loads(response.data)
    assert payload['total'] == 1
    assert payload['requests'][0]['email'] == 'new@test.example'
    # Counts ignore the active filter so the full breakdown stays visible.
    assert payload['status_counts']['total'] == 3


@pytest.mark.integration
def test_admin_searches_beta_signups_by_goal(admin_client, sample_beta_signups):
    response = admin_client.get('/api/admin/beta-signups?q=jazz')
    assert response.status_code == 200
    payload = json.loads(response.data)
    assert payload['total'] == 1
    assert payload['requests'][0]['email'] == 'new@test.example'


@pytest.mark.integration
def test_admin_updates_beta_signup_status(admin_client, db_session, sample_beta_signups):
    target = sample_beta_signups[0]
    response = admin_client.patch(
        f'/api/admin/beta-signups/{target.id}',
        data=json.dumps({'status': 'invited'}),
        content_type='application/json',
    )
    assert response.status_code == 200
    assert json.loads(response.data)['request']['status'] == 'invited'
    db_session.refresh(target)
    assert target.status == 'invited'
    assert target.invited_at is not None


@pytest.mark.integration
def test_admin_rejects_invalid_beta_signup_status(admin_client, sample_beta_signups):
    target = sample_beta_signups[0]
    response = admin_client.patch(
        f'/api/admin/beta-signups/{target.id}',
        data=json.dumps({'status': 'bogus'}),
        content_type='application/json',
    )
    assert response.status_code == 400


@pytest.mark.integration
def test_non_admin_cannot_send_beta_signup_invite(authed_client, sample_beta_signups):
    response = authed_client.post(f'/api/admin/beta-signups/{sample_beta_signups[0].id}/send-invite')
    assert response.status_code == 403


@pytest.mark.integration
def test_admin_sends_beta_signup_invite(admin_client, db_session, sample_beta_signups):
    EmailService.clear_test_outbox()
    target = sample_beta_signups[0]

    response = admin_client.post(f'/api/admin/beta-signups/{target.id}/send-invite')

    assert response.status_code == 200
    payload = json.loads(response.data)['request']
    assert payload['status'] == 'invited'
    assert payload['last_invite_email_sent_at'] is not None
    assert len(TEST_EMAIL_OUTBOX) == 1
    assert TEST_EMAIL_OUTBOX[0]['to'] == target.email
    assert 'fg_invite_' in TEST_EMAIL_OUTBOX[0]['text']
    assert 'fg_invite_' in TEST_EMAIL_OUTBOX[0]['html']
    assert f"email={target.email.replace('@', '%40')}" in TEST_EMAIL_OUTBOX[0]['text']
    assert 'Signup is invite-only' in TEST_EMAIL_OUTBOX[0]['text']

    db_session.refresh(target)
    assert target.status == 'invited'
    assert target.invite_key_id is not None
    invite = db_session.get(SignupInviteKey, target.invite_key_id)
    assert invite is not None
    assert invite.key_hash not in TEST_EMAIL_OUTBOX[0]['text']
    event = db_session.query(EmailDeliveryEvent).filter_by(beta_signup_id=target.id).one()
    assert event.status == 'sent'
    assert event.template_key == 'beta_invite'


@pytest.mark.integration
def test_beta_signup_invite_key_is_bound_to_signup_email(admin_client, client, db_session, sample_beta_signups):
    EmailService.clear_test_outbox()
    target = sample_beta_signups[0]

    response = admin_client.post(f'/api/admin/beta-signups/{target.id}/send-invite')

    assert response.status_code == 200
    signup_url = TEST_EMAIL_OUTBOX[0]['text'].splitlines()[3]
    params = parse_qs(urlparse(signup_url).query)
    invite_key = params['invite_key'][0]
    assert params['email'][0] == target.email

    wrong_email_response = client.post(
        '/api/auth/signup',
        data=json.dumps({
            'username': 'wrong-email',
            'email': 'someone-else@example.com',
            'password': 'Password123',
            'invite_key': invite_key,
            'accepted_terms': True,
            'terms_version': config.TERMS_VERSION,
            'privacy_version': config.PRIVACY_VERSION,
        }),
        content_type='application/json',
    )
    assert wrong_email_response.status_code == 400
    assert json.loads(wrong_email_response.data)['error'] == 'Invite key is assigned to a different email'

    correct_email_response = client.post(
        '/api/auth/signup',
        data=json.dumps({
            'username': 'right-email',
            'email': target.email.upper(),
            'password': 'Password123',
            'invite_key': invite_key,
            'accepted_terms': True,
            'terms_version': config.TERMS_VERSION,
            'privacy_version': config.PRIVACY_VERSION,
        }),
        content_type='application/json',
    )
    assert correct_email_response.status_code == 201
    created_user = db_session.query(User).filter_by(username='right-email').one()
    assert created_user.email == target.email


@pytest.mark.integration
def test_admin_beta_signup_invite_cooldown_prevents_immediate_resend(admin_client, db_session, sample_beta_signups):
    EmailService.clear_test_outbox()
    target = sample_beta_signups[0]

    first = admin_client.post(f'/api/admin/beta-signups/{target.id}/send-invite')
    db_session.refresh(target)
    first_invite_key_id = target.invite_key_id
    second = admin_client.post(f'/api/admin/beta-signups/{target.id}/send-invite')

    assert first.status_code == 200
    assert second.status_code == 429
    assert len(TEST_EMAIL_OUTBOX) == 1
    db_session.refresh(target)
    assert target.invite_key_id == first_invite_key_id
    assert db_session.query(EmailDeliveryEvent).filter_by(beta_signup_id=target.id).count() == 1


@pytest.mark.integration
def test_failed_beta_signup_invite_does_not_mark_invited(admin_client, db_session, sample_beta_signups, monkeypatch):
    from config import Config

    target = sample_beta_signups[0]
    monkeypatch.setattr(Config, "EMAIL_PROVIDER", "disabled")

    response = admin_client.post(f'/api/admin/beta-signups/{target.id}/send-invite')

    assert response.status_code == 502
    db_session.refresh(target)
    assert target.status == 'new'
    assert target.invite_key_id is None
    event = db_session.query(EmailDeliveryEvent).filter_by(beta_signup_id=target.id).one()
    assert event.status == 'failed'
    assert event.template_key == 'beta_invite'


@pytest.mark.integration
def test_admin_exports_beta_signups_csv(admin_client, sample_beta_signups):
    response = admin_client.get('/api/admin/beta-signups/export.csv')
    assert response.status_code == 200
    assert response.headers['Content-Type'].startswith('text/csv')
    assert 'attachment' in response.headers['Content-Disposition']
    body = response.data.decode('utf-8')
    assert body.splitlines()[0] == 'email,goal,status,source,created_at,updated_at,note'
    assert 'new@test.example' in body
    assert 'Learn jazz guitar' in body


@pytest.mark.integration
def test_temporary_password_forces_change_before_api_access(admin_client, client, db_session, test_user):
    """Full lifecycle: temp password -> gated API access -> change -> unblocked."""
    temp_response = admin_client.post(f'/api/admin/users/{test_user.id}/temporary-password')
    assert temp_response.status_code == 200
    temp_password = json.loads(temp_response.data)['temporary_password']

    login_response = client.post(
        '/api/auth/login',
        data=json.dumps({'username_or_email': 'testuser', 'password': temp_password}),
        content_type='application/json',
    )
    assert login_response.status_code == 200
    login_payload = json.loads(login_response.data)
    assert login_payload['user']['must_change_password'] is True
    user_headers = {
        'Authorization': f"Bearer {login_payload['token']}",
        'Content-Type': 'application/json',
    }

    gated_response = client.get('/api/auth/account/usage', headers=user_headers)
    assert gated_response.status_code == 403
    assert json.loads(gated_response.data)['code'] == 'password_change_required'

    change_response = client.put(
        '/api/auth/account/password',
        data=json.dumps({'current_password': temp_password, 'new_password': 'Newpassword456'}),
        content_type='application/json',
        headers=user_headers,
    )
    assert change_response.status_code == 200
    assert client.get('/api/auth/account/usage', headers=user_headers).status_code == 401
    user_headers['Authorization'] = f"Bearer {json.loads(change_response.data)['token']}"

    unblocked_response = client.get('/api/auth/account/usage', headers=user_headers)
    assert unblocked_response.status_code == 200
