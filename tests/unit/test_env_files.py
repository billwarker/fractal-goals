"""The committed test environment must stay local-only and secret-free."""

from pathlib import Path
from urllib.parse import urlparse

from dotenv import dotenv_values

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SECRET_KEY_SUFFIXES = ("_KEY", "_SECRET", "_TOKEN", "_PASSWORD", "_DSN")
LOCAL_HOSTS = {"localhost", "127.0.0.1"}


def test_committed_testing_env_targets_only_a_local_database():
    values = dotenv_values(PROJECT_ROOT / ".env.testing")

    database_url = urlparse(values["DATABASE_URL"])

    assert database_url.hostname in LOCAL_HOSTS
    assert database_url.path.lstrip("/").endswith("_test")


def test_committed_testing_env_holds_no_secrets():
    values = dotenv_values(PROJECT_ROOT / ".env.testing")

    assert not [key for key in values if key.upper().endswith(SECRET_KEY_SUFFIXES)]
