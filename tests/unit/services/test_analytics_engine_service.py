from datetime import datetime, timedelta, timezone
import uuid

import models
from models import Goal, Session, User
from services.analytics_engine import AnalyticsEngineService
from services.analytics_query_cache import clear_cache


def _create_root(db_session, user, name):
    root = Goal(
        id=str(uuid.uuid4()),
        name=name,
        owner_id=user.id,
        created_at=datetime.now(timezone.utc),
    )
    root.root_id = root.id
    db_session.add(root)
    db_session.commit()
    return root


def _create_user(db_session, username):
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        email=f"{username}@example.com",
    )
    user.set_password("Password123")
    db_session.add(user)
    db_session.commit()
    return user


def test_catalog_exposes_semantic_datasets(db_session, test_user):
    service = AnalyticsEngineService(db_session)

    payload, error, status = service.get_catalog(test_user.id)

    assert error is None
    assert status == 200
    dataset_ids = {dataset["id"] for dataset in payload["datasets"]}
    assert {"sessions", "goals", "activity_instances", "metric_values", "targets", "notes"}.issubset(dataset_ids)
    sessions = next(dataset for dataset in payload["datasets"] if dataset["id"] == "sessions")
    assert any(field["id"] == "duration_seconds" and "sum" in field["aggregations"] for field in sessions["fields"])


def test_catalog_exposes_database_table_objects(db_session, test_user):
    service = AnalyticsEngineService(db_session)

    payload, error, status = service.get_catalog(test_user.id)

    assert error is None
    assert status == 200
    dataset_ids = {dataset["id"] for dataset in payload["datasets"]}
    assert {
        "analytics_dashboards",
        "analytics_query_profiles",
        "fractal_metric_definitions",
        "goal_pause_intervals",
        "program_blocks",
        "program_day_templates",
        "session_goals",
        "target_contribution_ledgers",
        "target_metric_conditions",
    }.issubset(dataset_ids)
    assert "analytics_views" not in dataset_ids


def test_run_query_aggregates_user_wide_sessions_and_excludes_other_tenants(db_session, test_user):
    clear_cache()
    other_user = _create_user(db_session, "otheruser")
    first_root = _create_root(db_session, test_user, "First Root")
    second_root = _create_root(db_session, test_user, "Second Root")
    other_root = _create_root(db_session, other_user, "Other Root")
    db_session.add_all([
        Session(
            id=str(uuid.uuid4()),
            root_id=first_root.id,
            name="First Session",
            completed=True,
            session_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
            total_duration_seconds=120,
        ),
        Session(
            id=str(uuid.uuid4()),
            root_id=second_root.id,
            name="Second Session",
            completed=True,
            session_start=datetime(2026, 1, 2, tzinfo=timezone.utc),
            total_duration_seconds=180,
        ),
        Session(
            id=str(uuid.uuid4()),
            root_id=other_root.id,
            name="Other Session",
            completed=True,
            session_start=datetime(2026, 1, 3, tzinfo=timezone.utc),
            total_duration_seconds=999,
        ),
    ])
    db_session.commit()
    service = AnalyticsEngineService(db_session)

    payload, error, status = service.run_query(test_user.id, {
        "version": 1,
        "dataset": "sessions",
        "dimensions": [],
        "measures": [{"field": "duration_seconds", "aggregation": "sum", "alias": "total_duration"}],
        "limit": 50,
    })

    assert error is None
    assert status == 200
    assert payload["rows"] == [{"total_duration": 300}]
    assert payload["metadata"]["row_count"] == 1


def test_run_query_supports_count_distinct_measures(db_session, test_user):
    clear_cache()
    root = _create_root(db_session, test_user, "Distinct Count Root")
    db_session.add_all([
        models.ActivityDefinition(id=str(uuid.uuid4()), root_id=root.id, name="Practice"),
        models.ActivityDefinition(id=str(uuid.uuid4()), root_id=root.id, name="Practice"),
        models.ActivityDefinition(id=str(uuid.uuid4()), root_id=root.id, name="Review"),
    ])
    db_session.commit()
    service = AnalyticsEngineService(db_session)

    payload, error, status = service.run_query(test_user.id, {
        "version": 1,
        "dataset": "activity_definitions",
        "measures": [{"field": "name", "aggregation": "count", "distinct": True, "alias": "distinct_names"}],
        "limit": 10,
    })

    assert error is None
    assert status == 200
    assert payload["rows"] == [{"distinct_names": 2}]


def test_run_raw_sql_supports_select_star_and_excludes_other_tenants(db_session, test_user):
    clear_cache()
    other_user = _create_user(db_session, "rawsqlother")
    owned_root = _create_root(db_session, test_user, "Raw SQL Root")
    other_root = _create_root(db_session, other_user, "Other Raw SQL Root")
    db_session.add_all([
        Session(
            id=str(uuid.uuid4()),
            root_id=owned_root.id,
            name="Visible Raw Session",
            session_start=datetime(2026, 3, 1, tzinfo=timezone.utc),
            total_duration_seconds=42,
        ),
        Session(
            id=str(uuid.uuid4()),
            root_id=other_root.id,
            name="Hidden Raw Session",
            session_start=datetime(2026, 3, 2, tzinfo=timezone.utc),
            total_duration_seconds=9001,
        ),
    ])
    db_session.commit()
    service = AnalyticsEngineService(db_session)

    payload, error, status = service.run_query(test_user.id, {
        "version": 1,
        "mode": "sql",
        "sql": "SELECT * FROM sessions ORDER BY name",
        "limit": 10,
    })

    assert error is None
    assert status == 200
    assert [row["name"] for row in payload["rows"]] == ["Visible Raw Session"]
    assert "duration_seconds" in payload["rows"][0]
    assert payload["metadata"]["mode"] == "sql"


def test_run_raw_sql_supports_postgres_style_aggregates(db_session, test_user):
    clear_cache()
    root = _create_root(db_session, test_user, "Raw Aggregate Root")
    db_session.add_all([
        models.ActivityDefinition(id=str(uuid.uuid4()), root_id=root.id, name="Practice"),
        models.ActivityDefinition(id=str(uuid.uuid4()), root_id=root.id, name="Practice"),
        models.ActivityDefinition(id=str(uuid.uuid4()), root_id=root.id, name="Review"),
    ])
    db_session.commit()
    service = AnalyticsEngineService(db_session)

    payload, error, status = service.run_query(test_user.id, {
        "version": 1,
        "mode": "sql",
        "sql": "SELECT COUNT(DISTINCT name) AS unique_names FROM activity_definitions",
    })

    assert error is None
    assert status == 200
    assert payload["rows"] == [{"unique_names": 2}]


def test_run_raw_sql_rejects_mutation_and_schema_bypass(db_session, test_user):
    service = AnalyticsEngineService(db_session)

    payload, error, status = service.run_query(test_user.id, {
        "version": 1,
        "mode": "sql",
        "sql": "DELETE FROM sessions",
    })
    assert payload is None
    assert status == 400
    assert "SELECT or WITH" in error

    payload, error, status = service.run_query(test_user.id, {
        "version": 1,
        "mode": "sql",
        "sql": "SELECT * FROM public.sessions",
    })
    assert payload is None
    assert status == 400
    assert "schema" in error


def test_run_query_exposes_junction_tables_with_join_through_tenant_scope(db_session, test_user):
    clear_cache()
    other_user = _create_user(db_session, "junctionother")
    owned_root = _create_root(db_session, test_user, "Owned Junction Root")
    other_root = _create_root(db_session, other_user, "Other Junction Root")
    owned_session = Session(
        id=str(uuid.uuid4()),
        root_id=owned_root.id,
        name="Owned Junction Session",
        session_start=datetime(2026, 2, 1, tzinfo=timezone.utc),
    )
    other_session = Session(
        id=str(uuid.uuid4()),
        root_id=other_root.id,
        name="Other Junction Session",
        session_start=datetime(2026, 2, 2, tzinfo=timezone.utc),
    )
    db_session.add_all([owned_session, other_session])
    db_session.flush()
    db_session.execute(models.session_goals.insert().values(
        session_id=owned_session.id,
        goal_id=owned_root.id,
        goal_type="root",
        association_source="manual",
    ))
    db_session.execute(models.session_goals.insert().values(
        session_id=other_session.id,
        goal_id=other_root.id,
        goal_type="root",
        association_source="manual",
    ))
    db_session.commit()
    service = AnalyticsEngineService(db_session)

    payload, error, status = service.run_query(test_user.id, {
        "version": 1,
        "dataset": "session_goals",
        "fields": ["session_id", "goal_id", "goal_type", "association_source"],
        "limit": 10,
    })

    assert error is None
    assert status == 200
    assert payload["rows"] == [{
        "session_id": owned_session.id,
        "goal_id": owned_root.id,
        "goal_type": "root",
        "association_source": "manual",
    }]


def test_run_query_rejects_unknown_fields(db_session, test_user, sample_ultimate_goal):
    service = AnalyticsEngineService(db_session)

    payload, error, status = service.run_query(test_user.id, {
        "version": 1,
        "dataset": "sessions",
        "fields": ["not_a_field"],
    })

    assert payload is None
    assert status == 400
    assert "fields" in error


def test_run_query_marks_second_identical_query_as_cache_hit(db_session, test_user, sample_ultimate_goal):
    clear_cache()
    db_session.add(Session(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Cached Session",
        completed=True,
        session_start=datetime.now(timezone.utc) - timedelta(days=1),
        total_duration_seconds=60,
    ))
    db_session.commit()
    service = AnalyticsEngineService(db_session)
    spec = {
        "version": 1,
        "dataset": "sessions",
        "fields": ["name"],
        "limit": 10,
    }

    first, error, status = service.run_query(test_user.id, spec)
    assert error is None
    assert status == 200
    assert first["metadata"]["cache_hit"] is False

    second, error, status = service.run_query(test_user.id, spec)
    assert error is None
    assert status == 200
    assert second["metadata"]["cache_hit"] is True
    assert second["rows"] == first["rows"]


def test_query_profile_crud_is_user_scoped(db_session, test_user):
    clear_cache()
    service = AnalyticsEngineService(db_session)
    spec = {
        "version": 1,
        "dataset": "sessions",
        "fields": ["name"],
        "limit": 10,
    }

    created, error, status = service.create_profile(test_user.id, {
        "name": "Session Names",
        "description": "Simple session list",
        "query_spec": spec,
        "visualization_spec": {"type": "table"},
    })

    assert error is None
    assert status == 201
    profile_id = created["data"]["id"]

    listed, error, status = service.list_profiles(test_user.id)
    assert error is None
    assert status == 200
    assert [profile["name"] for profile in listed["data"]] == ["Session Names"]

    updated, error, status = service.update_profile(profile_id, test_user.id, {"name": "Renamed"})
    assert error is None
    assert status == 200
    assert updated["data"]["name"] == "Renamed"

    other_user = _create_user(db_session, "profileother")
    missing, error, status = service.update_profile(profile_id, other_user.id, {"name": "Stolen"})
    assert missing is None
    assert status == 404

    deleted, error, status = service.delete_profile(profile_id, test_user.id)
    assert error is None
    assert status == 200
    assert deleted["message"] == "Analytics query profile deleted"

    persisted = db_session.query(models.AnalyticsQueryProfile).filter_by(id=profile_id).first()
    assert persisted.deleted_at is not None
