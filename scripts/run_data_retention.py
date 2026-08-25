#!/usr/bin/env python3
"""
Cloud Run job entrypoint for data retention.

Performs the recurring obligations the Privacy Policy commits to:

1. Execute account erasures whose 30-day grace window has elapsed.
2. Prune product events, password-reset records, email events, and closed beta
   signup requests at their published retention boundaries.

Both were previously either manual or entirely unimplemented, which meant the
published retention schedule was aspirational. This job is what makes it true,
so it is intended to run on a daily schedule.
"""
import os
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from services.data_retention_service import DataRetentionService  # noqa: E402
from services.user_service import UserService  # noqa: E402


def emit(message: str):
    print(message, flush=True)


def main():
    database_url = os.getenv("SUPABASE_DIRECT_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not database_url:
        print("SUPABASE_DIRECT_DATABASE_URL or DATABASE_URL is required", file=sys.stderr)
        return 2

    emit("Data retention job starting")
    engine = create_engine(database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    db_session = Session()

    failed = False
    try:
        # Erasures first: a deleted account's events should not be pruned
        # separately when the cascade removes them anyway.
        try:
            result = UserService(db_session).execute_due_erasures()
            emit(f"Erasures executed: deleted={result['deleted_count']} failed={len(result['failed'])}")
            for failure in result["failed"]:
                print(f"Erasure failed user_id={failure['user_id']}: {failure['error']}", file=sys.stderr)
            if result["failed"]:
                failed = True
        except Exception as exc:
            db_session.rollback()
            print(f"Erasure sweep failed: {exc}", file=sys.stderr)
            failed = True

        # Independent of the above: a failed sweep must not skip pruning.
        try:
            counts = DataRetentionService(db_session).prune()
            emit(f"Retention rows pruned: {counts}")
        except Exception as exc:
            db_session.rollback()
            print(f"Retention prune failed: {exc}", file=sys.stderr)
            failed = True

        return 1 if failed else 0
    finally:
        db_session.close()
        engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
