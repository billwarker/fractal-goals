#!/usr/bin/env python3
"""Run one durable AI proposal worker process.

Deploy as a long-running process beside the Flask API. Each poll uses a fresh
SQLAlchemy session so database connections and failed transactions do not leak
between jobs.
"""

import os
import signal
import socket
import sys
import time

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from models import get_scoped_session, remove_session  # noqa: E402
from services.agent_harness_service import AgentHarnessService  # noqa: E402
from services.agent_embedded_service import AgentEmbeddedService  # noqa: E402
from services import init_services  # noqa: E402


def main():
    init_services()
    stopping = False

    def request_stop(_signal, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    idle_seconds = max(0.25, min(10.0, float(os.getenv("AGENT_WORKER_IDLE_SECONDS", "2"))))
    print(f"AI agent worker started worker_id={worker_id}", flush=True)

    while not stopping:
        session = get_scoped_session()
        result = None
        try:
            result = AgentHarnessService(session).run_once(worker_id)
            embedded_result = AgentEmbeddedService(session).run_once(worker_id)
            result = result or embedded_result
            if result:
                print(
                    f"AI agent run processed run_id={result['id']} status={result['status']}",
                    flush=True,
                )
        except Exception as error:  # noqa: BLE001 - keep the supervised worker alive after transient DB failures
            session.rollback()
            print(f"AI agent worker poll failed type={type(error).__name__}", file=sys.stderr, flush=True)
        finally:
            session.close()
            remove_session()
        if not stopping:
            time.sleep(0.1 if result else idle_seconds)

    print(f"AI agent worker stopped worker_id={worker_id}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
