import argparse
import os
import sys
from datetime import datetime

sys.path.append(os.getcwd())

from app import app
from models import get_engine, get_session
from sqlalchemy import text


SUMMARY_SQL = text(
    """
    WITH candidates AS (
        SELECT
            ai.id,
            ai.session_id,
            ai.time_start,
            ai.time_stop,
            ai.duration_seconds,
            COALESCE(
                s.completed_at,
                s.session_end,
                s.updated_at,
                s.created_at,
                timezone('utc', now())
            ) AS completion_ts
        FROM activity_instances ai
        JOIN sessions s ON s.id = ai.session_id
        WHERE s.completed = TRUE
          AND s.deleted_at IS NULL
          AND ai.deleted_at IS NULL
          AND COALESCE(ai.completed, FALSE) = FALSE
    )
    SELECT
        COUNT(*)::bigint AS instance_count,
        COUNT(DISTINCT session_id)::bigint AS session_count,
        SUM(CASE WHEN time_start IS NULL THEN 1 ELSE 0 END)::bigint AS no_start_count,
        SUM(CASE WHEN time_start IS NOT NULL AND time_stop IS NULL THEN 1 ELSE 0 END)::bigint AS no_stop_count,
        SUM(CASE WHEN time_start IS NOT NULL AND time_stop IS NOT NULL THEN 1 ELSE 0 END)::bigint AS already_stopped_count
    FROM candidates
    """
)

BACKFILL_SQL = text(
    """
    WITH candidates AS (
        SELECT
            ai.id,
            ai.time_start,
            ai.time_stop,
            COALESCE(
                s.completed_at,
                s.session_end,
                s.updated_at,
                s.created_at,
                timezone('utc', now())
            ) AS completion_ts
        FROM activity_instances ai
        JOIN sessions s ON s.id = ai.session_id
        WHERE s.completed = TRUE
          AND s.deleted_at IS NULL
          AND ai.deleted_at IS NULL
          AND COALESCE(ai.completed, FALSE) = FALSE
    ),
    updated AS (
        UPDATE activity_instances ai
        SET
            completed = TRUE,
            time_start = CASE
                WHEN ai.time_start IS NULL THEN c.completion_ts
                ELSE ai.time_start
            END,
            time_stop = CASE
                WHEN ai.time_start IS NULL THEN c.completion_ts
                WHEN ai.time_stop IS NULL THEN CASE
                    WHEN c.completion_ts < ai.time_start THEN ai.time_start
                    ELSE c.completion_ts
                END
                ELSE ai.time_stop
            END,
            duration_seconds = CASE
                WHEN ai.time_start IS NULL THEN 0
                WHEN ai.time_stop IS NULL THEN GREATEST(
                    EXTRACT(EPOCH FROM (
                        CASE
                            WHEN c.completion_ts < ai.time_start THEN ai.time_start
                            ELSE c.completion_ts
                        END - ai.time_start
                    ))::int,
                    0
                )
                ELSE ai.duration_seconds
            END,
            updated_at = timezone('utc', now())
        FROM candidates c
        WHERE ai.id = c.id
        RETURNING ai.id
    )
    SELECT COUNT(*)::bigint AS updated_count FROM updated
    """
)


def _fmt(row):
    return {
        "instances": int(row.instance_count or 0),
        "sessions": int(row.session_count or 0),
        "no_start": int(row.no_start_count or 0),
        "no_stop": int(row.no_stop_count or 0),
        "already_stopped": int(row.already_stopped_count or 0),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Backfill activity_instances.completed for already-completed sessions."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply updates. Without this flag, script runs a dry-run summary only.",
    )
    args = parser.parse_args()

    with app.app_context():
        db_session = get_session(get_engine())
        try:
            before = db_session.execute(SUMMARY_SQL).one()
            summary_before = _fmt(before)

            print("[summary:before]", summary_before)

            if not args.apply:
                print("Dry-run only. Re-run with --apply to backfill.")
                return

            started_at = datetime.utcnow().isoformat() + "Z"
            print(f"Applying backfill at {started_at} ...")

            updated = db_session.execute(BACKFILL_SQL).one()
            db_session.commit()

            after = db_session.execute(SUMMARY_SQL).one()
            summary_after = _fmt(after)

            print("[result] updated_instances=", int(updated.updated_count or 0))
            print("[summary:after]", summary_after)
        except Exception:
            db_session.rollback()
            raise
        finally:
            db_session.close()


if __name__ == "__main__":
    main()
