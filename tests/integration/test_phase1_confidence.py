import json
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from config import config
from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    Goal,
    MetricDefinition,
    MetricValue,
    Session,
    Target,
    TargetMetricCondition,
    session_goals,
)


def _make_token(user_id, *, expires_delta=timedelta(hours=1)):
    return jwt.encode(
        {
            "user_id": user_id,
            "exp": datetime.now(timezone.utc) + expires_delta,
        },
        config.JWT_SECRET_KEY,
        algorithm="HS256",
    )


@pytest.mark.integration
class TestPhase1AuthConfidence:
    def test_protected_endpoint_rejects_invalid_token(self, client):
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer not-a-real-jwt"},
        )
        assert response.status_code == 401
        assert "error" in response.get_json()

    def test_protected_endpoint_rejects_token_for_missing_user(self, client):
        token = _make_token(str(uuid.uuid4()))
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401
        assert "User not found" in response.get_json().get("error", "")

    def test_refresh_rejects_missing_token(self, client):
        response = client.post("/api/auth/refresh")
        assert response.status_code == 401
        assert "missing" in response.get_json().get("error", "").lower()

    def test_refresh_rejects_disabled_user(self, client, db_session, test_user):
        test_user.is_active = False
        db_session.commit()
        token = _make_token(test_user.id, expires_delta=timedelta(hours=-1))
        response = client.post(
            "/api/auth/refresh",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401
        assert "disabled" in response.get_json().get("error", "").lower()


@pytest.mark.integration
class TestPhase1SessionConfidence:
    def test_get_sessions_requires_auth(self, client, sample_ultimate_goal):
        response = client.get(f"/api/{sample_ultimate_goal.id}/sessions")
        assert response.status_code == 401

    def test_add_activity_to_missing_session_returns_404(
        self, authed_client, sample_ultimate_goal, sample_activity_definition
    ):
        response = authed_client.post(
            f"/api/{sample_ultimate_goal.id}/sessions/{uuid.uuid4()}/activities",
            data=json.dumps({"activity_definition_id": sample_activity_definition.id}),
            content_type="application/json",
        )
        assert response.status_code == 404

    def test_reorder_activities_missing_session_returns_404(self, authed_client, sample_ultimate_goal):
        response = authed_client.post(
            f"/api/{sample_ultimate_goal.id}/sessions/{uuid.uuid4()}/activities/reorder",
            data=json.dumps({"activity_ids": [str(uuid.uuid4())]}),
            content_type="application/json",
        )
        assert response.status_code == 404

    def test_remove_missing_activity_instance_returns_404(self, authed_client, sample_practice_session):
        response = authed_client.delete(
            f"/api/{sample_practice_session.root_id}/sessions/{sample_practice_session.id}/activities/{uuid.uuid4()}"
        )
        assert response.status_code == 404

    def test_update_metrics_missing_instance_returns_404(self, authed_client, sample_practice_session):
        response = authed_client.put(
            f"/api/{sample_practice_session.root_id}/sessions/{sample_practice_session.id}/activities/{uuid.uuid4()}/metrics",
            data=json.dumps({"metrics": []}),
            content_type="application/json",
        )
        assert response.status_code == 404


@pytest.mark.integration
class TestPhase1TimerConfidence:
    def test_create_activity_instance_requires_auth(self, client, sample_ultimate_goal):
        response = client.post(
            f"/api/{sample_ultimate_goal.id}/activity-instances",
            data=json.dumps({"session_id": str(uuid.uuid4()), "activity_definition_id": str(uuid.uuid4())}),
            content_type="application/json",
        )
        assert response.status_code == 401

    def test_create_instance_missing_session_returns_404(
        self, authed_client, sample_ultimate_goal, sample_activity_definition
    ):
        response = authed_client.post(
            f"/api/{sample_ultimate_goal.id}/activity-instances",
            data=json.dumps(
                {
                    "session_id": str(uuid.uuid4()),
                    "activity_definition_id": sample_activity_definition.id,
                }
            ),
            content_type="application/json",
        )
        assert response.status_code == 404

    def test_update_instance_invalid_datetime_returns_400(self, authed_client, db_session, sample_activity_instance):
        session = db_session.query(Session).get(sample_activity_instance.session_id)
        response = authed_client.put(
            f"/api/{session.root_id}/activity-instances/{sample_activity_instance.id}",
            data=json.dumps({"time_start": "not-a-datetime"}),
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_update_missing_instance_without_creation_details_returns_404(self, authed_client, sample_ultimate_goal):
        response = authed_client.put(
            f"/api/{sample_ultimate_goal.id}/activity-instances/{uuid.uuid4()}",
            data=json.dumps({"notes": "no creation details"}),
            content_type="application/json",
        )
        assert response.status_code == 404

    def test_pause_and_resume_session_flow(
        self, authed_client, sample_practice_session, sample_activity_definition
    ):
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id

        create_resp = authed_client.post(
            f"/api/{root_id}/activity-instances",
            data=json.dumps(
                {
                    "session_id": session_id,
                    "activity_definition_id": sample_activity_definition.id,
                }
            ),
            content_type="application/json",
        )
        assert create_resp.status_code == 201
        instance_id = create_resp.get_json()["id"]

        start_resp = authed_client.post(f"/api/{root_id}/activity-instances/{instance_id}/start")
        assert start_resp.status_code == 200

        pause_resp = authed_client.post(f"/api/{root_id}/timers/session/{session_id}/pause")
        assert pause_resp.status_code == 200
        assert pause_resp.get_json()["is_paused"] is True

        resume_resp = authed_client.post(f"/api/{root_id}/timers/session/{session_id}/resume")
        assert resume_resp.status_code == 200
        assert resume_resp.get_json()["is_paused"] is False

    def test_pause_session_when_already_paused_returns_400(self, authed_client, sample_practice_session):
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id

        first = authed_client.post(f"/api/{root_id}/timers/session/{session_id}/pause")
        assert first.status_code == 200

        second = authed_client.post(f"/api/{root_id}/timers/session/{session_id}/pause")
        assert second.status_code == 400

    def test_resume_session_when_not_paused_returns_400(self, authed_client, sample_practice_session):
        response = authed_client.post(
            f"/api/{sample_practice_session.root_id}/timers/session/{sample_practice_session.id}/resume"
        )
        assert response.status_code == 400

    def test_pause_missing_session_returns_404(self, authed_client, sample_ultimate_goal):
        response = authed_client.post(
            f"/api/{sample_ultimate_goal.id}/timers/session/{uuid.uuid4()}/pause"
        )
        assert response.status_code == 404

    def test_resume_missing_session_returns_404(self, authed_client, sample_ultimate_goal):
        response = authed_client.post(
            f"/api/{sample_ultimate_goal.id}/timers/session/{uuid.uuid4()}/resume"
        )
        assert response.status_code == 404


@pytest.mark.integration
class TestPhase1GoalConfidence:
    def test_goal_analytics_requires_auth(self, client, sample_ultimate_goal):
        response = client.get(f"/api/{sample_ultimate_goal.id}/goals/analytics")
        assert response.status_code == 401

    def test_goal_analytics_returns_goal_session_breakdown(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id

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
        payload = response.get_json()
        assert "summary" in payload
        assert "goals" in payload
        assert payload["summary"]["total_goals"] >= 1
        assert any(g["id"] == root_id and g["session_count"] >= 1 for g in payload["goals"])

    def test_session_micro_goals_requires_auth(self, client, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy["ultimate"].id
        response = client.get(f"/api/fractal/{root_id}/sessions/{uuid.uuid4()}/micro-goals")
        assert response.status_code == 401

    def test_evaluate_targets_requires_auth(self, client, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy["ultimate"].id
        goal_id = sample_goal_hierarchy["short_term"].id
        response = client.post(
            f"/api/{root_id}/goals/{goal_id}/evaluate-targets",
            data=json.dumps({"session_id": str(uuid.uuid4())}),
            content_type="application/json",
        )
        assert response.status_code == 401

    def test_evaluate_targets_requires_session_id(self, authed_client, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy["ultimate"].id
        goal_id = sample_goal_hierarchy["short_term"].id
        response = authed_client.post(
            f"/api/{root_id}/goals/{goal_id}/evaluate-targets",
            data=json.dumps({}),
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_evaluate_targets_no_targets_returns_empty_result(
        self, authed_client, sample_goal_hierarchy, sample_practice_session
    ):
        root_id = sample_goal_hierarchy["ultimate"].id
        goal_id = sample_goal_hierarchy["short_term"].id
        response = authed_client.post(
            f"/api/{root_id}/goals/{goal_id}/evaluate-targets",
            data=json.dumps({"session_id": sample_practice_session.id}),
            content_type="application/json",
        )
        assert response.status_code == 200
        payload = response.get_json()
        assert payload["targets_evaluated"] == 0
        assert payload["targets_completed"] == 0
        assert payload["goal_completed"] is False

    def test_evaluate_targets_session_not_found_returns_404(self, authed_client, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy["ultimate"].id
        goal_id = sample_goal_hierarchy["short_term"].id
        response = authed_client.post(
            f"/api/{root_id}/goals/{goal_id}/evaluate-targets",
            data=json.dumps({"session_id": str(uuid.uuid4())}),
            content_type="application/json",
        )
        assert response.status_code == 404

    def test_evaluate_targets_goal_not_in_fractal_returns_404(self, authed_client, db_session, test_user, sample_ultimate_goal):
        other_root = Goal(id=str(uuid.uuid4()), name="Other Root", owner_id=test_user.id)
        other_root.root_id = other_root.id
        db_session.add(other_root)
        db_session.commit()

        response = authed_client.post(
            f"/api/{sample_ultimate_goal.id}/goals/{other_root.id}/evaluate-targets",
            data=json.dumps({"session_id": str(uuid.uuid4())}),
            content_type="application/json",
        )
        assert response.status_code == 404

    def test_evaluate_targets_marks_target_complete_and_auto_completes_goal(
        self, authed_client, db_session, test_user, sample_ultimate_goal
    ):
        root_id = sample_ultimate_goal.id

        goal = Goal(
            id=str(uuid.uuid4()),
            name="Measured Goal",
            owner_id=test_user.id,
            parent_id=sample_ultimate_goal.id,
            root_id=root_id,
            completed=False,
        )
        db_session.add(goal)

        session = Session(
            id=str(uuid.uuid4()),
            name="Eval Session",
            root_id=root_id,
        )
        db_session.add(session)

        group = ActivityGroup(id=str(uuid.uuid4()), root_id=root_id, name="Eval Group")
        db_session.add(group)
        db_session.flush()

        activity = ActivityDefinition(
            id=str(uuid.uuid4()),
            root_id=root_id,
            name="Eval Activity",
            group_id=group.id,
        )
        db_session.add(activity)
        db_session.flush()

        metric_def = MetricDefinition(
            id=str(uuid.uuid4()),
            activity_id=activity.id,
            root_id=root_id,
            name="Weight",
            unit="lbs",
        )
        db_session.add(metric_def)
        db_session.flush()

        target = Target(
            id=str(uuid.uuid4()),
            goal_id=goal.id,
            root_id=root_id,
            activity_id=activity.id,
            name="Hit threshold",
            type="threshold",
            completed=False,
        )
        db_session.add(target)
        db_session.flush()

        condition = TargetMetricCondition(
            id=str(uuid.uuid4()),
            target_id=target.id,
            metric_definition_id=metric_def.id,
            operator=">=",
            target_value=100,
        )
        db_session.add(condition)
        db_session.flush()

        instance = ActivityInstance(
            id=str(uuid.uuid4()),
            session_id=session.id,
            activity_definition_id=activity.id,
            root_id=root_id,
            completed=True,
        )
        db_session.add(instance)
        db_session.flush()

        metric_value = MetricValue(
            activity_instance_id=instance.id,
            metric_definition_id=metric_def.id,
            value=110.0,
        )
        db_session.add(metric_value)
        db_session.commit()

        response = authed_client.post(
            f"/api/{root_id}/goals/{goal.id}/evaluate-targets",
            data=json.dumps({"session_id": session.id}),
            content_type="application/json",
        )
        assert response.status_code == 200
        payload = response.get_json()
        assert payload["targets_evaluated"] == 1
        assert payload["targets_completed"] == 1
        assert payload["goal_completed"] is True
        assert len(payload["newly_completed_targets"]) == 1
