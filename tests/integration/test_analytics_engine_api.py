from datetime import datetime, timezone
import uuid

import jwt

from config import config
from models import Session, User


def _auth_headers_for(user):
    token = jwt.encode({
        'user_id': user.id,
        'exp': datetime.now(timezone.utc).timestamp() + 3600,
    }, config.JWT_SECRET_KEY, algorithm="HS256")
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }


def _create_admin(db_session):
    admin = User(
        id=str(uuid.uuid4()),
        username="analyticsadmin",
        email="analytics-admin@example.com",
        role="admin",
    )
    admin.set_password("Password123")
    db_session.add(admin)
    db_session.commit()
    return admin


def test_analytics_catalog_and_query_run_are_authenticated(authed_client, db_session, sample_ultimate_goal):
    db_session.add(Session(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Analytics API Session",
        completed=True,
        session_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
        total_duration_seconds=75,
    ))
    db_session.commit()

    catalog_response = authed_client.get('/api/analytics/catalog')
    assert catalog_response.status_code == 200
    assert any(dataset["id"] == "sessions" for dataset in catalog_response.get_json()["datasets"])

    run_response = authed_client.post('/api/analytics/query/run', json={
        "query_spec": {
            "version": 1,
            "dataset": "sessions",
            "fields": ["name", "duration_seconds"],
            "limit": 10,
        }
    })
    assert run_response.status_code == 200
    payload = run_response.get_json()
    assert payload["rows"] == [{"name": "Analytics API Session", "duration_seconds": 75}]


def test_analytics_query_run_accepts_raw_read_only_sql(authed_client, db_session, sample_ultimate_goal):
    db_session.add(Session(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Raw SQL API Session",
        completed=True,
        session_start=datetime(2026, 1, 2, tzinfo=timezone.utc),
        total_duration_seconds=88,
    ))
    db_session.commit()

    run_response = authed_client.post('/api/analytics/query/run', json={
        "query_spec": {
            "version": 1,
            "mode": "sql",
            "sql": "SELECT * FROM sessions WHERE name LIKE '%Raw SQL%'",
            "limit": 10,
        }
    })

    assert run_response.status_code == 200
    payload = run_response.get_json()
    assert [row["name"] for row in payload["rows"]] == ["Raw SQL API Session"]
    assert payload["metadata"]["mode"] == "sql"


def test_analytics_query_profiles_crud_through_api(authed_client):
    spec = {"version": 1, "dataset": "sessions", "fields": ["name"], "limit": 10}

    create_response = authed_client.post('/api/analytics/query-profiles', json={
        "name": "API Profile",
        "query_spec": spec,
        "visualization_spec": {"type": "table"},
    })
    assert create_response.status_code == 201
    profile_id = create_response.get_json()["data"]["id"]

    list_response = authed_client.get('/api/analytics/query-profiles')
    assert list_response.status_code == 200
    assert [profile["name"] for profile in list_response.get_json()["data"]] == ["API Profile"]

    update_response = authed_client.patch(f'/api/analytics/query-profiles/{profile_id}', json={"name": "API Profile 2"})
    assert update_response.status_code == 200
    assert update_response.get_json()["data"]["name"] == "API Profile 2"

    delete_response = authed_client.delete(f'/api/analytics/query-profiles/{profile_id}')
    assert delete_response.status_code == 200


def test_admin_read_only_support_can_run_user_wide_analytics_but_not_write_profiles(client, db_session, test_user, sample_ultimate_goal):
    admin = _create_admin(db_session)
    db_session.add(Session(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Support Visible Session",
        completed=True,
        session_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
        total_duration_seconds=30,
    ))
    db_session.commit()

    headers = _auth_headers_for(admin)
    query_string = f'admin_user_id={test_user.id}&admin_mode=read_only'
    run_response = client.post(f'/api/analytics/query/run?{query_string}', json={
        "query_spec": {
            "version": 1,
            "dataset": "sessions",
            "fields": ["name"],
            "limit": 10,
        }
    }, headers=headers)
    assert run_response.status_code == 200
    assert run_response.get_json()["rows"] == [{"name": "Support Visible Session"}]

    create_response = client.post(f'/api/analytics/query-profiles?{query_string}', json={
        "name": "Should Not Save",
        "query_spec": {"version": 1, "dataset": "sessions", "fields": ["name"]},
    }, headers=headers)
    assert create_response.status_code == 403
