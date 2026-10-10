"""Exclusion migration has uniqueness, cascading ownership, and a reversible schema."""
from importlib import import_module
import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_exclusions_migration_upgrade_and_downgrade(monkeypatch):
    migration = import_module('migrations.versions.c2e4f6a8b0d1_program_day_occurrence_exclusions')
    engine = sa.create_engine('sqlite:///:memory:')
    with engine.begin() as connection:
        connection.exec_driver_sql('PRAGMA foreign_keys=ON')
        connection.exec_driver_sql('CREATE TABLE program_days (id VARCHAR PRIMARY KEY)')
        connection.exec_driver_sql('CREATE TABLE users (id VARCHAR PRIMARY KEY)')
        monkeypatch.setattr(migration, 'op', Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        table = 'program_day_occurrence_exclusions'
        assert table in sa.inspect(connection).get_table_names()
        connection.exec_driver_sql("INSERT INTO program_days VALUES ('day')")
        insert = f'INSERT INTO {table} (id, program_day_id, date, created_at) VALUES (?, ?, ?, ?)'
        connection.exec_driver_sql(insert, ('one', 'day', '2026-09-07', '2026-09-01'))
        with pytest.raises(sa.exc.IntegrityError):
            connection.exec_driver_sql(insert, ('two', 'day', '2026-09-07', '2026-09-01'))
        with pytest.raises(sa.exc.IntegrityError):
            connection.exec_driver_sql(insert, ('three', 'missing', '2026-09-08', '2026-09-01'))
        connection.exec_driver_sql("DELETE FROM program_days WHERE id = 'day'")
        assert connection.exec_driver_sql(f'SELECT COUNT(*) FROM {table}').scalar_one() == 0
        migration.downgrade()
        assert table not in sa.inspect(connection).get_table_names()
