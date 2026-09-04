import sqlalchemy as sa
from sqlalchemy import create_engine, JSON, Column, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
from datetime import datetime, timezone
import uuid
import json

# JSONB gives us indexing and faster processing in Postgres
JSON_TYPE = JSONB()

Base = declarative_base()

# Alembic owns this function in deployed databases. Registering the same DDL
# with metadata keeps fresh ``create_all`` databases (tests and utility tools)
# behaviorally identical without requiring application code to fall back to
# payload-hydrating quota queries.
COMPACT_JSONB_OCTET_LENGTH_SQL = r"""
CREATE OR REPLACE FUNCTION public.compact_jsonb_octet_length(input_value jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
DECLARE
    total bigint;
    item jsonb;
    member record;
    item_count bigint := 0;
BEGIN
    CASE jsonb_typeof(input_value)
        WHEN 'array' THEN
            total := 2;
            FOR item IN SELECT value FROM jsonb_array_elements(input_value)
            LOOP
                IF item_count > 0 THEN total := total + 1; END IF;
                total := total + public.compact_jsonb_octet_length(item);
                item_count := item_count + 1;
            END LOOP;
            RETURN total;
        WHEN 'object' THEN
            total := 2;
            FOR member IN SELECT key, value FROM jsonb_each(input_value)
            LOOP
                IF item_count > 0 THEN total := total + 1; END IF;
                total := total
                    + octet_length(to_jsonb(member.key)::text)
                    + 1
                    + public.compact_jsonb_octet_length(member.value);
                item_count := item_count + 1;
            END LOOP;
            RETURN total;
        ELSE
            RETURN octet_length(input_value::text);
    END CASE;
END;
$$;
"""
sa.event.listen(
    Base.metadata,
    "after_create",
    sa.DDL(COMPACT_JSONB_OCTET_LENGTH_SQL).execute_if(dialect="postgresql"),
)


def utc_now():
    return datetime.now(timezone.utc)

def format_utc(dt):
    """Format a datetime object to UTC ISO string with 'Z' suffix."""
    if not dt: return None
    if dt.tzinfo is None:
        return dt.isoformat(timespec='seconds') + 'Z'
    return dt.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

def _safe_load_json(data, default=None):
    if data is None: return default
    if isinstance(data, (dict, list)): return data
    try:
        return json.loads(data)
    except (json.JSONDecodeError, TypeError, UnicodeDecodeError):
        return default

# Singleton engine for connection pooling
_cached_engine = None

def get_engine(db_url=None):
    global _cached_engine
    if _cached_engine is not None and db_url is None:
        return _cached_engine
    
    if db_url is None:
        from config import config
        db_url = config.get_database_url()
    
    from config import config
    from sqlalchemy.pool import QueuePool
    
    engine = create_engine(
        db_url,
        echo=False,
        poolclass=QueuePool,
        pool_size=config.DB_POOL_SIZE,
        max_overflow=config.DB_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=config.DB_POOL_RECYCLE_SECONDS,
        pool_timeout=config.DB_POOL_TIMEOUT,
    )
    
    if db_url == config.get_database_url():
        _cached_engine = engine
    return engine

def reset_engine():
    global _cached_engine
    if _cached_engine is not None:
        _cached_engine.dispose()
        _cached_engine = None

_session_factory = None

def get_scoped_session():
    global _session_factory
    if _session_factory is None:
        engine = get_engine()
        session_factory = sessionmaker(bind=engine)
        _session_factory = scoped_session(session_factory)
    return _session_factory()

def remove_session():
    global _session_factory
    if _session_factory is not None:
        _session_factory.remove()

def get_session(engine):
    """DEPRECATED: Prefer get_scoped_session()"""
    DBSession = sessionmaker(bind=engine)
    return DBSession()

def init_db(engine):
    Base.metadata.create_all(engine)
