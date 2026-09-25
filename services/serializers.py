"""Canonical API serializers.

Implementations live in domain modules (``services._serialize_*``); this facade is the
stable import path for every caller.
"""

from services._serialize_common import (
    format_utc,
    format_utc_precise,
    calculate_smart_status,
)
from services._serialize_activities import (
    serialize_target,
    serialize_metric_value,
    serialize_activity_set,
    serialize_fractal_metric,
    serialize_activity_instance,
    serialize_activity_instance_for_analytics,
    serialize_circuit_definition,
    serialize_work_interval,
    serialize_circuit_run,
    serialize_activity_group,
    serialize_activity_definition,
    serialize_metric_definition,
    serialize_split_definition,
)
from services._serialize_goals import (
    serialize_goal,
)
from services._serialize_sessions import (
    serialize_session_for_analytics,
    serialize_session,
    serialize_program_day_session_light,
    serialize_session_template,
)
from services._serialize_programs import (
    serialize_program,
    serialize_program_block,
    serialize_program_day,
)
from services._serialize_notes_misc import (
    serialize_user,
    serialize_note,
    derive_note_type,
    note_type_label,
    serialize_note_display,
    serialize_analytics_dashboard,
    serialize_page_surface_layout,
    serialize_event_log,
)

__all__ = [
    "calculate_smart_status",
    "derive_note_type",
    "format_utc",
    "format_utc_precise",
    "note_type_label",
    "serialize_activity_definition",
    "serialize_activity_group",
    "serialize_activity_instance",
    "serialize_activity_instance_for_analytics",
    "serialize_activity_set",
    "serialize_analytics_dashboard",
    "serialize_circuit_definition",
    "serialize_circuit_run",
    "serialize_event_log",
    "serialize_fractal_metric",
    "serialize_goal",
    "serialize_metric_definition",
    "serialize_metric_value",
    "serialize_note",
    "serialize_note_display",
    "serialize_page_surface_layout",
    "serialize_program",
    "serialize_program_block",
    "serialize_program_day",
    "serialize_program_day_session_light",
    "serialize_session",
    "serialize_session_for_analytics",
    "serialize_session_template",
    "serialize_split_definition",
    "serialize_target",
    "serialize_user",
    "serialize_work_interval",
]
