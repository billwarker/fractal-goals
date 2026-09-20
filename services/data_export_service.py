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
    AgentApproval,
    AgentEmbeddedConversation,
    AgentEmbeddedMessage,
    AgentEmbeddedRun,
    AgentGrant,
    AgentOAuthClient,
    AgentOperation,
    AgentProposal,
    AgentRun,
    AgentTaskBrief,
    AnalyticsDashboard,
    EventLog,
    Goal,
    MetricDefinition,
    Note,
    Program,
    ProgramBlock,
    ProgramDay,
    ProgramDayStatusOverride,
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
            # OAuth bearer credentials and authorization codes are never
            # exported; grants are represented only by consent metadata.
            "ai_connections": self._export_agent_connections(user_id),
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
            "program_day_status_overrides": self._export_program_day_statuses(root_id),
            "notes": self._serialize_all(Note, root_id, serialize_note),
            "analytics_dashboards": self._serialize_all(AnalyticsDashboard, root_id, serialize_analytics_dashboard),
            "event_logs": self._serialize_all(EventLog, root_id, serialize_event_log),
            "ai_agent_history": self._export_agent_history(root_id),
        }

    def _export_agent_connections(self, user_id: str) -> list:
        rows = self.db_session.query(AgentGrant, AgentOAuthClient).join(
            AgentOAuthClient, AgentOAuthClient.id == AgentGrant.client_id,
        ).filter(AgentGrant.user_id == user_id).order_by(AgentGrant.created_at).all()
        return [{
            "client_name": client.client_name,
            "root_ids": list(grant.allowed_roots or []),
            "scopes": sorted((grant.scopes or "").split()),
            "created_at": format_utc(grant.created_at),
            "expires_at": format_utc(grant.expires_at),
            "revoked_at": format_utc(grant.revoked_at),
        } for grant, client in rows]

    def _export_agent_history(self, root_id: str) -> dict:
        tasks = self.db_session.query(AgentTaskBrief).filter_by(root_id=root_id).order_by(
            AgentTaskBrief.created_at,
        ).all()
        proposals = self.db_session.query(AgentProposal).filter_by(root_id=root_id).order_by(
            AgentProposal.revision,
        ).all()
        runs = self.db_session.query(AgentRun).filter_by(root_id=root_id).order_by(
            AgentRun.created_at,
        ).all()
        embedded_conversations = self.db_session.query(AgentEmbeddedConversation).filter_by(
            root_id=root_id,
        ).order_by(AgentEmbeddedConversation.created_at).all()
        return {
            "tasks": [{
                "id": row.id,
                "request_text": row.request_text,
                "context": row.context,
                "timezone": row.timezone,
                "status": row.status,
                "created_at": format_utc(row.created_at),
                "expires_at": format_utc(row.expires_at),
            } for row in tasks],
            "proposals": [{
                "id": row.id,
                "task_id": row.task_id,
                "revision": row.revision,
                "proposal_hash": row.proposal_hash,
                "operations": row.operations,
                "preview": row.preview,
                "status": row.status,
                "created_at": format_utc(row.created_at),
                "expires_at": format_utc(row.expires_at),
                "approvals": [{
                    "decision": approval.decision,
                    "proposal_hash": approval.proposal_hash,
                    "created_at": format_utc(approval.created_at),
                } for approval in self.db_session.query(AgentApproval).filter_by(
                    proposal_id=row.id,
                ).order_by(AgentApproval.created_at).all()],
            } for row in proposals],
            "runs": [{
                "id": run.id,
                "proposal_id": run.proposal_id,
                "status": run.status,
                "trace_id": run.trace_id,
                "created_at": format_utc(run.created_at),
                "started_at": format_utc(run.started_at),
                "finished_at": format_utc(run.finished_at),
                "operations": [{
                    "operation_id": operation.operation_id,
                    "sequence": operation.sequence,
                    "kind": operation.kind,
                    "status": operation.status,
                    "result": operation.result,
                    "error_code": operation.error_code,
                    "error_message": operation.error_message,
                } for operation in self.db_session.query(AgentOperation).filter_by(
                    run_id=run.id,
                ).order_by(AgentOperation.sequence).all()],
            } for run in runs],
            "embedded_conversations": [{
                "id": conversation.id,
                "provider": conversation.provider,
                "model": conversation.model,
                "timezone": conversation.timezone,
                "created_at": format_utc(conversation.created_at),
                "updated_at": format_utc(conversation.updated_at),
                "messages": [{
                    "role": message.role,
                    "content": message.content,
                    "created_at": format_utc(message.created_at),
                } for message in self.db_session.query(AgentEmbeddedMessage).filter_by(
                    conversation_id=conversation.id,
                ).order_by(AgentEmbeddedMessage.created_at).all()],
                "runs": [{
                    "status": run.status,
                    "steps_used": run.steps_used,
                    "step_budget": run.step_budget,
                    "steps_used": run.steps_used,
                    "tokens_used": run.tokens_used,
                    "token_budget": run.token_budget,
                    "proposal_id": run.proposal_id,
                    "error_code": run.error_code,
                    "created_at": format_utc(run.created_at),
                    "finished_at": format_utc(run.finished_at),
                } for run in self.db_session.query(AgentEmbeddedRun).filter_by(
                    conversation_id=conversation.id,
                ).order_by(AgentEmbeddedRun.created_at).all()],
            } for conversation in embedded_conversations],
        }

    def _serialize_all(self, model, root_id: str, serializer) -> list:
        """
        Serialize every row of `model` in this root. An export must fail
        visibly if a row cannot be serialized; silently returning an
        incomplete file would misrepresent the portability result.
        """
        rows = self.db_session.query(model).filter(model.root_id == root_id).all()
        return [serializer(row) for row in rows]

    def _export_program_day_statuses(self, root_id: str) -> list:
        rows = self.db_session.query(ProgramDayStatusOverride).join(Program).filter(
            Program.root_id == root_id
        ).order_by(
            ProgramDayStatusOverride.date.asc(),
            ProgramDayStatusOverride.id.asc(),
        ).all()
        return [{
            "id": row.id,
            "program_id": row.program_id,
            "date": row.date.isoformat(),
            "status": row.status,
            "set_by_user_id": row.set_by_user_id,
            "created_at": format_utc(row.created_at),
            "updated_at": format_utc(row.updated_at),
        } for row in rows]

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
