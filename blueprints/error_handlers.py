"""App-level error handlers shared by the production app and the test app."""
from flask import jsonify, request

from services.ops_log import log_ops_event


def register_error_handlers(app):
    @app.errorhandler(429)
    def handle_rate_limit_exceeded(e):
        """Return JSON for rate-limit hits and make them visible in the logs."""
        log_ops_event(
            "http.rate_limited",
            level="warning",
            method=request.method,
            path=request.path,
            remote_addr=request.remote_addr,
            limit=getattr(e, 'description', None),
        )
        response = jsonify({
            'error': 'Too many requests. Please slow down and try again.',
            'code': 'rate_limited',
        })
        response.status_code = 429
        retry_after = getattr(e, 'retry_after', None)
        if retry_after:
            response.headers['Retry-After'] = str(retry_after)
        return response
