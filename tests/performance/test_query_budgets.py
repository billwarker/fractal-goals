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
