#!/usr/bin/env python3
"""Cloud Run job entrypoint for exporting admin analytics to BigQuery."""
import os
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from services.analytics_export_service import DEFAULT_BATCH_SIZE, DEFAULT_DATASET, run_export  # noqa: E402


def emit(message: str):
    print(message, flush=True)


def export_batch_size():
    raw_value = os.getenv("ANALYTICS_EXPORT_BATCH_SIZE")
    if not raw_value:
        return DEFAULT_BATCH_SIZE
    try:
        return max(1, int(raw_value))
    except ValueError:
        emit(f"Invalid ANALYTICS_EXPORT_BATCH_SIZE={raw_value!r}; using {DEFAULT_BATCH_SIZE}")
        return DEFAULT_BATCH_SIZE


def main():
    database_url = os.getenv("SUPABASE_DIRECT_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not database_url:
        print("SUPABASE_DIRECT_DATABASE_URL or DATABASE_URL is required", file=sys.stderr)
        return 2

    try:
        from google.cloud import bigquery
    except ImportError:
        print("google-cloud-bigquery is not installed", file=sys.stderr)
        return 2

    dataset = os.getenv("BIGQUERY_DATASET", DEFAULT_DATASET)
    batch_size = export_batch_size()
    emit(f"Analytics export entrypoint starting dataset={dataset} batch_size={batch_size}")
    engine = create_engine(database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    db_session = Session()
    try:
        result = run_export(db_session, bigquery.Client(), dataset=dataset, batch_size=batch_size, log=emit)
        emit(f"Analytics export completed: {result['rows']}")
        return 0
    except Exception as exc:
        print(f"Analytics export failed: {exc}", file=sys.stderr)
        return 1
    finally:
        db_session.close()
        engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
