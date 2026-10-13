#!/usr/bin/env python3
"""Run pytest in a uniquely named disposable PostgreSQL database."""
import os
from pathlib import Path
import subprocess
import sys
import uuid

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
from tests.test_env import bootstrap_test_environment
bootstrap_test_environment()
from config import config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def main():
    url = make_url(config.get_database_url())
    if config.ENV != 'testing' or 'test' not in (url.database or '').lower():
        raise SystemExit('Refusing to create an audit database outside the testing configuration')
    name = 'fractal_test_' + uuid.uuid4().hex
    engine = create_engine(url.set(database='postgres'), isolation_level='AUTOCOMMIT')
    with engine.connect() as connection:
        connection.execute(text(f'CREATE DATABASE {name}'))
    environment = dict(os.environ, FRACTAL_TEST_DATABASE_URL=url.set(database=name).render_as_string(hide_password=False))
    try:
        return subprocess.call([sys.executable, '-m', 'pytest', *sys.argv[1:]], cwd=PROJECT_ROOT, env=environment)
    finally:
        with engine.connect() as connection:
            connection.execute(text(f'DROP DATABASE {name} WITH (FORCE)'))
        engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
