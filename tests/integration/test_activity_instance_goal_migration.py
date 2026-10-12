"""Exercise the additive migration and its reversal against PostgreSQL."""
import importlib.util
from pathlib import Path
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import inspect
import pytest

@pytest.mark.integration
def test_instance_goal_migration_is_reversible_and_indexed(db_session):
    path = Path(__file__).resolve().parents[2] / 'migrations/versions/a4c6e8f0b2d4_add_activity_instance_goals.py'
    spec = importlib.util.spec_from_file_location('instance_goal_migration', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with db_session.get_bind().begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            module.downgrade()
            assert 'activity_instance_goal_associations' not in inspect(connection).get_table_names()
            module.upgrade()
            inspector = inspect(connection)
            assert inspector.get_pk_constraint('activity_instance_goal_associations')['constrained_columns'] == ['activity_instance_id', 'goal_id']
            assert inspector.get_indexes('activity_instance_goal_associations')[0]['column_names'] == ['goal_id', 'activity_instance_id']
            assert all(key['options']['ondelete'] == 'CASCADE' for key in inspector.get_foreign_keys('activity_instance_goal_associations'))
            module.downgrade()
            module.upgrade()
