"""Run a single auth signup pytest with verbose logging for debugging."""

import logging
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

logging.basicConfig(level=logging.DEBUG)
logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)

os.environ["ENV"] = "testing"

def main():
    print("STARTING TEST MANUALLY")
    pytest.main(
        [
            "-s",
            "-vv",
            "--log-cli-level=INFO",
            "tests/integration/test_auth_api.py::TestSignupEndpoint::test_signup_success",
        ]
    )
    print("DONE")

if __name__ == "__main__":
    main()
