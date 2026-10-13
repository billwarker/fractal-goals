import os
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEST_ENV_FILE = PROJECT_ROOT / ".env.testing"


def bootstrap_test_environment() -> Path:
    """Force pytest-backed runs onto the checked-in testing environment."""
    os.environ["ENV"] = "testing"
    os.environ["FLASK_ENV"] = "testing"

    if TEST_ENV_FILE.exists():
        load_dotenv(TEST_ENV_FILE, override=True)

    isolated_url = os.environ.get('FRACTAL_TEST_DATABASE_URL')
    if isolated_url:
        # A dedicated opt-in survives repeated bootstrap calls in subprocesses.
        from sqlalchemy.engine import make_url
        if 'test' not in (make_url(isolated_url).database or '').lower():
            raise ValueError('FRACTAL_TEST_DATABASE_URL must name a test database')
        os.environ['DATABASE_URL'] = isolated_url
    return TEST_ENV_FILE
