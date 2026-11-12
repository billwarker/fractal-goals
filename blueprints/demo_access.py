"""Which routes a demo token may reach (see services/demo_access_service.py).

Fail closed: a demo request is served only when its Flask endpoint is listed
here, it reads (no writes, ever), and it targets a published example root.
tests/integration/test_demo_access.py walks the whole URL map to keep this
honest as routes are added.
"""
from flask import g, jsonify, request

from services.demo_access_service import DemoAccessService

# Reads scoped to /<root_id>/: the pages a visitor tours.
DEMO_ROOT_READ_ENDPOINTS = frozenset({
    'activities.activity_tag_catalog_impact',
    'activities.get_activities',
    'activities.get_activity_goals',
    'activities.get_activity_groups',
    'activities.get_activity_instance_progress',
    'activities.get_activity_progress_series',
    'activities.get_activity_progress_timeline',
    'activities.get_fractal_metrics',
    'activities.get_goal_activities',
    'activities.goal_activity_groups.get_goal_activity_groups',
    'activities.goal_activity_groups.get_goal_instance_linked_activities',
    'activities.instance_goals.get_instance_goals',
    'activities.list_activity_tag_catalog',
    'calendar_periods.list_calendar_periods',
    'circuits.get_circuit',
    'circuits.get_circuit_run',
    'circuits.list_circuit_runs',
    'circuits.list_circuits',
    'dashboards_api.get_dashboards',
    'goals.get_active_goals_for_selection',
    'goals.get_activity_analytics_evidence',
    'goals.get_eligible_move_parents',
    'goals.get_fractal_goal',
    'goals.get_fractal_goals',
    'goals.get_goal_activity_heatmap',
    'goals.get_goal_analytics',
    'goals.get_goal_condition_evidence',
    'goals.get_goal_condition_progress',
    'goals.get_goal_sequence',
    'goals.get_goal_timeline',
    'goals.get_session_goals_view',
    'goals.get_view_goals',
    'goals.list_activity_goal_conditions',
    'goals.list_goal_charts',
    'note_filters.list_note_filters',
    'notes.get_activity_definition_notes',
    'notes.get_activity_history',
    'notes.get_activity_instance_notes',
    'notes.get_all_notes',
    'notes.get_carried_notes',
    'notes.get_goal_notes',
    'notes.get_notes_heatmap',
    'notes.get_owned_note_count',
    'notes.get_previous_session_notes',
    'notes.get_session_notes',
    'page_surface_api.get_page_surfaces',
    'program_session_plans.get_day_plans',
    'program_session_plans.list_plan_candidates',
    'program_session_plans.list_plan_occurrences',
    'programs.get_active_program_days',
    'programs.get_program',
    'programs.get_program_calendar_feed',
    'programs.get_program_calendar_summaries',
    'programs.get_program_day_read_model',
    'programs.get_program_metrics',
    'programs.get_program_metrics_comparison',
    'programs.get_program_session_count',
    'programs.get_programs',
    'sessions.get_active_session_endpoint',
    'sessions.get_activity_instantiation_summary',
    'sessions.get_fractal_sessions',
    'sessions.get_flowtree_session_metrics',
    'sessions.get_recent_evidence_goal_ids',
    'sessions.get_session_activities',
    'sessions.get_session_analytics_summary',
    'sessions.get_session_endpoint',
    'sessions.get_session_heatmap',
    'sessions.get_session_progress_summary',
    'templates.get_session_template',
    'templates.get_session_templates',
    'timers.activity_instances',
})

# App-shell reads with no root in the path. They run as the owner of the
# `root_id` query parameter when given, else of the first demo root.
DEMO_SHELL_READ_ENDPOINTS = frozenset({
    'feature_flags.get_feature_flags',
    'goal_levels.get_goal_levels',
    'goals.get_all_fractals',
})

DEMO_READ_ENDPOINTS = DEMO_ROOT_READ_ENDPOINTS | DEMO_SHELL_READ_ENDPOINTS

_DEMO_READ_ONLY_MESSAGE = 'The demo is read-only'


def _deny(message, status):
    return None, (jsonify({'error': message, 'code': 'demo_read_only'}), status)


def authorize_demo_request(db_session, token, view_kwargs):
    """Return (owner, None) to serve the request as the root's owner, or (None, response)."""
    service = DemoAccessService(db_session)
    roots, error, status = service.resolve_demo_roots(token)
    if error or roots is None:
        return None, (jsonify({'error': error}), status)
    if request.method not in ('GET', 'HEAD'):
        return _deny(_DEMO_READ_ONLY_MESSAGE, 403)
    if request.endpoint not in DEMO_READ_ENDPOINTS:
        return _deny('Not available in the demo', 403)
    if request.args.get('admin_user_id') or request.args.get('admin_mode'):
        return _deny('Not available in the demo', 403)

    root_id = view_kwargs.get('root_id')
    if request.endpoint in DEMO_ROOT_READ_ENDPOINTS and not root_id:
        return _deny('Not available in the demo', 403)
    if not root_id and request.endpoint in DEMO_SHELL_READ_ENDPOINTS:
        root_id = request.args.get('root_id') or (roots[0] if roots else None)
    if not root_id or root_id not in roots:
        return None, (jsonify({'error': 'Fractal not found'}), 404)

    owner = service.load_root_owner(root_id)
    if owner is None:
        return None, (jsonify({'error': 'Fractal not found'}), 404)
    g.access_mode = 'demo'
    g.demo_root_ids = roots
    return owner, None
