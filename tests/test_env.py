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

    return TEST_ENV_FILE
