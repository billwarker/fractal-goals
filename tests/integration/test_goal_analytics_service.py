import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from models import ActivityDefinition, ActivityGroup, ActivityInstance, Session, session_goals
from services.analytics_cache import invalidate_root


@pytest.mark.integration
class TestGoalAnalyticsService:
    def test_goal_analytics_returns_goal_session_breakdown(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
    ):
        root_id = sample_ultimate_goal.id
        invalidate_root(root_id)

        session = Session(
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
