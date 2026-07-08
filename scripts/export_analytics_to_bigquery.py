#!/usr/bin/env python3
"""Cloud Run job entrypoint for exporting admin analytics to BigQuery."""
import os
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from services.analytics_export_service import DEFAULT_DATASET, run_export  # noqa: E402


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
    engine = create_engine(database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    db_session = Session()
    try:
        result = run_export(db_session, bigquery.Client(), dataset=dataset)
        print(f"Analytics export completed: {result['rows']}")
        return 0
    except Exception as exc:
        print(f"Analytics export failed: {exc}", file=sys.stderr)
        return 1
    finally:
        db_session.close()
        engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
