"""
Self-service account data export.

This backs the portability right promised in the Privacy Policy. It reuses the
canonical serializers rather than defining a second serialization of the same
records, so an export stays consistent with what the API returns.

Everything is scoped by owner: roots are resolved from the authenticated user
id, and every other table is filtered by those root ids. No query here accepts
a caller-supplied root or user id.
"""

from datetime import datetime, timezone

from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    AnalyticsDashboard,
    EventLog,
    Goal,
    MetricDefinition,
    Note,
    Program,
    ProgramBlock,
    ProgramDay,
    Session,
    SessionTemplate,
    Target,
    User,
)
from models.product_event import ProductEvent
from services.serializers import (
    format_utc,
    serialize_activity_definition,
    serialize_activity_group,
    serialize_activity_instance,
    serialize_analytics_dashboard,
    serialize_event_log,
    serialize_goal,
    serialize_metric_definition,
    serialize_note,
    serialize_program,
    serialize_program_block,
    serialize_program_day,
    serialize_session,
    serialize_session_template,
    serialize_target,
    serialize_user,
)
from services.service_types import JsonDict, ServiceResult

EXPORT_SCHEMA_VERSION = 1


class DataExportService:
    def __init__(self, db_session):
        self.db_session = db_session

    def build_export(self, user_id: str) -> ServiceResult[JsonDict]:
        user = self.db_session.get(User, user_id)
        if not user:
            return None, "User not found", 404

        root_ids = [
            row[0]
            for row in self.db_session.query(Goal.id)
            .filter(Goal.owner_id == user_id, Goal.parent_id.is_(None))
            .all()
        ]

        export = {
            "schema_version": EXPORT_SCHEMA_VERSION,
            "generated_at": format_utc(datetime.now(timezone.utc)),
            "account": serialize_user(user),
            "fractals": [self._export_root(root_id) for root_id in root_ids],
            # Usage events are the user's own telemetry rows. Included because
            # the Privacy Policy discloses collecting them, so a subject access
            # request should return them.
            "product_events": self._export_product_events(user_id),
        }
        return export, None, 200

    def _export_root(self, root_id: str) -> JsonDict:
        """Serialize one fractal and every record scoped to it."""
        root_goal = self.db_session.get(Goal, root_id)

        return {
            "root_id": root_id,
            # include_children walks the whole subtree, so this is the full
            # goal hierarchy rather than only the root node.
            "goals": serialize_goal(root_goal, include_children=True) if root_goal else None,
            "activity_groups": self._serialize_all(ActivityGroup, root_id, serialize_activity_group),
            "activities": self._serialize_all(ActivityDefinition, root_id, serialize_activity_definition),
            "metric_definitions": self._serialize_all(MetricDefinition, root_id, serialize_metric_definition),
            "activity_instances": self._serialize_all(ActivityInstance, root_id, serialize_activity_instance),
            "sessions": self._serialize_all(Session, root_id, serialize_session),
            "session_templates": self._serialize_all(SessionTemplate, root_id, serialize_session_template),
            "targets": self._serialize_all(Target, root_id, serialize_target),
            "programs": self._serialize_all(Program, root_id, serialize_program),
            "program_blocks": self._serialize_all(ProgramBlock, root_id, serialize_program_block),
            "program_days": self._serialize_all(ProgramDay, root_id, serialize_program_day),
            "notes": self._serialize_all(Note, root_id, serialize_note),
            "analytics_dashboards": self._serialize_all(AnalyticsDashboard, root_id, serialize_analytics_dashboard),
            "event_logs": self._serialize_all(EventLog, root_id, serialize_event_log),
        }

    def _serialize_all(self, model, root_id: str, serializer) -> list:
        """
        Serialize every row of `model` in this root. An export must fail
        visibly if a row cannot be serialized; silently returning an
        incomplete file would misrepresent the portability result.
        """
        rows = self.db_session.query(model).filter(model.root_id == root_id).all()
        return [serializer(row) for row in rows]

    def _export_product_events(self, user_id: str) -> list:
        rows = (
            self.db_session.query(ProductEvent)
            .filter(ProductEvent.user_id == user_id)
            .order_by(ProductEvent.created_at.asc())
            .all()
        )
        return [
            {
                "event_name": row.event_name,
                "path": row.path,
                "root_id": row.root_id,
                "properties": row.properties,
                "client_ts": format_utc(row.client_ts),
                "created_at": format_utc(row.created_at),
            }
            for row in rows
        ]
