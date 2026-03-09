from pathlib import Path
import logging

from alembic import command
from alembic.config import Config as AlembicConfig

from config import config


logger = logging.getLogger(__name__)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
_migrations_applied = False


def build_alembic_config():
    """Create an Alembic config that uses the live app database URL."""
    alembic_config = AlembicConfig(str(PROJECT_ROOT / "alembic.ini"))
    alembic_config.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))
    alembic_config.set_main_option("sqlalchemy.url", config.get_database_url())
    return alembic_config


def apply_startup_migrations():
    """Apply pending Alembic migrations for local runtime environments."""
    global _migrations_applied

    if _migrations_applied or not config.should_auto_run_migrations():
        return False

    logger.info("Applying pending database migrations before startup")
    command.upgrade(build_alembic_config(), "head")
    _migrations_applied = True
    logger.info("Database migrations are up to date")
    return True
