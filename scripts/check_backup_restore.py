#!/usr/bin/env python3
"""Prove a local test database can survive a pg_dump/pg_restore cycle."""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

import psycopg2
from psycopg2 import sql
from sqlalchemy.engine import make_url

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from config import config  # noqa: E402


def _run(command: list[str]) -> None:
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode:
        detail = (completed.stderr or completed.stdout).strip()
        raise RuntimeError(f"{Path(command[0]).name} failed: {detail}")


def main() -> None:
    source = make_url(config.get_database_url())
    source_name = source.database or ""
    if config.ENV != "testing" or "test" not in source_name.lower():
        raise SystemExit(
            "Refusing to drill a database outside ENV=testing with a test name"
        )
    if source.host not in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit("Backup drill source must be local")

    pg_dump = shutil.which("pg_dump")
    pg_restore = shutil.which("pg_restore")
    psql = shutil.which("psql")
    if not pg_dump or not pg_restore or not psql:
        raise SystemExit("pg_dump, pg_restore, and psql are required")

    restored_name = f"fractal_restore_test_{uuid.uuid4().hex[:12]}"
    admin_url = source.set(database="postgres").render_as_string(hide_password=False)
    restored_url = source.set(database=restored_name).render_as_string(
        hide_password=False
    )
    started_at = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix="fractal-restore-") as directory:
        dump_path = Path(directory) / "database.dump"
        restore_sql = Path(directory) / "restore.sql"
        compatible_sql = Path(directory) / "restore-compatible.sql"
        admin = psycopg2.connect(admin_url)
        admin.autocommit = True
        try:
            _run(
                [
                    pg_dump,
                    source.render_as_string(hide_password=False),
                    "-Fc",
                    "-f",
                    str(dump_path),
                ]
            )
            with admin.cursor() as cursor:
                cursor.execute(
                    sql.SQL("CREATE DATABASE {}").format(sql.Identifier(restored_name))
                )
            _run(
                [
                    pg_restore,
                    "--no-owner",
                    "--no-privileges",
                    "--file",
                    str(restore_sql),
                    str(dump_path),
                ]
            )
            # A newer client may emit settings unknown to the older target
            # server. These session-level timeout defaults do not affect data.
            with restore_sql.open() as source_file, compatible_sql.open("w") as target_file:
                for line in source_file:
                    if line.startswith("SET transaction_timeout ="):
                        continue
                    target_file.write(line)
            _run(
                [
                    psql,
                    restored_url,
                    "-v",
                    "ON_ERROR_STOP=1",
                    "-f",
                    str(compatible_sql),
                ]
            )

            source_db = psycopg2.connect(source.render_as_string(hide_password=False))
            restored_db = psycopg2.connect(restored_url)
            try:
                query = """
                    SELECT count(*) FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                """
                with source_db.cursor() as source_cursor, restored_db.cursor() as restored_cursor:
                    source_cursor.execute(query)
                    restored_cursor.execute(query)
                    source_tables = source_cursor.fetchone()[0]
                    restored_tables = restored_cursor.fetchone()[0]
                    if source_tables == 0 or restored_tables != source_tables:
                        raise RuntimeError(
                            f"Restore table mismatch: source={source_tables}, restored={restored_tables}"
                        )
                    restored_cursor.execute("SELECT version_num FROM alembic_version")
                    if not restored_cursor.fetchone():
                        raise RuntimeError("Restored database has no Alembic revision")
            finally:
                source_db.close()
                restored_db.close()
        finally:
            with admin.cursor() as cursor:
                cursor.execute(
                    sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                        sql.Identifier(restored_name)
                    )
                )
            admin.close()

    elapsed = time.perf_counter() - started_at
    print(f"Backup/restore drill passed in {elapsed:.2f}s; restored database removed")


if __name__ == "__main__":
    main()
