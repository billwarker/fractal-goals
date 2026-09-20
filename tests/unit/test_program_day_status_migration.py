"""Contract checks for the occurrence-level program day override migration."""

from importlib import import_module

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_program_day_status_migration_constraints_and_downgrade(monkeypatch):
    migration = import_module(
        "migrations.versions.e9b1c3d5f7a9_add_program_day_status_overrides"
    )
    engine = sa.create_engine("sqlite:///:memory:")

    @sa.event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE programs (id VARCHAR PRIMARY KEY)")
        connection.exec_driver_sql("CREATE TABLE users (id VARCHAR PRIMARY KEY)")
        monkeypatch.setattr(
            migration,
            "op",
            Operations(MigrationContext.configure(connection)),
        )
        migration.upgrade()

        table = "program_day_status_overrides"
        assert table in sa.inspect(connection).get_table_names()
        foreign_keys = connection.exec_driver_sql(f"PRAGMA foreign_key_list({table})").all()
        assert {(row[3], row[6]) for row in foreign_keys} == {
            ("program_id", "CASCADE"),
            ("set_by_user_id", "SET NULL"),
        }

        connection.exec_driver_sql("INSERT INTO programs (id) VALUES ('program-1')")
        insert = (
            f"INSERT INTO {table} "
            "(id, program_id, date, status, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)"
        )
        row = ("one", "program-1", "2026-09-16", "complete", "2026-09-16", "2026-09-16")
        connection.exec_driver_sql(insert, row)
        with pytest.raises(sa.exc.IntegrityError):
            connection.exec_driver_sql(insert, ("two", *row[1:]))
        with pytest.raises(sa.exc.IntegrityError):
            connection.exec_driver_sql(insert, ("bad-status", "program-1", "2026-09-17", "automatic", "2026-09-16", "2026-09-16"))
        with pytest.raises(sa.exc.IntegrityError):
            connection.exec_driver_sql(insert, ("bad-parent", "missing", "2026-09-17", "rest", "2026-09-16", "2026-09-16"))

        connection.exec_driver_sql("DELETE FROM programs WHERE id = 'program-1'")
        assert connection.exec_driver_sql(f"SELECT COUNT(*) FROM {table}").scalar_one() == 0
        migration.downgrade()
        assert table not in sa.inspect(connection).get_table_names()
