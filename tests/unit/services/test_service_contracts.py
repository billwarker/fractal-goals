import inspect

from services.activity_service import ActivityService
from services.dashboard_service import DashboardService
from services.goal_service import GoalService
from services.note_service import NoteService
from services.session_service import SessionService


def test_core_service_public_methods_have_return_contract_annotations():
    service_methods = {
        ActivityService: [
            "list_activity_groups",
            "create_activity_group",
            "update_activity_group",
            "delete_activity_group",
            "reorder_activity_groups",
            "set_activity_goals",
            "remove_activity_goal",
            "set_goal_associations_batch",
            "get_goal_activities",
            "get_goal_activity_groups",
            "link_goal_activity_group",
            "unlink_goal_activity_group",
            "create_activity",
            "update_activity",
            "delete_activity",
        ],
        GoalService: [
            "list_fractals",
            "create_fractal",
            "delete_fractal",
            "get_fractal_tree",
            "get_active_goals_for_selection",
            "create_global_goal",
            "create_fractal_goal",
            "get_fractal_goal",
            "update_fractal_goal",
            "delete_fractal_goal",
            "add_goal_target",
            "remove_goal_target",
            "update_goal_completion",
            "evaluate_goal_targets",
            "copy_goal",
            "toggle_pause",
            "toggle_freeze",
            "move_goal",
            "convert_goal_level",
        ],
        SessionService: [
            "get_fractal_sessions",
            "get_session_details",
            "create_session",
            "update_session",
            "delete_session",
        ],
        NoteService: [
            "get_session_notes",
            "get_activity_instance_notes",
            "get_previous_session_notes",
            "get_activity_definition_notes",
            "get_activity_history",
            "create_note",
            "update_note",
            "delete_note",
        ],
        DashboardService: [
            "list_dashboards",
            "create_dashboard",
            "update_dashboard",
            "delete_dashboard",
        ],
    }

    for service_cls, method_names in service_methods.items():
        for method_name in method_names:
            signature = inspect.signature(getattr(service_cls, method_name))
            assert signature.return_annotation is not inspect.Signature.empty, (
                f"{service_cls.__name__}.{method_name} is missing a return annotation"
            )
