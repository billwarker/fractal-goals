"""Adversarial regressions for the analytics raw-SQL security boundary.

The October 28, 2026 audit read another account's password hash through
``POST /api/analytics/query/run``. Each probe below reproduces a way out of the
catalog scope and must be refused; the corpus test keeps legitimate console SQL
working through the same boundary.
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from config import config
import models
from models import Goal, Session, User
from services import _analytics_execution
from services._analytics_datasets import CATALOG_RELATIONS, catalog_source_tables
from services.analytics_engine import AnalyticsEngineService
from services.analytics_query_cache import clear_cache
from services.feature_flag_service import FeatureFlagService
from tests.conftest import session_headers_for


CORPUS_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "analytics_sql_corpus.json"


@pytest.fixture(autouse=True)
def sql_explorer_enabled(db_session):
    FeatureFlagService(db_session).update_flags({"analytics_sql_explorer": True})


def _user(db_session, username):
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        email=f"{username}@example.com",
        terms_accepted_version="1.0",
        terms_accepted_at=datetime.now(timezone.utc),
        privacy_accepted_version=config.PRIVACY_VERSION,
        privacy_accepted_at=datetime.now(timezone.utc),
    )
    user.set_password("Password123")
    db_session.add(user)
    db_session.commit()
    return user


def _root(db_session, user, name):
    root = Goal(id=str(uuid.uuid4()), name=name, owner_id=user.id, created_at=datetime.now(timezone.utc))
    root.root_id = root.id
    db_session.add(root)
    db_session.commit()
    return root


def _run_sql(db_session, user_id, sql):
    clear_cache()
    return AnalyticsEngineService(db_session).run_query(user_id, {"version": 1, "mode": "sql", "sql": sql, "limit": 50})


ESCAPE_PROBES = [
    "SELECT id, password_hash FROM users",
    'SELECT * FROM "public".users',
    "SELECT * FROM public.sessions",
    'SELECT * FROM "users"',
    "WITH users AS (SELECT * FROM users) SELECT * FROM users",
    "WITH a AS (SELECT * FROM b), b AS (SELECT 1) SELECT * FROM a",
    "SELECT (SELECT password_hash FROM users LIMIT 1) FROM sessions",
    "SELECT * FROM sessions WHERE id IN (SELECT id FROM users)",
    "SELECT * FROM goals g JOIN LATERAL (SELECT * FROM users u) q ON true",
    "SELECT * FROM (WITH users AS (SELECT 1) SELECT * FROM users) q, users",
    "SELECT * FROM pg_stat_activity",
    "SELECT * FROM information_schema.tables",
    "SELECT query_to_xml('select * from users', true, true, '')",
    "SELECT pg_read_file('/etc/passwd')",
    "SELECT current_setting('is_superuser')",
    "SELECT set_config('default_transaction_read_only', 'off', true)",
    "SELECT pg_sleep(30)",
    "SELECT 'users'::regclass",
    "SELECT * INTO stolen FROM sessions",
    "SELECT * FROM sessions FOR UPDATE",
    "WITH x AS (DELETE FROM sessions RETURNING *) SELECT * FROM x",
    "WITH RECURSIVE x AS (SELECT 1) SELECT * FROM x",
    "SELECT 'a\\', (SELECT password_hash FROM users), 'b'",
    "SELECT 1; SELECT password_hash FROM users",
    "SELECT 1 -- comment",
]


@pytest.mark.parametrize("sql", ESCAPE_PROBES)
def test_raw_sql_refuses_relations_functions_and_statements_outside_the_catalog(db_session, test_user, sql):
    _root(db_session, test_user, "Probe Root")

    payload, error, status = _run_sql(db_session, test_user.id, sql)

    assert payload is None
    assert status == 400
    assert error


def test_http_raw_sql_cannot_read_another_accounts_password_hash(client, db_session):
    victim = _user(db_session, "sqlvictim")
    attacker = _user(db_session, "sqlattacker")  # No owned fractal, as in the audit probe.

    response = client.post(
        "/api/analytics/query/run",
        headers=session_headers_for(attacker),
        json={"query_spec": {
            "version": 1,
            "mode": "sql",
            "sql": f"SELECT id, password_hash FROM users WHERE id = '{victim.id}'",
        }},
    )

    assert response.status_code == 400
    body = response.get_data(as_text=True)
    assert victim.password_hash not in body
    assert "Unknown analytics table" in response.get_json()["error"]


def test_http_raw_sql_is_refused_while_the_explorer_flag_is_off(client, db_session):
    FeatureFlagService(db_session).update_flags({"analytics_sql_explorer": False})
    user = _user(db_session, "sqlflagoff")

    response = client.post(
        "/api/analytics/query/run",
        headers=session_headers_for(user),
        json={"query_spec": {"version": 1, "mode": "sql", "sql": "SELECT name FROM sessions"}},
    )

    assert response.status_code == 404
    assert response.get_json()["error"] == "Analytics SQL is not enabled"


def test_raw_sql_cannot_be_saved_into_a_query_profile(db_session, test_user):
    payload, error, status = AnalyticsEngineService(db_session).create_profile(test_user.id, {
        "name": "Escape",
        "query_spec": {"version": 1, "mode": "sql", "sql": "SELECT password_hash FROM users"},
    })

    assert payload is None
    assert status == 400
    assert "users" in error


def test_raw_sql_scopes_metric_definitions_to_the_caller(db_session, test_user):
    other = _user(db_session, "metricother")
    for owner, name in ((test_user, "Visible Metric"), (other, "Hidden Metric")):
        root = _root(db_session, owner, f"{name} Root")
        activity = models.ActivityDefinition(id=str(uuid.uuid4()), root_id=root.id, name=f"{name} Activity")
        db_session.add(activity)
        db_session.flush()
        db_session.add(models.MetricDefinition(
            id=str(uuid.uuid4()), activity_id=activity.id, root_id=root.id, name=name, unit="reps",
        ))
    db_session.commit()

    payload, error, status = _run_sql(db_session, test_user.id, "SELECT name FROM metric_definitions ORDER BY name")

    assert error is None, error
    assert status == 200
    assert [row["name"] for row in payload["rows"]] == ["Visible Metric"]


def test_raw_sql_without_owned_roots_sees_no_rows(db_session):
    owner = _user(db_session, "rowowner")
    stranger = _user(db_session, "rowstranger")
    root = _root(db_session, owner, "Owned Root")
    db_session.add(Session(id=str(uuid.uuid4()), owner_id=owner.id, root_id=root.id, name="Private Session"))
    db_session.commit()

    payload, error, status = _run_sql(db_session, stranger.id, "SELECT name FROM sessions")

    assert error is None, error
    assert status == 200
    assert payload["rows"] == []


def test_raw_sql_keeps_colons_and_casts_inside_literals(db_session, test_user):
    root = _root(db_session, test_user, "Colon Root")
    db_session.add(Session(
        id=str(uuid.uuid4()), owner_id=test_user.id, root_id=root.id, name="10:30 practice",
        session_start=datetime(2026, 3, 1, 9, 5, tzinfo=timezone.utc),
    ))
    db_session.commit()

    payload, error, status = _run_sql(
        db_session,
        test_user.id,
        "SELECT name, to_char(session_start, 'HH24:MI') AS clock, session_start::date AS day "
        "FROM sessions WHERE name LIKE '%:30%'",
    )

    assert error is None, error
    assert status == 200
    assert payload["rows"] == [{"name": "10:30 practice", "clock": "09:05", "day": payload["rows"][0]["day"]}]


def test_raw_sql_reports_its_own_failures_as_client_errors(db_session, test_user):
    _root(db_session, test_user, "Failure Root")

    payload, error, status = _run_sql(db_session, test_user.id, "SELECT no_such_column FROM sessions")

    assert payload is None
    assert status == 400
    assert error.startswith("Analytics SQL failed")


def test_raw_sql_statement_timeout_applies(db_session, test_user, monkeypatch):
    _root(db_session, test_user, "Timeout Root")
    monkeypatch.setattr(_analytics_execution, "RAW_SQL_TIMEOUT_MS", 1)

    payload, error, status = _run_sql(
        db_session,
        test_user.id,
        "SELECT count(*) FROM generate_series(1, 50000000) a",
    )

    assert payload is None
    assert status == 400
    assert error == "Analytics SQL exceeded its time limit"


def test_read_only_scope_blocks_writes_and_restores_the_request_transaction(db_session):
    service = AnalyticsEngineService(db_session)
    db_session.execute(text("SELECT 1"))  # The request transaction has already started.

    with service._read_only_query_scope(5000):
        assert db_session.execute(text("SHOW transaction_read_only")).scalar() == "on"
        assert db_session.execute(text("SHOW statement_timeout")).scalar() == "5s"
        with pytest.raises(DBAPIError, match="read-only transaction"):
            with db_session.begin_nested():
                db_session.execute(text("CREATE TEMP TABLE analytics_write_probe (id int)"))

    assert db_session.execute(text("SHOW transaction_read_only")).scalar() == "off"
    db_session.execute(text("CREATE TEMP TABLE analytics_write_probe (id int)"))
    db_session.rollback()


def test_least_privilege_role_runs_catalog_sql_and_denies_account_tables(db_session, test_user, monkeypatch):
    role = f"analytics_probe_{uuid.uuid4().hex[:12]}"
    db_session.execute(text(f'CREATE ROLE "{role}" NOLOGIN'))
    # Exactly the documented allowlist: proves the catalog needs nothing more.
    for table in sorted(catalog_source_tables()):
        db_session.execute(text(f'GRANT SELECT ON "{table}" TO "{role}"'))
    db_session.commit()
    try:
        root = _root(db_session, test_user, "Role Root")
        db_session.add(Session(id=str(uuid.uuid4()), owner_id=test_user.id, root_id=root.id, name="Role Session"))
        db_session.commit()
        monkeypatch.setattr(_analytics_execution.config, "ANALYTICS_SQL_ROLE", role)

        payload, error, status = _run_sql(db_session, test_user.id, "SELECT name FROM sessions")
        assert error is None, error
        assert [row["name"] for row in payload["rows"]] == ["Role Session"]

        # Even a query that bypassed the parser could not read the account table.
        service = AnalyticsEngineService(db_session)
        with service._read_only_query_scope(5000, role=role):
            with pytest.raises(DBAPIError, match="permission denied"):
                with db_session.begin_nested():
                    db_session.execute(text("SELECT password_hash FROM users"))
    finally:
        db_session.rollback()
        db_session.execute(text(f'DROP OWNED BY "{role}"'))
        db_session.execute(text(f'DROP ROLE "{role}"'))
        db_session.commit()


def test_every_visualization_explanation_query_runs_through_the_guard(db_session, test_user):
    corpus = json.loads(CORPUS_PATH.read_text())
    assert corpus, "Regenerate the corpus with UPDATE_ANALYTICS_SQL_CORPUS=1 in the client suite"
    _root(db_session, test_user, "Corpus Root")

    failures = {}
    for entry in corpus:
        payload, error, status = _run_sql(db_session, test_user.id, entry["sql"])
        if status != 200:
            failures[entry["id"]] = error
    assert failures == {}


def test_catalog_relations_are_the_tenant_scoped_datasets():
    assert "users" not in CATALOG_RELATIONS
    assert "metric_definitions" in CATALOG_RELATIONS


def test_least_privilege_grants_exclude_account_and_credential_tables():
    sensitive = {
        "users", "password_reset_tokens", "signup_invite_keys", "storage_connections",
        "storage_authorizations", "agent_credentials", "agent_oauth_clients", "agent_authorization_codes",
        "agent_grants",
    }
    assert catalog_source_tables().isdisjoint(sensitive)
