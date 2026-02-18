import sqlalchemy as sa
from sqlalchemy import create_engine, JSON, Column, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
from datetime import datetime, timezone
import uuid
import json

# Fallback for SQLite/other engines
# JSONB gives us indexing and faster processing in Postgres
JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")

Base = declarative_base()

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
    except:
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
    from sqlalchemy.pool import QueuePool, NullPool
    
    if config.is_postgres():
        engine = create_engine(
            db_url,
            echo=False,
            poolclass=QueuePool,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            pool_recycle=3600,
            pool_timeout=30,
        )
    else:
        engine = create_engine(db_url, echo=False, poolclass=NullPool)
    
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
