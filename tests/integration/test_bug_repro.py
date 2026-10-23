import pytest

from models import GoalCompletionCondition, get_engine, get_session


@pytest.mark.integration
def test_create_goal_with_condition_persists_relational(authed_client, sample_ultimate_goal, sample_activity_definition):
    """A condition sent with the global create endpoint is stored relationally and read back."""
    weight = next(metric for metric in sample_activity_definition.metric_definitions if metric.name == 'Weight')
    response = authed_client.post('/api/goals', json={
        'name': 'Goal with a condition',
        'type': 'ShortTermGoal',
        'parent_id': sample_ultimate_goal.id,
        'completion_condition': 'activity_threshold',
        'condition': {
            'activity_definition_id': sample_activity_definition.id, 'kind': 'single_session', 'measure': 'sets',
            'min_sets': 2, 'rules': [{'metric_definition_id': weight.id, 'operator': '>=', 'value': 135.5}],
        },
    })
    assert response.status_code == 201
    goal_id = response.get_json()['id']

    session = get_session(get_engine())
    try:
        (condition,) = session.query(GoalCompletionCondition).filter_by(goal_id=goal_id).all()
        assert (condition.kind, condition.min_sets) == ('single_session', 2)
        assert float(condition.rules[0].value) == 135.5
    finally:
        session.close()

    fetched = authed_client.get(f'/api/goals/{goal_id}').get_json()
    assert fetched['completion_condition'] == 'activity_threshold'
    assert fetched['condition']['rules'][0]['value'] == 135.5
