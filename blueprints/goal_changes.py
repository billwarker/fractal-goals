"""Tell the client which goals a write completed or reverted by their conditions, so it can say so."""

from flask import current_app, request

from services.completion_handlers import get_recent_achievements


def attach_goal_changes(response):
    """Add ``goal_changes: {completed, uncompleted}`` to a successful JSON write that changed any goal.

    Runs as an ``after_request`` hook, before teardown clears the request's achievements. A stored
    idempotent replay doesn't carry them again, so a retried change never announces twice.
    """
    if request.method in ('GET', 'HEAD', 'OPTIONS') or not response.is_json or response.status_code >= 400:
        return response
    changes = get_recent_achievements()
    if not changes['completed_goals'] and not changes['uncompleted_goals']:
        return response
    body = response.get_json(silent=True)
    if isinstance(body, dict):
        body['goal_changes'] = {
            'completed': changes['completed_goals'],
            'uncompleted': changes['uncompleted_goals'],
        }
        response.set_data(current_app.json.dumps(body))
    return response


def register_goal_changes(app):
    app.after_request(attach_goal_changes)
