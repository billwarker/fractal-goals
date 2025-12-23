"""
Flask Application for Fractal Goals
Main application file that integrates API and page routes.
"""

from flask import Flask
from flask_cors import CORS
import os

from blueprints.api import api_bp
from blueprints.pages import pages_bp

# Create Flask app
app = Flask(__name__)

# Enable CORS for development
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE"],
        "allow_headers": ["Content-Type"]
    }
})

# Register blueprints
app.register_blueprint(api_bp)
app.register_blueprint(pages_bp)


@app.route('/health')
def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "message": "Fractal Goals Flask Server"}


if __name__ == '__main__':
    # Run the Flask development server
    print("Starting Fractal Goals Flask Server...")
    print("API endpoints available at: http://localhost:8001/api/")
    print("Web interface available at: http://localhost:8001/")
    app.run(host='0.0.0.0', port=8001, debug=True)
