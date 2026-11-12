import json

import pytest

from models import Goal, SessionTemplate


def _post(authed_client, payload, key=None):
    # authed_client adds its auth headers itself; an Idempotency-Key has to join them.
    headers = {**authed_client.headers, **({'Idempotency-Key': key} if key else {})}
    return authed_client.client.post(
        '/api/fractals/quickstart',
        data=json.dumps(payload),
        content_type='application/json',
        headers=headers,
    )


@pytest.mark.integration
class TestFractalQuickstartApi:
    def test_creates_the_fractal_and_its_first_goals_together(self, authed_client, db_session, test_user):
        response = _post(authed_client, {
            'name': 'Play jazz guitar at a jam session',
            'long_term_goals': ['Learn 20 standards', ' ', 'Comp confidently'],
        })

        assert response.status_code == 201
        root_id = response.get_json()['id']
        children = db_session.query(Goal).filter_by(parent_id=root_id).order_by(Goal.name).all()
        assert [child.name for child in children] == ['Comp confidently', 'Learn 20 standards']
        assert all(child.root_id == root_id and child.owner_id == test_user.id for child in children)
        assert {child.level.name for child in children} == {'Long Term Goal'}
        # The same starter setup as a fractal made the usual way.
        assert db_session.query(SessionTemplate).filter_by(root_id=root_id).count() == 1

    def test_needs_no_long_term_goals(self, authed_client, db_session):
        response = _post(authed_client, {'name': 'Run a marathon'})

        assert response.status_code == 201
        assert db_session.query(Goal).filter_by(parent_id=response.get_json()['id']).count() == 0

    def test_a_retried_request_creates_one_fractal(self, authed_client, db_session, test_user):
        payload = {'name': 'Speak conversational Spanish', 'long_term_goals': ['Hold a 10 minute chat']}
        first = _post(authed_client, payload, key='welcome-flow-1')
        second = _post(authed_client, payload, key='welcome-flow-1')

        assert first.status_code == second.status_code == 201
        assert second.headers.get('Idempotent-Replayed') == 'true'
        assert first.get_json()['id'] == second.get_json()['id']
        roots = db_session.query(Goal).filter_by(owner_id=test_user.id, parent_id=None, deleted_at=None).all()
        assert [root.name for root in roots] == ['Speak conversational Spanish']

    @pytest.mark.parametrize('payload', [
        {'name': ''},
        {'name': 'Big goal', 'long_term_goals': ['a', 'b', 'c', 'd']},
        {'name': 'Big goal', 'unexpected': True},
    ])
    def test_rejects_invalid_requests(self, authed_client, payload):
        assert _post(authed_client, payload).status_code in (400, 422)

    def test_goal_quota_failure_creates_nothing(self, authed_client, db_session, test_user):
        test_user.quota_overrides = {'goals': 2}
        db_session.commit()

        response = _post(authed_client, {'name': 'Too many', 'long_term_goals': ['One', 'Two']})

        assert response.status_code in (402, 403, 409, 429)
        assert db_session.query(Goal).filter_by(owner_id=test_user.id).count() == 0
