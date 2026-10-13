import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from models import ActivityDefinition, ActivityGroup, ActivityInstance, Session, User, session_goals
from tests.conftest import session_token_for


@pytest.mark.integration
class TestGoalAnalyticsService:
    def test_goal_analytics_returns_goal_session_breakdown(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
    ):
        root_id = sample_ultimate_goal.id

        session = Session(
            owner_id=sample_ultimate_goal.owner_id,
            id=str(uuid.uuid4()),
            name="Analytics Session",
            root_id=root_id,
            session_start=datetime.now(timezone.utc) - timedelta(minutes=40),
            session_end=datetime.now(timezone.utc),
            total_duration_seconds=2400,
        )
        db_session.add(session)
        db_session.commit()

        db_session.execute(
            session_goals.insert().values(
                session_id=session.id,
                goal_id=root_id,
                goal_type="UltimateGoal",
            )
        )

        group = ActivityGroup(id=str(uuid.uuid4()), root_id=root_id, name="Analytics Group")
        db_session.add(group)
        db_session.flush()

        activity = ActivityDefinition(
            id=str(uuid.uuid4()),
            root_id=root_id,
            name="Analytics Activity",
            group_id=group.id,
        )
        db_session.add(activity)
        db_session.flush()

        instance = ActivityInstance(
            id=str(uuid.uuid4()),
            session_id=session.id,
            activity_definition_id=activity.id,
            root_id=root_id,
            duration_seconds=900,
        )
        db_session.add(instance)
        db_session.commit()

        response = authed_client.get(f"/api/{root_id}/goals/analytics")

        assert response.status_code == 200
        payload = json.loads(response.data)
        assert "summary" in payload
        assert "goals" in payload
        assert payload["summary"]["total_goals"] >= 1
        assert any(goal["id"] == root_id and goal["session_count"] >= 1 for goal in payload["goals"])

    def test_goal_analytics_checks_ownership(
        self,
        authed_client,
        client,
        db_session,
        sample_ultimate_goal,
    ):
        from config import config

        root_id = sample_ultimate_goal.id

        owner_response = authed_client.get(f"/api/{root_id}/goals/analytics")
        assert owner_response.status_code == 200

        other_user = User(
            id=str(uuid.uuid4()),
            username="analytics_other_user",
            email="analytics-other@example.com",
            terms_accepted_version=config.TERMS_VERSION,
            privacy_accepted_version=config.PRIVACY_VERSION,
        )
        other_user.set_password("Password123")
        db_session.add(other_user)
        db_session.commit()

        token = session_token_for(other_user)

        response = client.get(
            f"/api/{root_id}/goals/analytics",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404


@pytest.mark.parametrize('count', [0, 1, 365, 366, 367, 1000])
def test_goal_chart_buckets_preserve_totals_and_bound_long_histories(
    count, authed_client, db_session, sample_ultimate_goal,
):
    root = sample_ultimate_goal
    start = datetime(2010, 1, 1, tzinfo=timezone.utc)
    rows = [dict(id=str(uuid.uuid4()), root_id=root.id, owner_id=root.owner_id, name='Practice',
                 session_start=start + timedelta(days=index * 3), session_end=start + timedelta(days=index * 3, seconds=30),
                 total_duration_seconds=30, completed=True, created_at=start + timedelta(days=index * 3)) for index in range(count)]
    if rows:
        db_session.execute(Session.__table__.insert(), rows)
        db_session.execute(session_goals.insert(), [dict(session_id=row['id'], goal_id=root.id, goal_type='UltimateGoal') for row in rows])
    db_session.commit()
    url = f'/api/{root.id}/goals/analytics'
    summary = authed_client.get(url).get_json()
    goal = next(goal for goal in summary['goals'] if goal['id'] == root.id)
    assert goal['session_count'] == count
    assert goal['total_duration_seconds'] == count * 30
    assert goal['session_durations_by_date'] == []
    response = authed_client.get(url, query_string={'chart_goal_id': root.id})
    assert response.status_code == 200
    payload = response.get_json()
    chart = next(goal for goal in payload['goals'] if goal['id'] == root.id)['session_durations_by_date']
    assert len(chart) <= payload['metadata']['max_chart_points']
    assert sum(row['duration_seconds'] for row in chart) == count * 30
    assert sum(row['session_count'] for row in chart) == count


@pytest.mark.parametrize('query', ['range_start=invalid', 'range_end=invalid', 'range_start=2026-01-02&range_end=2026-01-01', 'chart_goal_id=missing', 'charts=yes', 'activity_filter=yes'])
def test_goal_analytics_validates_scope_and_ranges(authed_client, sample_ultimate_goal, query):
    response = authed_client.get(f'/api/{sample_ultimate_goal.id}/goals/analytics?{query}')
    assert response.status_code == (404 if 'chart_goal_id' in query else 400)


def test_empty_activity_scope_does_not_fall_back_to_all_activities(authed_client, sample_practice_session, db_session):
    root_id = sample_practice_session.root_id
    db_session.execute(session_goals.insert().values(session_id=sample_practice_session.id, goal_id=root_id, goal_type='UltimateGoal'))
    db_session.commit()
    response = authed_client.get(f'/api/{root_id}/goals/analytics?activity_filter=true&charts=true')
    assert response.status_code == 200
    assert all(goal['total_duration_seconds'] == 0 and goal['session_count'] == 0 for goal in response.get_json()['goals'])
