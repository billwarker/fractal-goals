"""Existing definitions remain weekly; invalid intervals cannot enter the database."""
from importlib import import_module
import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_interval_migration_upgrade_and_downgrade(monkeypatch):
    migration = import_module('migrations.versions.d3f5a7b9c1e2_program_day_week_interval')
    engine = sa.create_engine('sqlite:///:memory:')
    with engine.begin() as connection:
        connection.exec_driver_sql('CREATE TABLE program_days (id VARCHAR PRIMARY KEY)')
        connection.exec_driver_sql("INSERT INTO program_days VALUES ('legacy')")
        monkeypatch.setattr(migration, 'op', Operations(MigrationContext.configure(connection)))
        migration.upgrade()
        assert connection.exec_driver_sql('SELECT repeat_every_weeks FROM program_days').scalar_one() == 1
        connection.exec_driver_sql("INSERT INTO program_days (id, repeat_every_weeks) VALUES ('fortnight', 2)")
        with pytest.raises(sa.exc.IntegrityError):
            connection.exec_driver_sql("INSERT INTO program_days (id, repeat_every_weeks) VALUES ('invalid', 0)")
        migration.downgrade()
        assert 'repeat_every_weeks' not in {column['name'] for column in sa.inspect(connection).get_columns('program_days')}
        assert connection.exec_driver_sql('SELECT COUNT(*) FROM program_days').scalar_one() == 2
