"""
Alembic Environment Configuration

This module configures Alembic to:
1. Use the same database configuration as the application (via config.py)
2. Import all models for autogenerate support
3. Support both SQLite (development) and PostgreSQL (production)
"""

from logging.config import fileConfig
import sys
from pathlib import Path

from sqlalchemy import pool
from sqlalchemy.engine import Engine

from alembic import context

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import our application's config and models
from config import config as app_config
from models import Base

# This is the Alembic Config object, which provides access to the values
# within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set the target metadata for autogenerate support
target_metadata = Base.metadata


def get_url():
    """Get the database URL from application config or alembic.ini."""
    # First try to use our application config (which reads from environment)
    try:
        url = app_config.get_database_url()
        if url:
            return url
    except Exception:
        pass
    
    # Fallback to alembic.ini setting
    return config.get_main_option("sqlalchemy.url")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Enable compare_type for detecting column type changes
        compare_type=True,
        # Enable compare_server_default for detecting default value changes
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    from sqlalchemy import create_engine
    
    url = get_url()
    
    # Configure engine based on database type
    if url.startswith('sqlite'):
        # SQLite configuration
        connectable = create_engine(
            url,
            poolclass=pool.NullPool,
        )
    else:
        # PostgreSQL / other database configuration
        connectable = create_engine(
            url,
            poolclass=pool.NullPool,
        )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Enable compare_type for detecting column type changes
            compare_type=True,
            # Enable compare_server_default for detecting default value changes
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
