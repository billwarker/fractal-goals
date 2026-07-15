import json
import uuid
from datetime import datetime
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from sqlalchemy import text

from config import config
from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    AnalyticsDashboard,
    AppSetting,
    BetaSignupRequest,
    EmailDeliveryEvent,
    Goal,
    GoalLevel,
    MetricDefinition,
    MetricValue,
    Note,
    ProgressRecord,
    Program,
    Session,
    SessionTemplate,
    SignupInviteKey,
    Target,
    User,
    activity_goal_associations,
)
from services.email_service import EmailService, TEST_EMAIL_OUTBOX


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
                    'selectedModeIds': [],
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

    catalogue_group = ActivityGroup(
        id=str(uuid.uuid4()),
        root_id=admin_landing_fractal.id,
        name='Catalogue Group',
        sort_order=0,
    )
    catalogue_only_activity = ActivityDefinition(
        id=str(uuid.uuid4()),
        root_id=admin_landing_fractal.id,
        group_id=catalogue_group.id,
        name='Catalogue-only Activity',
    )
    db_session.add_all([catalogue_group, catalogue_only_activity])
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
    assert public_payload['published_at']

    # The published snapshot is self-contained: each goal embeds its activities,
    # timeline, and notes so the read-only landing modal needs no authenticated API.
    root_attributes = public_example['tree']['attributes']
    assert isinstance(root_attributes['associated_activities'], list)
    assert isinstance(root_attributes['timeline_events'], list)
    assert isinstance(root_attributes['notes'], list)
    assert [a['name'] for a in root_attributes['associated_activities']] == ['Public Demo Activity']
    assert root_attributes['associated_activities'][0]['has_direct_association'] is False
    assert root_attributes['associated_activities'][0]['inherited_from_children'] is True
    child_attributes = public_example['tree']['children'][0]['attributes']
    assert isinstance(child_attributes['associated_activities'], list)
    assert isinstance(child_attributes['timeline_events'], list)
    assert isinstance(child_attributes['notes'], list)
    # The child goal's associated activity and note are embedded in the snapshot.
    assert [a['name'] for a in child_attributes['associated_activities']] == ['Public Demo Activity']
    assert 'associated_goals' not in child_attributes['associated_activities'][0]
    assert 'split_definitions' not in child_attributes['associated_activities'][0]
    assert 'created_at' not in child_attributes['associated_activities'][0]
    for event in child_attributes['timeline_events']:
        assert 'root_id' not in (event.get('payload') or {})
        assert 'updated_at' not in (event.get('payload') or {})
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
    assert [activity['name'] for activity in public_example['activity_definitions']] == [
        'Catalogue-only Activity', 'Public Demo Activity',
    ]
    assert [group['name'] for group in public_example['activity_groups']] == ['Catalogue Group']
    demo_activity = next(
        activity for activity in public_example['activity_definitions']
        if activity['name'] == 'Public Demo Activity'
    )
    demo_activity_summary = public_example['activity_instantiation_summary'][demo_activity['id']]
    assert demo_activity_summary['instance_count'] == 1
    assert demo_activity_summary['average_duration_seconds'] == 2700
    assert demo_activity_summary['last_used_at']
    assert [view['name'] for view in public_example['analytics_views']] == ['Public Demo Analytics View']

    # Snapshot carries a schema version for forward-safe shape evolution.
    assert public_example['schema_version'] == 10
    assert public_payload['schema_version'] == 10
    assert [bullet['key'] for bullet in public_example['landing_content']['goals']['bullets']] == [
        'break_down', 'associate_activities', 'set_targets',
    ]
    assert public_example['landing_content']['goals']['bullets'][0]['heading'] == 'Break it down'

    # Without admin curation, the showcase key is still present with stable
    # null/empty defaults so the frontend never branches on key existence.
    assert public_example['showcase'] == {
        'session_id': None,
        'activity_ids': [],
        'program_id': None,
        'program_start_date': None,
        'program_end_date': None,
        'analytics_view_ids': [],
    }

    # Published responses serve with short public caching; the cache only
    # changes on manual publish.
    assert public_response.headers['Cache-Control'] == 'public, max-age=300, stale-while-revalidate=86400'

    cache = db_session.get(AppSetting, 'landing_example_cache')
    assert cache is not None
    assert cache.value['examples'][0]['root_id'] == admin_landing_fractal.id
    assert cache.value['schema_version'] == 10


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


def _landing_example_payload(root_id, showcase=None):
    example = {'root_id': root_id, 'label': 'Software demo', 'sort_order': 0}
    if showcase is not None:
        example['showcase'] = showcase
    return json.dumps({'examples': [example]})


@pytest.mark.integration
def test_landing_example_showcase_settings_round_trip(admin_client, db_session, admin_landing_fractal):
    showcase = {
        'session_id': 'session-1',
        'activity_ids': ['activity-1'],
        'program_id': 'program-1',
        'program_start_date': '2026-01-05',
        'program_end_date': '2026-01-20',
        'analytics_view_ids': ['analytics-view-1'],
    }
    response = admin_client.patch(
        '/api/admin/landing-examples',
        data=_landing_example_payload(admin_landing_fractal.id, showcase),
        content_type='application/json',
    )
    assert response.status_code == 200
    saved = response.get_json()['examples'][0]['showcase']
    assert saved == showcase

    # GET returns the persisted, normalized showcase.
    settings = admin_client.get('/api/admin/landing-examples').get_json()
    assert settings['examples'][0]['showcase'] == showcase

    # Saving without a showcase normalizes to stable null/empty defaults.
    response = admin_client.patch(
        '/api/admin/landing-examples',
        data=_landing_example_payload(admin_landing_fractal.id),
        content_type='application/json',
    )
    assert response.status_code == 200
    assert response.get_json()['examples'][0]['showcase'] == {
        'session_id': None,
        'activity_ids': [],
        'program_id': None,
        'program_start_date': None,
        'program_end_date': None,
        'analytics_view_ids': [],
    }


@pytest.mark.integration
def test_landing_goals_content_round_trips_and_publishes_selected_examples(
    admin_client, client, db_session, admin_landing_fractal,
):
    child = db_session.query(Goal).filter(
        Goal.root_id == admin_landing_fractal.id,
        Goal.parent_id.is_not(None),
    ).first()
    target = db_session.query(Target).filter(Target.goal_id == child.id).first()
    landing_content = {
        'goals': {
            'bullets': [
                {
                    'key': 'break_down',
                    'heading': 'Build the path',
                    'body': 'Turn the outcome into achievable steps.',
                    'goal_id': child.id,
                    'target_id': None,
                },
                {
                    'key': 'associate_activities',
                    'heading': 'Connect the work',
                    'body': 'Let evidence roll through the goal lineage.',
                    'goal_id': child.id,
                    'target_id': None,
                },
                {
                    'key': 'set_targets',
                    'heading': 'Measure the outcome',
                    'body': 'Track performance against a concrete target.',
                    'goal_id': child.id,
                    'target_id': target.id,
                },
            ],
        },
    }
    payload = {
        'examples': [{
            'root_id': admin_landing_fractal.id,
            'label': 'Configured demo',
            'sort_order': 0,
            'landing_content': landing_content,
        }],
    }

    response = admin_client.patch(
        '/api/admin/landing-examples',
        data=json.dumps(payload),
        content_type='application/json',
    )
    assert response.status_code == 200
    assert response.get_json()['examples'][0]['landing_content'] == landing_content

    publish_response = admin_client.post(
        '/api/admin/landing-examples/publish',
        data=json.dumps(payload),
        content_type='application/json',
    )
    assert publish_response.status_code == 200
    public_example = client.get('/api/public/landing-examples').get_json()['examples'][0]
    assert public_example['landing_content'] == landing_content
    published_target = next(
        item for item in public_example['tree']['children'][0]['attributes']['targets']
        if item['id'] == target.id
    )
    assert published_target['activity_id'] == target.activity_id
    assert 'metrics' in published_target


@pytest.mark.integration
@pytest.mark.parametrize('showcase', [
    {'activity_ids': ['a1', 'a2']},
    {'analytics_view_ids': ['v1', 'v2', 'v3', 'v4']},
    {'activity_ids': ['a1', 'a1']},
    {'analytics_view_ids': ['v1', 'v1']},
    {'program_start_date': 'not-a-date'},
    {'program_start_date': '2026-02-01', 'program_end_date': '2026-01-01'},
])
def test_landing_example_showcase_validation_rejects_bad_payloads(
    admin_client, admin_landing_fractal, showcase,
):
    response = admin_client.patch(
        '/api/admin/landing-examples',
        data=_landing_example_payload(admin_landing_fractal.id, showcase),
        content_type='application/json',
    )
    assert response.status_code == 400


@pytest.mark.integration
def test_publish_honors_showcase_selections(admin_client, client, db_session, admin_landing_fractal):
    root = admin_landing_fractal
    featured_session = db_session.query(Session).filter_by(root_id=root.id).first()
    # Push the featured session out of the most-recent-4 window.
    for day in range(11, 15):
        db_session.add(Session(
            id=str(uuid.uuid4()),
            root_id=root.id,
            name=f'Newer Session {day}',
            session_start=datetime(2026, 1, day, 9, 0),
            total_duration_seconds=600,
        ))
    # An activity no recent session references: only featuring it should publish it.
    hidden_activity = ActivityDefinition(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Hidden Featured Activity',
        has_metrics=True,
        track_progress=True,
    )
    hidden_metric = MetricDefinition(
        id=str(uuid.uuid4()),
        root_id=root.id,
        activity_id=hidden_activity.id,
        name='Quality',
        unit='Rating',
        track_progress=True,
    )
    analytics_session = Session(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Analytics-only Session',
        session_start=datetime(2025, 12, 20, 9, 0),
        total_duration_seconds=900,
    )
    analytics_instance = ActivityInstance(
        id=str(uuid.uuid4()),
        session_id=analytics_session.id,
        activity_definition_id=hidden_activity.id,
        root_id=root.id,
        completed=True,
        duration_seconds=900,
        time_stop=datetime(2025, 12, 20, 9, 15),
        data={},
    )
    hidden_metric_value = MetricValue(
        id=str(uuid.uuid4()),
        activity_instance_id=analytics_instance.id,
        metric_definition_id=hidden_metric.id,
        value=7,
    )
    progress_record = ProgressRecord(
        id=str(uuid.uuid4()),
        root_id=root.id,
        activity_definition_id=hidden_activity.id,
        activity_instance_id=analytics_instance.id,
        session_id=analytics_session.id,
        is_first_instance=False,
        has_change=True,
        has_improvement=True,
        has_regression=False,
        comparison_type='flat_metrics',
        metric_comparisons=[{
            'metric_id': hidden_metric.id,
            'metric_name': hidden_metric.name,
            'previous_value': 6,
            'current_value': 7,
            'pct_change': 16.7,
            'improved': True,
            'regressed': False,
        }],
        derived_summary={},
        created_at=datetime(2025, 12, 20, 9, 16),
    )
    program = Program(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name='Public Demo Program',
        start_date=datetime(2026, 1, 1),
        end_date=datetime(2026, 3, 1),
        weekly_schedule={},
    )
    analytics_view = AnalyticsDashboard(
        id=str(uuid.uuid4()),
        root_id=root.id,
        user_id=root.owner_id,
        name='Featured Analytics View',
        kind='view',
        layout={
            'version': 3,
            'layout': {
                'type': 'grid',
                'panels': [{'id': 'window-1', 'x': 0, 'y': 0, 'w': 96, 'h': 48}],
            },
            'window_states': {'window-1': {
                'selectedCategory': 'activities',
                'selectedVisualization': 'metricProgress',
                'selectedActivity': {'id': hidden_activity.id, 'name': hidden_activity.name},
                'selectedModeIds': [],
                'selectedGoal': None,
                'visualizationState': {'metric': hidden_metric.id},
                'visualizationStateByKey': {
                    'activities:metricProgress': {'metric': hidden_metric.id},
                },
            }},
            'selected_window_id': 'window-1',
            'global_filters': {
                'goals': {'goalIds': [], 'includeDescendants': True, 'includeInheritedActivities': True},
                'activities': {'activityIds': [hidden_activity.id], 'groupIds': [], 'includeChildren': True},
            },
            'layout_bounds': {'columns': 96, 'rows': 48},
        },
    )
    db_session.add_all([
        hidden_activity,
        hidden_metric,
        analytics_session,
        analytics_instance,
        hidden_metric_value,
        progress_record,
        program,
        analytics_view,
    ])
    db_session.commit()

    showcase = {
        'session_id': featured_session.id,
        'activity_ids': [hidden_activity.id],
        'program_id': program.id,
        'program_start_date': '2026-01-05',
        'program_end_date': '2026-01-20',
        'analytics_view_ids': [analytics_view.id],
    }
    publish_response = admin_client.post(
        '/api/admin/landing-examples/publish',
        data=_landing_example_payload(root.id, showcase),
        content_type='application/json',
    )
    assert publish_response.status_code == 200
    assert publish_response.get_json()['showcase_warnings'] == []

    public_example = client.get('/api/public/landing-examples').get_json()['examples'][0]
    assert public_example['showcase'] == showcase
    # The featured session is included even though it is not among the recent 4.
    session_ids = [session['id'] for session in public_example['sessions']]
    assert featured_session.id in session_ids
    # The explicitly featured activity serializes despite no recent-session reference.
    activity_names = [activity['name'] for activity in public_example['activity_definitions']]
    assert 'Hidden Featured Activity' in activity_names
    assert any(program_item['id'] == program.id for program_item in public_example['programs'])
    assert [view['name'] for view in public_example['analytics_views']] == ['Featured Analytics View']
    analytics_instances = public_example['analytics_activity_instances'][hidden_activity.id]
    assert analytics_instances[0]['id'] == analytics_instance.id
    assert analytics_instances[0]['session_name'] == 'Analytics-only Session'
    assert analytics_instances[0]['progress_comparison']['metric_comparisons'][0]['pct_change'] == 16.7


@pytest.mark.integration
def test_publish_drops_stale_showcase_refs_with_warnings(admin_client, client, admin_landing_fractal):
    showcase = {
        'session_id': str(uuid.uuid4()),
        'activity_ids': [str(uuid.uuid4())],
        'program_id': str(uuid.uuid4()),
        'program_start_date': '2026-01-05',
        'program_end_date': '2026-01-20',
        'analytics_view_ids': [str(uuid.uuid4())],
    }
    publish_response = admin_client.post(
        '/api/admin/landing-examples/publish',
        data=_landing_example_payload(admin_landing_fractal.id, showcase),
        content_type='application/json',
    )
    assert publish_response.status_code == 200
    warnings = publish_response.get_json()['showcase_warnings']
    assert len(warnings) == 4

    public_example = client.get('/api/public/landing-examples').get_json()['examples'][0]
    assert public_example['showcase'] == {
        'session_id': None,
        'activity_ids': [],
        'program_id': None,
        'program_start_date': None,
        'program_end_date': None,
        'analytics_view_ids': [],
    }

    # Publishing reconciles unavailable references into the editable settings,
    # so the same hidden selections cannot warn forever.
    saved_example = admin_client.get('/api/admin/landing-examples').get_json()['examples'][0]
    assert saved_example['showcase'] == public_example['showcase']
    second_publish = admin_client.post(
        '/api/admin/landing-examples/publish',
        data=json.dumps({}),
        content_type='application/json',
    )
    assert second_publish.status_code == 200
    assert second_publish.get_json()['showcase_warnings'] == []


@pytest.mark.integration
def test_publish_keeps_valid_analytics_view_while_reconciling_stale_selection(
    admin_client,
    db_session,
    admin_landing_fractal,
):
    valid_view_id = db_session.query(AnalyticsDashboard.id).filter(
        AnalyticsDashboard.root_id == admin_landing_fractal.id,
        AnalyticsDashboard.kind == 'view',
        AnalyticsDashboard.deleted_at.is_(None),
    ).scalar()
    stale_view_id = str(uuid.uuid4())
    showcase = {'analytics_view_ids': [stale_view_id, valid_view_id]}

    response = admin_client.post(
        '/api/admin/landing-examples/publish',
        data=_landing_example_payload(admin_landing_fractal.id, showcase),
        content_type='application/json',
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['examples'][0]['showcase']['analytics_view_ids'] == [valid_view_id]
    assert payload['showcase_warnings'] == [
        'Software demo: 1 analytics view no longer exists and was removed',
    ]
    saved_example = admin_client.get('/api/admin/landing-examples').get_json()['examples'][0]
    assert saved_example['showcase']['analytics_view_ids'] == [valid_view_id]


@pytest.mark.integration
def test_publish_landing_examples_reports_edge_cache_warm_status(admin_client, admin_landing_fractal, monkeypatch, tmp_path):
    import requests as requests_lib

    def publish():
        response = admin_client.post(
            '/api/admin/landing-examples/publish',
            data=_landing_example_payload(admin_landing_fractal.id),
            content_type='application/json',
        )
        assert response.status_code == 200
        return response.get_json()

    # No warm URL configured (the dev/test default): warming is skipped.
    assert publish()['cache_warm'] == 'skipped'

    static_snapshot_path = tmp_path / 'landing-examples.json'
    monkeypatch.setattr(config, 'LANDING_EXAMPLES_STATIC_PATH', str(static_snapshot_path))
    static_publish = publish()
    assert static_publish['static_snapshot'] == 'ok'
    static_payload = json.loads(static_snapshot_path.read_text())
    assert static_payload['schema_version'] == 10
    assert static_payload['published_at'] == static_publish['published_at']
    assert static_payload['examples'][0]['root_id'] == admin_landing_fractal.id
    monkeypatch.setattr(config, 'LANDING_EXAMPLES_STATIC_PATH', '')

    warm_url = 'https://www.example.com/api/public/landing-examples'
    monkeypatch.setattr(config, 'LANDING_CACHE_WARM_URL', warm_url)

    warm_calls = []

    class _WarmResponse:
        def raise_for_status(self):
            return None

    def _fake_get(url, headers=None, timeout=None):
        warm_calls.append({'url': url, 'headers': headers, 'timeout': timeout})
        return _WarmResponse()

    monkeypatch.setattr(requests_lib, 'get', _fake_get)
    assert publish()['cache_warm'] == 'ok'
    assert warm_calls == [{
        'url': warm_url,
        'headers': {'X-Landing-Cache-Warm': '1'},
        'timeout': 1.5,
    }]

    def _failing_get(url, headers=None, timeout=None):
        raise requests_lib.ConnectionError('warm endpoint unreachable')

    monkeypatch.setattr(requests_lib, 'get', _failing_get)
    # A warm failure must never fail the publish itself.
    assert publish()['cache_warm'] == 'failed'


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
    assert options['root_id'] == root.id
    assert [session['name'] for session in options['sessions']] == ['Public Demo Session']
    assert options['sessions'][0]['total_duration_seconds'] == 2700
    activity = next(item for item in options['activities'] if item['name'] == 'Public Demo Activity')
    assert activity['associated_goal_count'] == 1
    assert activity['group_id'] == group.id
    assert [item['name'] for item in options['activity_groups']] == ['Options Group']
    assert [item['name'] for item in options['programs']] == ['Options Program']
    assert [item['name'] for item in options['analytics_views']] == ['Public Demo Analytics View']
    assert {item['name'] for item in options['goals']} == {'Public Demo Fractal', 'Public Demo Child'}
    target_goal = next(item for item in options['goals'] if item['targets'])
    assert target_goal['targets'][0]['name']

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

    unblocked_response = client.get('/api/auth/account/usage', headers=user_headers)
    assert unblocked_response.status_code == 200
