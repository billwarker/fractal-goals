"""
Flask Application for Fractal Goals
Main application file that integrates API and page routes.
"""

from flask import Flask
from flask_cors import CORS
from flask_compress import Compress
from flask_compress import Compress
from flask_talisman import Talisman
import logging

from extensions import limiter

from config import config
# from blueprints.api import api_bp # Deprecated
from blueprints.activities_api import activities_bp
from blueprints.sessions_api import sessions_bp
from blueprints.goals_api import goals_bp
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
Compress(app)

# Initialize Rate Limiter
limiter.init_app(app)
# Configure storage URI if backend is not memory
if config.RATELIMIT_STORAGE_URI and config.RATELIMIT_STORAGE_URI != "memory://":
    limiter._storage_uri = config.RATELIMIT_STORAGE_URI

# Initialize Security Headers (Talisman)
# In development, we disable HTTPS enforcement to allow localhost:8001
# CSP is set to flexible defaults for now to prevent breaking React Dev Tools
csp = {
    'default-src': '\'self\'',
    'script-src': ['\'self\'', '\'unsafe-inline\'', '\'unsafe-eval\''], # Needed for Vite/React Dev
    'style-src': ['\'self\'', '\'unsafe-inline\''],
    'img-src': ['\'self\'', 'data:', 'https:'],
    'connect-src': ['\'self\'', 'http://localhost:5173', 'https://*.fractalgoals.com'] # Allow frontend dev server
}

Talisman(
    app, 
    force_https=config.ENV == 'production',
    content_security_policy=csp
)

# Configure logging
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(config.get_log_path()),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Enable CORS with environment-based origins
# Enable CORS with environment-based origins
CORS(app, resources={
    r"/api/.*": {
        "origins": "*",  # Allow all origins in development to avoid port mismatches
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Register blueprints
# app.register_blueprint(api_bp)
app.register_blueprint(activities_bp)
app.register_blueprint(sessions_bp)
app.register_blueprint(goals_bp)
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
        "database_type": "PostgreSQL" if config.is_postgres() else "SQLite",
        "database_url": db_display
    }


if __name__ == '__main__':
    # Run the Flask development server
    logger.info(f"Starting Fractal Goals Flask Server in {config.ENV} mode...")
    logger.info(f"API endpoints available at: http://{config.HOST}:{config.PORT}/api/")
    logger.info(f"Web interface available at: http://{config.HOST}:{config.PORT}/")
    
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
