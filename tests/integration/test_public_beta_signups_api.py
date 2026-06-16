from models import BetaSignupRequest


def test_public_landing_examples_empty_when_unpublished(client):
    response = client.get('/api/public/landing-examples')

    assert response.status_code == 200
    assert response.headers['Cache-Control'] == 'public, max-age=300, stale-while-revalidate=86400'
    assert response.get_json() == {'published_at': None, 'schema_version': None, 'examples': []}


def test_create_beta_signup_request(client, db_session):
    response = client.post('/api/public/beta-signups', json={
        'email': 'Will@Test.Example',
    })

    assert response.status_code == 201
    payload = response.get_json()
    assert payload['created'] is True
    assert payload['request']['email'] == 'will@test.example'

    # Email-only signups no longer backfill placeholder name/use_case so exports
    # reflect only real data.
    stored = db_session.query(BetaSignupRequest).filter_by(email='will@test.example').one()
    assert stored.name is None
    assert stored.use_case is None


def test_create_beta_signup_persists_goal_as_use_case(client, db_session):
    response = client.post('/api/public/beta-signups', json={
        'email': 'goal@test.example',
        'use_case': 'Get strong enough for a one-arm pull-up',
    })

    assert response.status_code == 201
    stored = db_session.query(BetaSignupRequest).filter_by(email='goal@test.example').one()
    assert stored.use_case == 'Get strong enough for a one-arm pull-up'


def test_duplicate_beta_signup_updates_existing_request(client, db_session):
    first = client.post('/api/public/beta-signups', json={
        'name': 'Will Tester',
        'email': 'will@test.example',
        'use_case': 'personal goals',
    })
    assert first.status_code == 201

    second = client.post('/api/public/beta-signups', json={
        'name': 'Will Updated',
        'email': 'will@test.example',
        'use_case': 'startup or work',
        'note': 'New focus.',
    })

    assert second.status_code == 200
    payload = second.get_json()
    assert payload['created'] is False
    assert payload['request']['name'] == 'Will Updated'

    requests = db_session.query(BetaSignupRequest).filter_by(email='will@test.example').all()
    assert len(requests) == 1
    assert requests[0].use_case == 'startup or work'

    third = client.post('/api/public/beta-signups', json={
        'email': 'will@test.example',
    })

    assert third.status_code == 200
    db_session.refresh(requests[0])
    assert requests[0].name == 'Will Updated'
    assert requests[0].use_case == 'startup or work'


def test_beta_signup_validates_required_fields(client):
    response = client.post('/api/public/beta-signups', json={
        'email': 'not-an-email',
    })

    assert response.status_code == 400
    assert response.get_json()['error'] == 'Validation failed'
