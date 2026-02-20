"""
Flask Application for Fractal Goals
Main application file that integrates API and page routes.
"""

from flask import Flask, request
from flask_cors import CORS
from flask_compress import Compress
from flask_talisman import Talisman
import logging

from extensions import limiter
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
import os

# Initialize Sentry if DSN is present
if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        integrations=[FlaskIntegration()],
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,  # Enable profiling
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
from blueprints.annotations_api import annotations_bp
from blueprints.logs_api import logs_api
from blueprints.auth_api import auth_bp
from blueprints.pages import pages_bp
from services import init_services

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
limiter.init_app(app)
# Configure storage URI if backend is not memory
if config.RATELIMIT_STORAGE_URI and config.RATELIMIT_STORAGE_URI != "memory://":
    limiter._storage_uri = config.RATELIMIT_STORAGE_URI

# Initialize Security Headers (Talisman)
# In development, we allow unsafe-eval and unsafe-inline for Vite HMR and React DevTools
# In production, we use a stricter CSP
if config.ENV == 'production':
    csp = {
        'default-src': "'self'",
        'script-src': ["'self'"],  # No unsafe-inline or unsafe-eval in production
        'style-src': ["'self'", "'unsafe-inline'"],  # Inline styles still needed for React
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'", 'https://*.fractalgoals.com', 'https://*.sentry.io'],
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
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

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
app.register_blueprint(annotations_bp)
app.register_blueprint(logs_api)
app.register_blueprint(auth_bp)
app.register_blueprint(pages_bp)

# Initialize services (event bus, completion handlers, etc.)
init_services()
logger.info("Services initialized (event bus, completion handlers)")

# Initialize database engine on startup (creates connection pool)
from models import get_engine, remove_session
get_engine()
logger.info("Database engine initialized with connection pooling")

@app.teardown_appcontext
def shutdown_session(exception=None):
    """Clean up database session at the end of each request."""
    remove_session()


@app.after_request
def add_cache_headers(response):
    # Favor correctness for authenticated API data over intermediary/browser caching.
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response



@app.route('/health')
def health_check():
    """Health check endpoint."""
    db_url = config.get_database_url()
    # Mask password
    if '@' in db_url:
        parts = db_url.split('@')
        db_display = f"{parts[0].rsplit(':', 1)[0]}:***@{parts[1]}"
    else:
        db_display = db_url
        
    return {
        "status": "healthy",
        "message": "Fractal Goals Flask Server",
        "environment": config.ENV,
        "database_type": "PostgreSQL",
        "database_url": db_display
    }


if __name__ == '__main__':
    # Run the Flask development server
    logger.info(f"Starting Fractal Goals Flask Server in {config.ENV} mode...")
    logger.info(f"API endpoints available at: http://{config.HOST}:{config.PORT}/api/")
    logger.info(f"Web interface available at: http://{config.HOST}:{config.PORT}/")
    
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
