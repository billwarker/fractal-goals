from datetime import datetime, timezone

import pytest

from models import EventLog


@pytest.mark.integration
class TestLogsApi:
    def test_get_logs_returns_filtered_results(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        earlier = EventLog(
            root_id=root_id,
            event_type="goal.created",
            description="Created a goal",
            timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        later = EventLog(
            root_id=root_id,
            event_type="session.updated",
            description="Updated a session",
            timestamp=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )
        db_session.add_all([earlier, later])
        db_session.commit()

        response = authed_client.get(
            f"/api/{root_id}/logs",
            query_string={"event_type": "session.updated"},
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert payload["pagination"]["total"] == 1
        assert payload["logs"][0]["event_type"] == "session.updated"

    def test_clear_logs_removes_root_logs(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        db_session.add(
            EventLog(
                root_id=root_id,
                event_type="goal.deleted",
                description="Deleted a goal",
            )
        )
        db_session.commit()

        response = authed_client.delete(f"/api/{root_id}/logs/clear")

        assert response.status_code == 200
        remaining = db_session.query(EventLog).filter_by(root_id=root_id).count()
        assert remaining == 0
