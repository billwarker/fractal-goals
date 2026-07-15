import threading
import time

from services.landing_publish_service import LandingPublishService


class _Dialect:
    name = "sqlite"


class _Bind:
    dialect = _Dialect()


class _Session:
    @staticmethod
    def get_bind():
        return _Bind()


def test_landing_publish_process_lock_serializes_concurrent_publishers():
    state_lock = threading.Lock()
    state = {"active": 0, "max_active": 0}

    class _Harness(LandingPublishService):
        def _publish_landing_examples_locked(self, *, examples_override=None):
            with state_lock:
                state["active"] += 1
                state["max_active"] = max(state["max_active"], state["active"])
            time.sleep(0.03)
            with state_lock:
                state["active"] -= 1
            return {}, None, 200

    services = [_Harness(_Session()), _Harness(_Session())]
    threads = [threading.Thread(target=service.publish_landing_examples) for service in services]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=1)

    assert all(not thread.is_alive() for thread in threads)
    assert state["max_active"] == 1


def test_landing_publish_lock_uses_postgres_transaction_advisory_lock():
    calls = []

    class _PostgresDialect:
        name = "postgresql"

    class _PostgresBind:
        dialect = _PostgresDialect()

    class _PostgresSession:
        @staticmethod
        def get_bind():
            return _PostgresBind()

        @staticmethod
        def execute(statement, params):
            calls.append((str(statement), params))

    service = LandingPublishService(_PostgresSession())
    with service._landing_publish_lock():
        pass

    assert len(calls) == 1
    assert "pg_advisory_xact_lock" in calls[0][0]
    assert calls[0][1]["lock_key"] > 0
