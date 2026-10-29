"""Shared performance fixtures."""
import pytest
from sqlalchemy import text


@pytest.fixture
def stale_statistics(db_session):
    """Planner statistics that claim every application table is empty, as right after a
    logical restore or before autoanalyze catches up with a bulk import.

    Autovacuum is held off so it cannot quietly repair the statistics mid-test. Request
    this fixture *before* any data fixture so the data lands after the analysis.
    """
    schema = db_session.execute(text("SELECT current_schema()")).scalar()
    tables = db_session.execute(
        text("SELECT tablename FROM pg_tables WHERE schemaname = :schema AND tablename <> 'alembic_version'"),
        {"schema": schema},
    ).scalars().all()
    for table in tables:
        db_session.execute(text(f'ALTER TABLE "{table}" SET (autovacuum_enabled = false)'))
        db_session.execute(text(f'ANALYZE "{table}"'))
    db_session.commit()
    yield
    db_session.rollback()
    for table in tables:
        db_session.execute(text(f'ALTER TABLE "{table}" RESET (autovacuum_enabled)'))
    db_session.commit()

