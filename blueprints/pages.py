"""
Flask Pages Blueprint
Serves different page routes for the application.
"""

from flask import Blueprint, send_from_directory, render_template_string
import os

# Create blueprint
pages_bp = Blueprint('pages', __name__)

# Get the client build directory
CLIENT_BUILD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'client', 'dist')


# Simple HTML template that loads the React app
# This template will be used for all routes to enable client-side routing
REACT_APP_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fractal Goals</title>
    <script type="module" crossorigin src="/assets/index.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
"""


@pages_bp.route('/')
@pages_bp.route('/selection')
def selection_page():
    """Fractal Goal Selection Page (home)."""
    return render_template_string(REACT_APP_TEMPLATE)


# Fractal-scoped routes
@pages_bp.route('/<root_id>/fractal-goals')
def fractal_goals_page(root_id):
    """Goals View - Flow Tree View in ReactJS."""
    return render_template_string(REACT_APP_TEMPLATE)


@pages_bp.route('/<root_id>/sessions')
def sessions_page(root_id):
    """Sessions View - Display information about practice sessions."""
    return render_template_string(REACT_APP_TEMPLATE)


@pages_bp.route('/<root_id>/session/<session_id>')
def session_detail_page(root_id, session_id):
    """Session Detail - Fill in details for a specific practice session."""
    return render_template_string(REACT_APP_TEMPLATE)


@pages_bp.route('/<root_id>/log')
def log_page(root_id):
    """Log Session - Add practice sessions to the database."""
    return render_template_string(REACT_APP_TEMPLATE)


@pages_bp.route('/<root_id>/create-practice-session')
def create_practice_session(root_id):
    """Create Practice Session - Page for creating new practice sessions."""
    return render_template_string(REACT_APP_TEMPLATE)


@pages_bp.route('/<root_id>/create-session-template')
def create_session_template(root_id):
    """Programming - Placeholder for future programming features."""
    return render_template_string(REACT_APP_TEMPLATE)


# Serve static files from the React build
@pages_bp.route('/assets/<path:path>')
def serve_assets(path):
    """Serve static assets from the React build."""
    assets_dir = os.path.join(CLIENT_BUILD_DIR, 'assets')
    return send_from_directory(assets_dir, path)


@pages_bp.route('/vite.svg')
def serve_vite_svg():
    """Serve the vite.svg icon."""
    return send_from_directory(CLIENT_BUILD_DIR, 'vite.svg')
