import sys, os
import pytest
import json
import logging

logging.basicConfig(level=logging.DEBUG)
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)

os.environ['ENV'] = 'testing'

def test_manual():
    print("STARTING TEST MANUALLY")
    pytest.main(['-s', '-vv', '--log-cli-level=INFO', 'tests/integration/test_auth_api.py::TestSignupEndpoint::test_signup_success'])
    print("DONE")

if __name__ == '__main__':
    test_manual()
