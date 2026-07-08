"""Health and readiness endpoints.

/health and /api/healthz are static liveness checks that never touch the
database. /api/readyz proves the configured database answers a cheap
SELECT 1 so Cloud Run startup probes can gate traffic on real database
reachability.

All routes are exempt from rate limiting: probes poll frequently enough to
exhaust the default limiter budget and would otherwise 429 the service.
"""
import logging

from flask import Blueprint
from sqlalchemy import text

from config import config
from extensions import limiter
from models import get_scoped_session

logger = logging.getLogger(__name__)

health_bp = Blueprint('health', __name__)


@health_bp.route('/health')
@limiter.exempt
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "message": "Fractal Goals Flask Server",
        "environment": config.ENV,
        "database_type": config.get_database_provider(),
    }


@health_bp.route('/api/healthz')
@limiter.exempt
def api_healthz():
    """Lightweight API health check that does not touch auth or the database."""
    return {
        "status": "ok",
        "environment": config.ENV,
    }


@health_bp.route('/api/readyz')
@limiter.exempt
def api_readyz():
    """Database-aware readiness check.

    Returns 200 only when the database answers SELECT 1; liveness should keep
    using /api/healthz so transient database blips do not restart containers.
    """
    try:
        session = get_scoped_session()
        session.execute(text("SELECT 1"))
    except Exception:
        logger.warning("Readiness check failed: database unreachable", exc_info=True)
        return {"status": "unavailable", "reason": "database"}, 503
    return {"status": "ready"}
