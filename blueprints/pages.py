"""
Flask Pages Blueprint
Serves different page routes for the application.
"""

from flask import Blueprint, send_from_directory, render_template_string, request
import os
import re

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
    <meta name="viewport" content="{{ viewport_content }}" />
    <title>Fractal Goals</title>
    <script type="module" crossorigin src="/assets/index.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
"""


def get_viewport_content(pathname):
    """Allow zoom only on the flow tree route."""
    if re.match(r'^/[^/]+/goals/?$', pathname or ''):
        return 'width=device-width, initial-scale=1.0, viewport-fit=cover'

    return 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'


def apply_viewport_content(template, pathname):
    viewport_content = get_viewport_content(pathname)
    viewport_tag = f'<meta name="viewport" content="{viewport_content}" />'

    if 'name="viewport"' in template:
        return re.sub(r'<meta\s+name="viewport"[^>]*>', viewport_tag, template, count=1)

    return template.replace('</head>', f'    {viewport_tag}\n  </head>', 1)


def get_react_template(pathname=''):
    """Read the React index.html from the build directory."""
    index_path = os.path.join(CLIENT_BUILD_DIR, 'index.html')
    if os.path.exists(index_path):
        with open(index_path, 'r') as f:
            return apply_viewport_content(f.read(), pathname)
    return REACT_APP_TEMPLATE


def render_react_app():
    """Render the React app shell with route-aware viewport settings."""
    return render_template_string(
        get_react_template(request.path),
        viewport_content=get_viewport_content(request.path),
    )


@pages_bp.route('/')
@pages_bp.route('/selection')
def selection_page():
    """Fractal Goal Selection Page (home)."""
    return render_react_app()


# Fractal-scoped routes
@pages_bp.route('/<root_id>/fractal-goals')
def fractal_goals_page(root_id):
    """Goals View - Flow Tree View in ReactJS."""
    return render_react_app()


@pages_bp.route('/<root_id>/sessions')
def sessions_page(root_id):
    """Sessions View - Display information about practice sessions."""
    return render_react_app()


@pages_bp.route('/<root_id>/session/<session_id>')
def session_detail_page(root_id, session_id):
    """Session Detail - Fill in details for a specific practice session."""
    return render_react_app()


@pages_bp.route('/<root_id>/log')
def log_page(root_id):
    """Log Session - Add practice sessions to the database."""
    return render_react_app()


@pages_bp.route('/<root_id>/create-practice-session')
def create_practice_session(root_id):
    """Create Practice Session - Page for creating new practice sessions."""
    return render_react_app()


@pages_bp.route('/<root_id>/programs')
def programs_page(root_id):
    """Programs - Future home for programming-related features."""
    return render_react_app()


@pages_bp.route('/<root_id>/create-session-template')
def create_session_template(root_id):
    """Create Session Template - Manage session templates."""
    return render_react_app()


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
