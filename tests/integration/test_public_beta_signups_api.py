from models import BetaSignupRequest


def test_create_beta_signup_request(client, db_session):
    response = client.post('/api/public/beta-signups', json={
        'name': 'Will Tester',
        'email': 'Will@Test.Example',
        'use_case': 'creative practice',
        'note': 'I want to track music sessions.',
    })

    assert response.status_code == 201
    payload = response.get_json()
    assert payload['created'] is True
    assert payload['request']['email'] == 'will@test.example'

    stored = db_session.query(BetaSignupRequest).filter_by(email='will@test.example').one()
    assert stored.name == 'Will Tester'
    assert stored.use_case == 'creative practice'


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


def test_beta_signup_validates_required_fields(client):
    response = client.post('/api/public/beta-signups', json={
        'name': 'W',
        'email': 'not-an-email',
        'use_case': '',
    })

    assert response.status_code == 400
    assert response.get_json()['error'] == 'Validation failed'
