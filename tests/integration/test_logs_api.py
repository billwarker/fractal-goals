from config import config
from datetime import datetime, timezone

import pytest

from models import EventLog, User
from tests.conftest import session_headers_for


@pytest.fixture
def admin_user(db_session):
    user = User(
        username="logsadmin",
        email="logsadmin@example.com",
        role="admin",
        terms_accepted_version=config.TERMS_VERSION,
        privacy_accepted_version=config.PRIVACY_VERSION,
    )
    user.set_password("Password123")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def admin_client(client, admin_user):

    headers = session_headers_for(admin_user)

    class AdminClient:
        def delete(self, *args, **kwargs):
            return client.delete(*args, headers=headers, **kwargs)

    return AdminClient()


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

    def test_get_logs_applies_date_filters(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        db_session.add_all([
            EventLog(
                root_id=root_id,
                event_type="goal.created",
                description="Created earlier goal",
                timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
            ),
            EventLog(
                root_id=root_id,
                event_type="goal.updated",
                description="Updated later goal",
                timestamp=datetime(2026, 1, 10, tzinfo=timezone.utc),
            ),
        ])
        db_session.commit()

        response = authed_client.get(
            f"/api/{root_id}/logs",
            query_string={"start_date": "2026-01-05", "end_date": "2026-01-10"},
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert payload["pagination"]["total"] == 1
        assert payload["logs"][0]["event_type"] == "goal.updated"

    def test_get_logs_reads_dates_as_local_days_with_a_timezone(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        db_session.add_all([
            # Late on Jan 1 in Toronto, already Jan 2 in UTC.
            EventLog(root_id=root_id, event_type="goal.created", description="Late",
                     timestamp=datetime(2026, 1, 2, 4, 30, tzinfo=timezone.utc)),
            EventLog(root_id=root_id, event_type="goal.updated", description="Next day",
                     timestamp=datetime(2026, 1, 2, 15, 0, tzinfo=timezone.utc)),
        ])
        db_session.commit()

        response = authed_client.get(f"/api/{root_id}/logs", query_string={
            "start_date": "2026-01-01", "end_date": "2026-01-01", "tz": "America/Toronto",
        })

        assert response.status_code == 200
        payload = response.get_json()
        assert [log["description"] for log in payload["logs"]] == ["Late"]
        assert payload["logs"][0]["domain"] == "goals"

    def test_get_logs_can_skip_event_type_metadata(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        db_session.add(
            EventLog(
                root_id=root_id,
                event_type="goal.updated",
                description="Updated a goal",
                timestamp=datetime(2026, 1, 10, tzinfo=timezone.utc),
            )
        )
        db_session.commit()

        response = authed_client.get(
            f"/api/{root_id}/logs",
            query_string={"include_event_types": "false"},
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert "event_types" not in payload
        assert payload["pagination"]["total"] == 1

    def test_clear_logs_requires_admin(self, authed_client, db_session, sample_ultimate_goal):
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

        assert response.status_code == 403
        remaining = db_session.query(EventLog).filter_by(root_id=root_id).count()
        assert remaining == 1

    def test_admin_clear_logs_removes_root_logs(self, admin_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        db_session.add(
            EventLog(
                root_id=root_id,
                event_type="goal.deleted",
                description="Deleted a goal",
            )
        )
        db_session.commit()

        response = admin_client.delete(f"/api/{root_id}/logs/clear")

        assert response.status_code == 200
        assert response.get_json()["retention_policy"] == "hard_delete"
        remaining = db_session.query(EventLog).filter_by(root_id=root_id).count()
        assert remaining == 0


def _activity_log(root_id, event_type, timestamp):
    return EventLog(root_id=root_id, event_type=event_type, description=event_type, timestamp=timestamp)


@pytest.mark.integration
class TestLogActivityApi:
    def test_buckets_by_local_day_and_domain(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        db_session.add_all([
            # 23:30 in Toronto on Jan 1 is 04:30 UTC on Jan 2.
            _activity_log(root_id, "goal.created", datetime(2026, 1, 2, 4, 30, tzinfo=timezone.utc)),
            _activity_log(root_id, "activity_instance.completed", datetime(2026, 1, 2, 15, 0, tzinfo=timezone.utc)),
            _activity_log(root_id, "program_day.scheduled", datetime(2026, 1, 2, 16, 0, tzinfo=timezone.utc)),
            _activity_log(root_id, "admin.thing", datetime(2026, 1, 2, 17, 0, tzinfo=timezone.utc)),
            # Outside the range on both sides.
            _activity_log(root_id, "goal.updated", datetime(2026, 1, 1, 4, 59, tzinfo=timezone.utc)),
            _activity_log(root_id, "goal.updated", datetime(2026, 1, 3, 5, 0, tzinfo=timezone.utc)),
        ])
        db_session.commit()

        response = authed_client.get(f"/api/{root_id}/logs/activity", query_string={
            "start_date": "2026-01-01", "end_date": "2026-01-02", "tz": "America/Toronto",
        })

        assert response.status_code == 200
        payload = response.get_json()
        assert [bucket["start"] for bucket in payload["buckets"]] == ["2026-01-01T00:00:00", "2026-01-02T00:00:00"]
        first, second = payload["buckets"]
        assert first["counts"]["goals"] == 1 and first["total"] == 1
        assert second["counts"] == {
            "goals": 0, "sessions": 1, "activities": 0, "programs": 1, "notes": 0, "other": 1,
        }
        assert payload["total"] == 4
        assert [domain["key"] for domain in payload["domains"]][-1] == "other"

    def test_hour_buckets_follow_daylight_saving(self, authed_client, sample_ultimate_goal):
        # Clocks went forward in Toronto on 2026-03-08: that day has 23 local hours.
        response = authed_client.get(f"/api/{sample_ultimate_goal.id}/logs/activity", query_string={
            "start_date": "2026-03-08", "end_date": "2026-03-08", "tz": "America/Toronto", "bucket": "hour",
        })

        assert response.status_code == 200
        starts = [bucket["start"] for bucket in response.get_json()["buckets"]]
        assert len(starts) == 23
        assert "2026-03-08T02:00:00" not in starts

    def test_filters_by_event_type(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        db_session.add_all([
            _activity_log(root_id, "goal.created", datetime(2026, 1, 2, 12, tzinfo=timezone.utc)),
            _activity_log(root_id, "goal.updated", datetime(2026, 1, 2, 12, tzinfo=timezone.utc)),
        ])
        db_session.commit()

        response = authed_client.get(f"/api/{root_id}/logs/activity", query_string={
            "start_date": "2026-01-02", "end_date": "2026-01-02", "event_type": "goal.updated",
        })

        assert response.get_json()["total"] == 1

    @pytest.mark.parametrize("query", [
        {"tz": "Mars/Olympus"},
        {"bucket": "week"},
        {"start_date": "2026-13-01"},
        {"start_date": "2026-02-01", "end_date": "2026-01-01"},
        {"start_date": "2025-01-01", "end_date": "2026-01-10"},
        {"start_date": "2026-01-01", "end_date": "2026-01-20", "bucket": "hour"},
    ])
    def test_rejects_invalid_ranges(self, authed_client, sample_ultimate_goal, query):
        response = authed_client.get(f"/api/{sample_ultimate_goal.id}/logs/activity", query_string=query)

        assert response.status_code == 400

    def test_other_users_fractal_is_not_found(self, client, db_session, sample_ultimate_goal):
        stranger = User(
            username="logsstranger",
            email="logsstranger@example.com",
            terms_accepted_version=config.TERMS_VERSION,
            privacy_accepted_version=config.PRIVACY_VERSION,
        )
        stranger.set_password("Password123")
        db_session.add(stranger)
        db_session.add(_activity_log(sample_ultimate_goal.id, "goal.created", datetime(2026, 1, 2, tzinfo=timezone.utc)))
        db_session.commit()

        response = client.get(
            f"/api/{sample_ultimate_goal.id}/logs/activity",
            headers=session_headers_for(stranger),
        )

        assert response.status_code == 404
