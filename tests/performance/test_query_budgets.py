import pytest


@pytest.mark.integration
def test_get_session_activities_query_budget(authed_client, query_counter, sample_practice_session, sample_activity_instance):
    """
    Guard against accidental N+1 regressions in session activities endpoint.
    Budget is intentionally loose to avoid flakes while still catching blowups.
    """
    root_id = sample_practice_session.root_id
    session_id = sample_practice_session.id

    query_counter["total"] = 0
    response = authed_client.get(f"/api/{root_id}/sessions/{session_id}/activities")

    assert response.status_code == 200
    assert query_counter["total"] <= 15


@pytest.mark.integration
def test_get_session_details_query_budget(authed_client, query_counter, sample_practice_session, sample_activity_instance):
    """Session detail should stay within a bounded eager-loading query budget."""
    root_id = sample_practice_session.root_id
    session_id = sample_practice_session.id

    query_counter["total"] = 0
    response = authed_client.get(f"/api/{root_id}/sessions/{session_id}")

    assert response.status_code == 200
    assert query_counter["total"] <= 20


@pytest.mark.integration
def test_get_goal_tree_query_budget(authed_client, query_counter, sample_goal_hierarchy):
    """Goal tree fetches should remain bounded as hierarchy depth grows."""
    root_id = sample_goal_hierarchy["ultimate"].id

    query_counter["total"] = 0
    response = authed_client.get(f"/api/{root_id}/goals")

    assert response.status_code == 200
    assert query_counter["total"] <= 24


@pytest.mark.integration
def test_get_session_goals_view_query_budget(
    authed_client,
    query_counter,
    sample_practice_session,
    sample_activity_instance,
):
    """Session goals view should stay under a bounded query budget."""
    root_id = sample_practice_session.root_id
    session_id = sample_practice_session.id

    query_counter["total"] = 0
    response = authed_client.get(f"/api/fractal/{root_id}/sessions/{session_id}/goals-view")

    assert response.status_code == 200
    assert query_counter["total"] <= 36
