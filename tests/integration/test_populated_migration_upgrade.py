"""Deploy upgrades must work on historical schemas containing real conversion inputs."""
import os
from pathlib import Path
import subprocess
import sys
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from config import config

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def historical_database():
    url = make_url(config.get_database_url())
    assert config.ENV == 'testing' and 'test' in (url.database or '').lower()
    name = 'fractal_test_upgrade_' + uuid4().hex
    admin = create_engine(url.set(database='postgres'), isolation_level='AUTOCOMMIT')
    with admin.connect() as connection:
        connection.execute(text(f'CREATE DATABASE {name}'))
    target = url.set(database=name).render_as_string(hide_password=False)
    engine = create_engine(target)
    environment = dict(os.environ, ENV='testing', DATABASE_URL=target,
                       FRACTAL_TEST_DATABASE_URL=target, SUPABASE_DIRECT_DATABASE_URL='')

    def alembic(*arguments):
        result = subprocess.run([sys.executable, '-m', 'alembic', *arguments], cwd=ROOT,
                                env=environment, capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr

    try:
        yield engine, alembic
    finally:
        engine.dispose()
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE {name} WITH (FORCE)'))
        admin.dispose()


@pytest.mark.integration
def test_empty_database_upgrade_and_latest_revision_reversal(historical_database):
    _engine, alembic = historical_database
    alembic('upgrade', 'head')
    alembic('check')
    alembic('downgrade', '-1')
    alembic('upgrade', 'head')
    alembic('check')


@pytest.mark.integration
def test_populated_pre_conditions_database_upgrades_to_head(historical_database):
    engine, alembic = historical_database
    alembic('upgrade', 'b7d9f1a3c5e7')
    with engine.begin() as connection:
        assert 'review_cadence_value' not in {c['name'] for c in inspect(connection).get_columns('goals')}
        connection.execute(text("""
            INSERT INTO users (id, username, email, password_hash)
            VALUES ('upgrade-user', 'upgrade-user', 'upgrade@example.test', 'unused');
            INSERT INTO goals (id, root_id, name, created_at, completed, row_version,
                               inherit_parent_activities, track_activities, paused)
            VALUES ('upgrade-root', 'upgrade-root', 'Upgrade regression', '2026-01-01', false, 1, false, true, false);
            INSERT INTO activity_definitions (id, root_id, name, has_sets, has_metrics)
            VALUES ('upgrade-activity', 'upgrade-root', 'Practice', false, false);
            INSERT INTO targets (id, goal_id, root_id, activity_id, name, type, frequency_count, created_at)
            VALUES ('upgrade-target', 'upgrade-root', 'upgrade-root', 'upgrade-activity',
                    'Practise once', 'frequency', 1, '2026-02-01');
            INSERT INTO sessions (id, root_id, name, completed, session_start, owner_id)
            VALUES ('upgrade-session', 'upgrade-root', 'Earlier evidence', true, '2026-01-15', 'upgrade-user');
            INSERT INTO activity_instances
                (id, root_id, session_id, activity_definition_id, completed, created_at, time_start)
            VALUES ('upgrade-instance', 'upgrade-root', 'upgrade-session', 'upgrade-activity',
                    true, '2026-01-15', '2026-01-15');
        """))
    alembic('upgrade', 'head')
    with engine.connect() as connection:
        goal = connection.execute(text("""
            SELECT completed, completed_at, completed_session_id, completion_source, completion_reason
            FROM goals WHERE id = 'upgrade-root'
        """)).one()
        assert goal.completed
        assert str(goal.completed_at) == '2026-01-15 00:00:00'
        assert goal.completed_session_id == 'upgrade-session'
        assert goal.completion_source == 'condition'
        assert goal.completion_reason == 'condition_met_at_migration'
    alembic('check')
    alembic('downgrade', '-1')
    alembic('upgrade', 'head')
    alembic('check')
