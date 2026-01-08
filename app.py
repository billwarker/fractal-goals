"""
Flask Application for Fractal Goals
Main application file that integrates API and page routes.
"""

from flask import Flask
from flask_cors import CORS
import logging

from config import config
# from blueprints.api import api_bp # Deprecated
from blueprints.activities_api import activities_bp
from blueprints.sessions_api import sessions_bp
from blueprints.goals_api import goals_bp
from blueprints.templates_api import templates_bp
from blueprints.timers_api import timers_bp
from blueprints.programs_api import programs_bp
from blueprints.notes_api import notes_bp
from blueprints.pages import pages_bp

# Print configuration on startup
config.print_config()

# Create Flask app
app = Flask(__name__)
app.config['ENV'] = config.ENV
app.config['DEBUG'] = config.DEBUG

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
CORS(app, resources={
    r"/api/*": {
        "origins": config.CORS_ORIGINS,
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE"],
        "allow_headers": ["Content-Type"]
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
app.register_blueprint(pages_bp)


@app.route('/health')
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "message": "Fractal Goals Flask Server",
        "environment": config.ENV,
        "database": config.DATABASE_PATH
    }


if __name__ == '__main__':
    # Run the Flask development server
    logger.info(f"Starting Fractal Goals Flask Server in {config.ENV} mode...")
    logger.info(f"API endpoints available at: http://{config.HOST}:{config.PORT}/api/")
    logger.info(f"Web interface available at: http://{config.HOST}:{config.PORT}/")
    
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
