"""
Flask Application for Fractal Goals
Main application file that integrates API and page routes.
"""

from flask import Flask, request
from flask_cors import CORS
from flask_compress import Compress
from flask_talisman import Talisman
import logging
import time

from extensions import limiter
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
import os

# Initialize Sentry if DSN is present
if os.getenv("SENTRY_DSN"):
    from config import config as _sentry_config

    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        integrations=[FlaskIntegration()],
        traces_sample_rate=_sentry_config.SENTRY_TRACES_SAMPLE_RATE,
        profiles_sample_rate=_sentry_config.SENTRY_PROFILES_SAMPLE_RATE,
        environment=os.getenv("ENV", "development")
    )

from config import config
# from blueprints.api import api_bp # Deprecated
from blueprints.activities_api import activities_bp
from blueprints.sessions_api import sessions_bp
from blueprints.goals_api import goals_bp
from blueprints.goal_levels_api import goal_levels_bp
from blueprints.templates_api import templates_bp
from blueprints.timers_api import timers_bp
from blueprints.programs_api import programs_bp
from blueprints.notes_api import notes_bp
from blueprints.dashboards_api import dashboards_bp
from blueprints.page_surface_api import page_surface_bp
from blueprints.analytics_api import analytics_bp
from blueprints.logs_api import logs_api
from blueprints.feature_flags_api import feature_flags_bp
from blueprints.auth_api import auth_bp
from blueprints.admin_api import admin_bp
from blueprints.public_api import public_bp
from blueprints.pages import pages_bp
from blueprints.health_api import health_bp
from blueprints.telemetry_api import telemetry_bp
from blueprints.error_handlers import register_error_handlers
from services.completion_handlers import clear_achievement_context, clear_live_progress
from services import init_services
from services.db_migration_service import apply_startup_migrations
from services.ops_log import log_ops_event

# Print configuration on startup
config.print_config()

# Verify production security settings
try:
    config.check_production_security()
except ValueError as e:
    print(f"\n📛 SECURITY ERROR: {e}\n")
    exit(1)

# Create Flask app
app = Flask(__name__)
app.config['ENV'] = config.ENV
app.config['DEBUG'] = config.DEBUG
app.config['MAX_CONTENT_LENGTH'] = config.MAX_CONTENT_LENGTH
app.config['COMPRESS_LEVEL'] = 6
app.config['COMPRESS_MIN_SIZE'] = 512
app.config['COMPRESS_MIMETYPES'] = [
    'text/html',
    'text/css',
    'text/xml',
    'application/json',
    'application/javascript',
    'image/svg+xml',
]
Compress(app)

# Initialize Rate Limiter
app.config['RATELIMIT_STORAGE_URI'] = config.RATELIMIT_STORAGE_URI
limiter.init_app(app)

# Initialize Security Headers (Talisman)
# In development, we allow unsafe-eval and unsafe-inline for Vite HMR and React DevTools
# In production, we use a stricter CSP
def unique_sources(sources):
    return list(dict.fromkeys(sources))


if config.ENV == 'production':
    csp = {
        'default-src': "'self'",
        'script-src': ["'self'"],  # No unsafe-inline or unsafe-eval in production
        'style-src': ["'self'", "'unsafe-inline'"],  # Inline styles still needed for React
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': unique_sources([
            "'self'",
            'https://*.fractalgoals.com',
            'https://*.sentry.io',
            *config.CSP_CONNECT_SRC,
        ]),
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'frame-ancestors': "'none'",
        'base-uri': "'self'",
        'form-action': "'self'"
    }
else:
    # Development CSP - more permissive for dev tools
    csp = {
        'default-src': "'self'",
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  # Needed for Vite/React Dev
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'", 'http://localhost:5173', 'ws://localhost:5173']  # Allow Vite HMR
    }

Talisman(
    app, 
    force_https=config.ENV == 'production',
    content_security_policy=csp,
    content_security_policy_nonce_in=['script-src'] if config.ENV == 'production' else []
)

# Configure logging
handlers = [logging.StreamHandler()]
if config.ENV == 'development':
    try:
        handlers.append(logging.FileHandler(config.get_log_path()))
    except Exception:
        pass # Fallback to stdout if file write fails

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=handlers
)
logger = logging.getLogger(__name__)

# Enable CORS with environment-based origins
CORS(app, resources={
    r"/api/.*": {
        "origins": config.CORS_ORIGINS,
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", config.CSRF_HEADER_NAME],
        "expose_headers": [config.CSRF_HEADER_NAME],
        "supports_credentials": True
    }
})

for write_limited_blueprint in (
    goals_bp,
    sessions_bp,
    activities_bp,
    templates_bp,
    timers_bp,
    programs_bp,
    notes_bp,
    dashboards_bp,
    page_surface_bp,
    analytics_bp,
    logs_api,
):
    limiter.limit(
        "180 per minute",
        methods=["POST", "PUT", "PATCH", "DELETE"],
    )(write_limited_blueprint)

limiter.limit(
    "60 per minute",
    methods=["POST", "PUT", "PATCH", "DELETE"],
)(admin_bp)

# Register blueprints
# app.register_blueprint(api_bp)
app.register_blueprint(activities_bp)
app.register_blueprint(sessions_bp)
app.register_blueprint(goals_bp)
app.register_blueprint(goal_levels_bp)
app.register_blueprint(templates_bp)
app.register_blueprint(timers_bp)
app.register_blueprint(programs_bp)
app.register_blueprint(notes_bp)
app.register_blueprint(dashboards_bp)
app.register_blueprint(page_surface_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(logs_api)
app.register_blueprint(feature_flags_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(public_bp)
app.register_blueprint(pages_bp)
app.register_blueprint(health_bp)
app.register_blueprint(telemetry_bp)
register_error_handlers(app)

# Initialize services (event bus, completion handlers, etc.)
init_services()
logger.info("Services initialized (event bus, completion handlers)")

# Apply pending database migrations automatically for local development
apply_startup_migrations()

# Initialize database engine on startup (creates connection pool)
from models import get_engine, remove_session
get_engine()
logger.info("Database engine initialized with connection pooling")

@app.before_request
def reset_request_scoped_contexts():
    """Prevent request-local thread state from leaking across requests."""
    request._fractal_started_at = time.perf_counter()
    clear_achievement_context()
    clear_live_progress()


@app.teardown_appcontext
def shutdown_session(exception=None):
    """Clean up database session at the end of each request."""
    remove_session()


@app.teardown_request
def clear_request_scoped_contexts(exception=None):
    clear_achievement_context()
    clear_live_progress()


@app.after_request
def add_cache_headers(response):
    started_at = getattr(request, '_fractal_started_at', None)
    if started_at is not None:
        elapsed_ms = (time.perf_counter() - started_at) * 1000
        response.headers['X-Response-Time-Ms'] = f"{elapsed_ms:.1f}"
        if elapsed_ms >= config.SLOW_REQUEST_THRESHOLD_MS:
            logger.warning(
                "Slow request method=%s path=%s status=%s elapsed_ms=%.1f",
                request.method,
                request.path,
                response.status_code,
                elapsed_ms,
            )
    if response.status_code >= 500:
        log_ops_event(
            "http.server_error",
            level="error",
            method=request.method,
            path=request.path,
            status=response.status_code,
        )
    # Favor correctness for authenticated API data over intermediary/browser
    # caching, while preserving explicit public cache policies such as the
    # landing examples snapshot.
    if request.path.startswith('/api/') and 'Cache-Control' not in response.headers:
        response.headers['Cache-Control'] = 'no-store'
    return response



if __name__ == '__main__':
    # Run the Flask development server
    logger.info(f"Starting Fractal Goals Flask Server in {config.ENV} mode...")
    logger.info(f"API endpoints available at: http://{config.HOST}:{config.PORT}/api/")
    logger.info(f"Web interface available at: http://{config.HOST}:{config.PORT}/")
    
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
