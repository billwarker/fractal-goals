"""Canonical domain validation and preview construction for agent proposals."""

from services.activity_service import ActivityService
from services.goal_service import GoalService, sync_goal_targets
from services.note_service import NoteService
from services.goal_type_utils import get_canonical_goal_type
from services.agent_harness_common import AgentHarnessError
from services.agent_operation_versions import operation_restore_payload


class AgentProposalPreviewMixin:
    def _validate_and_preview_operation(self, task, user_id, operation):
        self._root(task.root_id, user_id)
        if operation["type"] == "update_goal":
            before = operation_restore_payload(self.db_session, task.root_id, operation)
            service = GoalService(self.db_session, sync_targets=sync_goal_targets)
            entity, error, status = service.update_fractal_goal(
                task.root_id,
                operation["goal_id"],
                user_id,
                operation["data"],
                commit=False,
                pending_events=[],
            )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            return {
                "operation_id": operation["operation_id"],
                "type": operation["type"],
                "action": "Update goal",
                "id": entity.id,
                "name": entity.name,
                "updated_fields": list(operation["data"].keys()),
                "changes": operation["data"],
                "before": before.get("data", {}),
            }, {"id": entity.id, "name": entity.name, "root_id": task.root_id,
                "href": self._app_href(task.root_id, "goals")}
        if operation["type"] in {"update_activity", "associate_activity_goals"}:
            before = operation_restore_payload(self.db_session, task.root_id, operation)
            service = ActivityService(self.db_session)
            if operation["type"] == "update_activity":
                entity, error, status = service.update_activity_definition(
                    task.root_id,
                    operation["activity_id"],
                    user_id,
                    operation["data"],
                    commit=False,
                    pending_events=[],
                )
                fields = list(operation["data"].keys())
            else:
                from services.activity_association_service import ActivityAssociationService

                entity, error, status = ActivityAssociationService(self.db_session).set_activity_goals(
                    task.root_id,
                    operation["activity_id"],
                    user_id,
                    operation["goal_ids"],
                    commit=False,
                    pending_events=[],
                )
                fields = ["associated_goals"]
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            return {
                "operation_id": operation["operation_id"],
                "type": operation["type"],
                "action": "Update activity" if operation["type"] == "update_activity" else "Change activity goal associations",
                "id": entity.id,
                "name": entity.name,
                "updated_fields": fields,
                "changes": operation.get("data", {"goal_ids": operation.get("goal_ids", [])}),
                "before": before.get("data", {"goal_ids": before.get("goal_ids", [])}),
                "before_goal_names": self._goal_names(
                    task.root_id,
                    before.get("goal_ids") or before.get("data", {}).get("goal_ids") or [],
                ),
                "goal_ids": list(operation.get("goal_ids") or operation.get("data", {}).get("goal_ids") or []),
                "goal_names": self._goal_names(
                    task.root_id,
                    operation.get("goal_ids") or operation.get("data", {}).get("goal_ids") or [],
                ),
            }, {"id": entity.id, "name": entity.name, "root_id": task.root_id,
                "href": self._app_href(task.root_id, "manage-activities")}
        if operation["type"] in {"update_program", "update_block", "update_program_day"}:
            from services.programs import ProgramService

            before = operation_restore_payload(self.db_session, task.root_id, operation)
            try:
                if operation["type"] == "update_program":
                    entity = ProgramService.update_program(
                        self.db_session, task.root_id, operation["program_id"],
                        operation["data"], user_id, commit=False, pending_events=[],
                    )
                    entity_id = operation["program_id"]
                elif operation["type"] == "update_block":
                    entity = ProgramService.update_block(
                        self.db_session, task.root_id, operation["program_id"],
                        operation["block_id"], operation["data"], user_id,
                        commit=False, pending_events=[],
                    )
                    entity_id = operation["block_id"]
                else:
                    entity = ProgramService.update_block_day(
                        self.db_session, task.root_id, operation["program_id"],
                        operation["block_id"], operation["day_id"],
                        operation["data"], user_id, commit=False, pending_events=[],
                    )
                    entity_id = operation["day_id"]
            except ValueError as exc:
                raise AgentHarnessError(str(exc), 400, "validation_failed") from exc
            if entity is None:
                raise AgentHarnessError("Program was not found", 404, "not_found")
            before_data = before.get("data", {})
            preview_relations = {}
            goal_field = {
                "update_program": "selectedGoals",
                "update_block": "goal_ids",
            }.get(operation["type"])
            if goal_field and goal_field in operation["data"]:
                preview_relations = {
                    "before_goal_names": self._goal_names(
                        task.root_id, before_data.get(goal_field) or [],
                    ),
                    "goal_names": self._goal_names(
                        task.root_id, operation["data"].get(goal_field) or [],
                    ),
                }
            if operation["type"] == "update_program_day" and (
                "template_ids" in operation["data"] or "template_configs" in operation["data"]
            ):
                preview_relations = {
                    "before_template_names": self._template_names(
                        task.root_id, before_data.get("template_configs"),
                    ),
                    "template_names": self._template_names(
                        task.root_id,
                        operation["data"].get("template_configs")
                        or operation["data"].get("template_ids"),
                    ),
                }
            return {
                "operation_id": operation["operation_id"],
                "type": operation["type"],
                "action": "Update program structure",
                "id": entity_id,
                "name": entity.get("name"),
                "updated_fields": list(operation["data"].keys()),
                "changes": operation["data"],
                "before": before_data,
                **preview_relations,
            }, {"id": entity_id, "name": entity.get("name"), "root_id": task.root_id,
                "href": self._app_href(task.root_id, "programs", operation["program_id"])}
        if operation["type"] == "create_goal":
            service = GoalService(self.db_session, sync_targets=sync_goal_targets)
            entity, error, status = service.create_fractal_goal(
                task.root_id,
                user_id,
                operation["data"],
                commit=False,
                pending_events=[],
            )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            result = {
                "id": entity.id,
                "name": entity.name,
                "root_id": entity.root_id,
                "href": self._app_href(task.root_id, "goals"),
            }
            return {
                "operation_id": operation["operation_id"],
                "type": operation["type"],
                "action": "Create goal",
                "name": entity.name,
                "goal_type": get_canonical_goal_type(entity),
                "parent_id": entity.parent_id,
                "deadline": entity.deadline.isoformat() if entity.deadline else None,
            }, result
        if operation["type"] == "create_activity":
            service = ActivityService(self.db_session)
            entity, error, status = service.create_activity_definition(
                task.root_id,
                user_id,
                operation["data"],
                commit=False,
                pending_events=[],
            )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            return {
                "operation_id": operation["operation_id"],
                "type": operation["type"],
                "action": "Create activity",
                "name": entity.name,
                "goal_ids": list(operation["data"].get("goal_ids") or []),
                "goal_names": self._goal_names(
                    task.root_id,
                    operation["data"].get("goal_ids") or [],
                ),
            }, {
                "id": entity.id,
                "name": entity.name,
                "root_id": task.root_id,
                "href": self._app_href(task.root_id, "manage-activities"),
            }
        if operation["type"] == "create_note":
            service = NoteService(self.db_session)
            entity, error, status = service.create_note(
                task.root_id,
                user_id,
                operation["data"],
                commit=False,
                pending_events=[],
            )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            result = {
                "id": entity["id"],
                "root_id": task.root_id,
                "href": self._app_href(task.root_id, "notes"),
            }
            return {
                "operation_id": operation["operation_id"],
                "type": operation["type"],
                "action": "Add note",
                "context_type": entity.get("context_type"),
                "context_id": entity.get("context_id"),
                "content": entity.get("content"),
            }, result
        if operation["type"] in {"create_session", "update_session"}:
            from services.session_service import SessionService

            service = SessionService(self.db_session)
            if operation["type"] == "create_session":
                entity, error, status = service.create_session(
                    task.root_id, user_id, operation["data"], commit=False, pending_events=[]
                )
                if error:
                    raise AgentHarnessError(str(error), status, "validation_failed")
                session_id = entity.get("id")
                action = "Create session"
                before = {}
            else:
                before = operation_restore_payload(self.db_session, task.root_id, operation)
                entity, error, status = service.update_session(
                    task.root_id, operation["session_id"], user_id, operation["data"],
                    commit=False, pending_events=[],
                )
                if error:
                    raise AgentHarnessError(str(error), status, "validation_failed")
                session_id = operation["session_id"]
                action = "Update session"
            return {
                "operation_id": operation["operation_id"], "type": operation["type"],
                "action": action, "name": entity.get("name"),
                "changes": operation.get("data", {}), "before": before.get("data", {}),
            }, {"id": session_id, "name": entity.get("name"), "root_id": task.root_id,
                "href": self._app_href(task.root_id, "sessions")}
        if operation["type"] in {"create_metric", "update_metric"}:
            from services.activity_service import ActivityService

            service = ActivityService(self.db_session)
            if operation["type"] == "create_metric":
                entity, error, status = service.create_fractal_metric(
                    task.root_id, user_id, operation["data"], commit=False, pending_events=[]
                )
                before = {}
                action = "Create metric"
            else:
                before = operation_restore_payload(self.db_session, task.root_id, operation)
                entity, error, status = service.update_fractal_metric(
                    task.root_id, operation["metric_id"], user_id, operation["data"],
                    commit=False, pending_events=[],
                )
                action = "Update metric"
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            return {
                "operation_id": operation["operation_id"], "type": operation["type"],
                "action": action, "name": entity.name,
                "changes": operation.get("data", {}), "before": before.get("data", {}),
            }, {"id": entity.id, "name": entity.name, "root_id": task.root_id,
                "href": self._app_href(task.root_id, "metrics")}
        if operation["type"] == "create_template":
            from services.template_service import TemplateService

            entity, error, status = TemplateService(self.db_session).create_template(
                task.root_id, user_id, operation["data"], commit=False, pending_events=[]
            )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            return {
                "operation_id": operation["operation_id"],
                "type": operation["type"],
                "action": "Create session template",
                "name": entity.name,
            }, {
                "id": entity.id,
                "name": entity.name,
                "root_id": task.root_id,
                "href": self._app_href(task.root_id, "manage-session-templates"),
            }
        if operation["type"] == "create_program":
            from services.programs import ProgramService

            entity = ProgramService.create_program(
                self.db_session,
                task.root_id,
                operation["data"],
                user_id,
                commit=False,
                pending_events=[],
            )
            return {
                "operation_id": operation["operation_id"],
                "type": operation["type"],
                "action": "Create program",
                "name": entity.get("name"),
                "start_date": entity.get("start_date"),
                "end_date": entity.get("end_date"),
                "goal_names": self._goal_names(
                    task.root_id,
                    operation["data"].get("selectedGoals") or [],
                ),
            }, {
                "id": entity["id"],
                "name": entity.get("name"),
                "root_id": task.root_id,
                "href": self._app_href(task.root_id, "programs", entity["id"]),
            }
        if operation["type"] == "create_block":
            from services.programs import ProgramService

            entity = ProgramService.create_block(
                self.db_session,
                task.root_id,
                operation["program_id"],
                operation["data"],
                user_id,
                commit=False,
                pending_events=[],
            )
            return {
                "operation_id": operation["operation_id"],
                "type": operation["type"],
                "action": "Create program block",
                "name": entity.get("name"),
                "start_date": entity.get("start_date"),
                "end_date": entity.get("end_date"),
                "goal_names": self._goal_names(
                    task.root_id,
                    operation["data"].get("goal_ids") or [],
                ),
            }, {
                "id": entity["id"],
                "name": entity.get("name"),
                "root_id": task.root_id,
                "href": self._app_href(
                    task.root_id, "programs", operation["program_id"],
                ),
            }
        if operation["type"] == "create_program_day":
            from services.programs import ProgramService

            result = ProgramService.add_block_day(
                self.db_session,
                task.root_id,
                operation["program_id"],
                operation["block_id"],
                operation["data"],
                user_id,
                commit=False,
                pending_events=[],
                create_only=True,
            )
            first_day = (result.get("days") or [{}])[0]
            return {
                "operation_id": operation["operation_id"],
                "type": operation["type"],
                "action": "Create program day",
                "name": first_day.get("name"),
                "date": first_day.get("date"),
                "day_of_week": first_day.get("day_of_week"),
                "templates": [
                    {"id": item["id"], "name": item["name"]}
                    for item in (first_day.get("templates") or [])[:10]
                ],
            }, {
                "id": first_day.get("id"),
                "name": first_day.get("name"),
                "root_id": task.root_id,
                "href": self._app_href(
                    task.root_id, "programs", operation["program_id"],
                ),
            }
        if operation["type"] == "schedule_program_day":
            from services.programs import ProgramService

            try:
                scheduled = ProgramService.schedule_block_day(
                    self.db_session,
                    task.root_id,
                    operation["program_id"],
                    operation["block_id"],
                    operation["day_id"],
                    operation["data"],
                    user_id,
                    commit=False,
                    pending_events=[],
                )
            except ValueError as error:
                raise AgentHarnessError(str(error), 400, "validation_failed") from error
            return {
                "operation_id": operation["operation_id"],
                "type": operation["type"],
                "action": "Schedule program day",
                "name": scheduled.get("name"),
                "date": scheduled.get("date"),
                "program_day_id": operation["day_id"],
            }, {
                "id": scheduled.get("id"),
                "date": scheduled.get("date"),
                "program_day_id": operation["day_id"],
                "name": scheduled.get("name"),
                "root_id": task.root_id,
                "href": self._app_href(
                    task.root_id, "programs", operation["program_id"],
                ),
            }
        raise AgentHarnessError("Unsupported operation type", 400, "unsupported_operation")
