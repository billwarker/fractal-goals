import json
import uuid
from datetime import datetime

import jwt
import pytest

from config import config
from models import (
    ActivityDefinition,
    ActivityInstance,
    AppSetting,
    Goal,
    GoalLevel,
    Note,
    Session,
    SessionTemplate,
    Target,
    User,
    activity_goal_associations,
)


def auth_headers_for(user):
    import datetime
    from datetime import timezone

    token = jwt.encode({
        'user_id': user.id,
        'exp': datetime.datetime.now(timezone.utc) + datetime.timedelta(hours=24),
    }, config.JWT_SECRET_KEY, algorithm="HS256")
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


def free_limits_with(**overrides):
    limits = {
        'fractals': 1,
        'goals': 50,
        'sessions': 200,
        'activity_instances': 500,
        'activities': 50,
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
        relevance_statement='It ladders up to the demo ultimate goal',
        deadline=datetime(2030, 1, 1),
        level_id=getattr(long_level, 'id', None),
        parent_id=root.id,
        root_id=root.id,
        owner_id=admin_user.id,
    )
    db_session.add_all([root, child])
    db_session.flush()

    # Make the child a genuinely SMART goal (description, relevance, deadline,
    # an associated activity, and a target) so the snapshot's canonical SMART
    # computation marks it is_smart — driving the SMART icon styling on landing.
    target = Target(
        id=str(uuid.uuid4()),
        goal_id=child.id,
        root_id=root.id,
        name='Public Demo Target',
    )

    # Associate an activity with the child goal and attach a note, so the
    # published snapshot demonstrably carries embedded activities + notes.
    activity = ActivityDefinition(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Public Demo Activity',
    )
    db_session.add(activity)
    db_session.flush()
    # The associated_goals relationship is viewonly, so write the link directly.
    db_session.execute(
        activity_goal_associations.insert().values(
            activity_id=activity.id,
            goal_id=child.id,
        )
    )
    session = Session(
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
    db_session.add_all([target, note])
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
    assert publish_response.get_json()['published_example_count'] == 1

    public_response = client.get('/api/public/landing-examples')
    assert public_response.status_code == 200
    public_payload = public_response.get_json()
    public_example = public_payload['examples'][0]
    assert public_example['label'] == 'Software demo'
    assert public_example['tree']['name'] == 'Public Demo Fractal'
    assert public_example['tree']['children'][0]['name'] == 'Public Demo Child'
    assert public_example['tree']['level']['icon'] == 'star'
    assert public_example['tree']['attributes']['level']['color'] == '#66d9ef'
    assert 'owner_id' not in public_example['tree']['attributes']
    assert public_example['tree']['attributes']['associated_activity_ids'] == []
    assert public_payload['published_at']

    # The published snapshot is self-contained: each goal embeds its activities,
    # timeline, and notes so the read-only landing modal needs no authenticated API.
    root_attributes = public_example['tree']['attributes']
    assert isinstance(root_attributes['associated_activities'], list)
    assert isinstance(root_attributes['timeline_events'], list)
    assert isinstance(root_attributes['notes'], list)
    child_attributes = public_example['tree']['children'][0]['attributes']
    assert isinstance(child_attributes['associated_activities'], list)
    assert isinstance(child_attributes['timeline_events'], list)
    assert isinstance(child_attributes['notes'], list)
    # The child goal's associated activity and note are embedded in the snapshot.
    assert [a['name'] for a in child_attributes['associated_activities']] == ['Public Demo Activity']
    assert child_attributes['associated_activity_ids']
    assert any(note.get('content') == 'Public-safe demo note' for note in child_attributes['notes'])

    # The child is genuinely SMART; the snapshot uses the app's canonical SMART
    # logic so is_smart is true (driving SMART icon styling on the landing page).
    assert child_attributes['is_smart'] is True
    assert child_attributes['smart_status']['measurable'] is True
    assert child_attributes['smart_status']['achievable'] is True
    assert public_example['tree']['children'][0]['is_smart'] is True

    # Root-level flowtree data mirrors what the authenticated goals page consumes,
    # so the landing view-options widget (fade/hide-inactive, hide-completed, metrics
    # overlay, program alignment) acts on real data with no authenticated API.
    assert isinstance(public_example['evidence_goal_ids'], list)
    assert isinstance(public_example['metrics_summary'], dict)
    assert isinstance(public_example['programs'], list)
    assert [session['name'] for session in public_example['sessions']] == ['Public Demo Session']
    assert [template['name'] for template in public_example['session_templates']] == ['Public Demo Template']
    assert [activity['name'] for activity in public_example['activity_definitions']] == ['Public Demo Activity']
    assert isinstance(public_example['activity_groups'], list)
    assert isinstance(public_example['analytics_charts'], list)

    # Snapshot carries a schema version for forward-safe shape evolution.
    assert public_example['schema_version'] == 4
    assert public_payload['schema_version'] == 4

    cache = db_session.get(AppSetting, 'landing_example_cache')
    assert cache is not None
    assert cache.value['examples'][0]['root_id'] == admin_landing_fractal.id
    assert cache.value['schema_version'] == 4


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
