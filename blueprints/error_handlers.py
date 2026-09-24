"""App-level error handlers shared by the production app and the test app."""
import logging

from flask import jsonify, request
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import HTTPException

from services.ops_log import log_ops_event

logger = logging.getLogger(__name__)


def register_error_handlers(app):
    @app.errorhandler(SQLAlchemyError)
    def handle_database_error(e):
        """Return the standard JSON 500 for database failures routes do not catch.

        The request-scoped session is removed at teardown, which rolls back the
        failed unit of work, so routes need no per-endpoint rollback boilerplate.
        """
        logger.exception("Unhandled database error method=%s path=%s", request.method, request.path)
        return jsonify({'error': 'Internal server error'}), 500

    @app.errorhandler(Exception)
    def handle_unexpected_error(e):
        """Keep API failures JSON and logged; HTTP errors (404, 405, 429...) pass through."""
        if isinstance(e, HTTPException):
            return e
        logger.exception("Unhandled error method=%s path=%s", request.method, request.path)
        return jsonify({'error': 'Internal server error'}), 500

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
