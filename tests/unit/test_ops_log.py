import logging

import pytest

from services.ops_log import log_ops_event


@pytest.fixture(autouse=True)
def capture_ops_logger(caplog):
    caplog.set_level(logging.DEBUG, logger="fractal.ops")
    return caplog


def test_emits_single_key_value_line(caplog):
    log_ops_event("auth.login_failed", reason="bad_password", user_id="user-1")

    assert len(caplog.records) == 1
    record = caplog.records[0]
    assert record.name == "fractal.ops"
    assert record.message == "ops_event=auth.login_failed reason=bad_password user_id=user-1"


def test_level_mapping(caplog):
    log_ops_event("http.server_error", level="error", status=500)
    log_ops_event("quota.denied", level="warning", resource="goals")
    log_ops_event("email.invite_sent")

    levels = [record.levelno for record in caplog.records]
    assert levels == [logging.ERROR, logging.WARNING, logging.INFO]


def test_sanitizes_values(caplog):
    log_ops_event(
        "beta.signup_created",
        note="line one\nline two",
        label='has "quotes" and spaces',
        missing=None,
    )

    message = caplog.records[0].message
    assert "\n" not in message
    assert 'note="line one line two"' in message
    assert "label=\"has 'quotes' and spaces\"" in message
    assert "missing=-" in message


def test_truncates_long_values(caplog):
    log_ops_event("beta.signup_created", email="x" * 500)

    message = caplog.records[0].message
    assert len(message) < 300


def test_never_raises_on_unstringable_value(caplog):
    class Explosive:
        def __str__(self):
            raise RuntimeError("boom")

    # Must not raise even when a field value cannot be stringified.
    log_ops_event("quota.denied", payload=Explosive())
