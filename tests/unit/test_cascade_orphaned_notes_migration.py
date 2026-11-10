"""The orphaned-notes repair soft-deletes notes on deleted parents with their parent's stamp, once."""

from importlib import import_module

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

GONE = '2026-10-01 09:00:00'


def _notes(connection):
    rows = connection.exec_driver_sql(
        "SELECT id, deleted_at, carried_into_session_id, carried_into_instance_id FROM notes ORDER BY id"
    ).all()
    return {row[0]: row[1:] for row in rows}


def test_orphaned_notes_follow_their_deleted_parents(monkeypatch):
    migration = import_module("migrations.versions.e1a3c5e7b9d2_cascade_orphaned_notes")
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE sessions (id VARCHAR PRIMARY KEY, deleted_at VARCHAR)")
        connection.exec_driver_sql("CREATE TABLE activity_instances (id VARCHAR PRIMARY KEY, deleted_at VARCHAR)")
        connection.exec_driver_sql("CREATE TABLE goals (id VARCHAR PRIMARY KEY, deleted_at VARCHAR)")
        connection.exec_driver_sql(
            "CREATE TABLE notes (id VARCHAR PRIMARY KEY, context_type VARCHAR, session_id VARCHAR,"
            " activity_instance_id VARCHAR, goal_id VARCHAR, deleted_at VARCHAR,"
            " carried_into_session_id VARCHAR, carried_into_instance_id VARCHAR)"
        )
        connection.exec_driver_sql(
            f"INSERT INTO sessions VALUES ('s-gone', '{GONE}'), ('s-live', NULL)")
        connection.exec_driver_sql(
            f"INSERT INTO activity_instances VALUES ('i-gone', '{GONE}'), ('i-live', NULL)")
        connection.exec_driver_sql(f"INSERT INTO goals VALUES ('g-gone', '{GONE}'), ('g-live', NULL)")
        connection.exec_driver_sql(
            "INSERT INTO notes VALUES"
            " ('1-session', 'session', 's-gone', NULL, NULL, NULL, NULL, NULL),"
            " ('2-activity', 'activity_instance', 's-live', 'i-gone', NULL, NULL, NULL, NULL),"
            " ('3-goal', 'goal', NULL, NULL, 'g-gone', NULL, NULL, NULL),"
            " ('4-linked', 'activity_instance', 's-live', 'i-live', 'g-gone', NULL, NULL, NULL),"
            " ('5-live', 'session', 's-live', NULL, NULL, NULL, NULL, NULL),"
            " ('6-earlier', 'session', 's-gone', NULL, NULL, '2026-01-01 00:00:00', NULL, NULL),"
            " ('7-pin', 'session', 's-live', NULL, NULL, NULL, 's-gone', 'i-gone')"
        )
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))

        migration.upgrade()
        after = _notes(connection)
        assert after['1-session'][0] == GONE
        assert after['2-activity'][0] == GONE
        assert after['3-goal'][0] == GONE
        assert after['4-linked'][0] is None  # Only linked the deleted goal.
        assert after['5-live'][0] is None
        assert after['6-earlier'][0] == '2026-01-01 00:00:00'  # Keeps its own stamp.
        assert after['7-pin'] == (None, None, None)  # The pin waits again.

        migration.upgrade()
        assert _notes(connection) == after
