"""Runs operations for the delegated AI harness."""

import logging
import datetime as dt
from sqlalchemy import or_
from sqlalchemy.orm.exc import StaleDataError
from config import config
from models import AgentApproval, AgentChangeCursor, AgentOperation, AgentOutboxEvent, AgentProposal, AgentRun, AgentTaskBrief, EventLog, Goal, utc_now
from services.activity_service import ActivityService
from services.goal_service import GoalService, sync_goal_targets
from services.note_service import NoteService
from services.goal_type_utils import get_canonical_goal_type

from services.agent_harness_common import AgentHarnessError, _aware, _digest
from services.agent_operation_versions import operation_restore_payload, operation_state_hash
from services.agent_operation_registry import OPERATION_REGISTRY

logger = logging.getLogger(__name__)


def _enabled_run_origins(agent_flags):
    if not agent_flags.get("ai_agent_writes"):
        return set()
    origins = {"first_party"}
    if agent_flags.get("ai_agent_connectors"):
        origins.add("connector")
    if config.AGENT_EMBEDDED_PRIVACY_APPROVED and agent_flags.get("ai_agent_embedded"):
        if agent_flags.get("ai_agent_embedded_openai"):
            origins.add("embedded_openai")
        if agent_flags.get("ai_agent_embedded_anthropic"):
            origins.add("embedded_anthropic")
    return origins


class AgentRunsMixin:
    def _mark_unstarted_operations(
        self, run_id, worker_id, fencing_token, stop_sequence, *, cancelled,
    ):
        run = self.db_session.query(AgentRun).filter_by(
            id=run_id,
            lease_owner=worker_id,
            fencing_token=fencing_token,
            status="running",
        ).with_for_update().first()
        if not run:
            self.db_session.rollback()
            return
        query = self.db_session.query(AgentOperation).filter(
            AgentOperation.run_id == run_id,
            AgentOperation.status == "queued",
        )
        if cancelled:
            query = query.filter(AgentOperation.sequence >= stop_sequence)
        else:
            query = query.filter(AgentOperation.sequence > stop_sequence)
        for operation in query.with_for_update().all():
            operation.status = "cancelled" if cancelled else "skipped"
            operation.error_code = "cancelled" if cancelled else "run_stopped"
            operation.error_message = (
                "The run was cancelled before this operation started."
                if cancelled else "The run stopped after an earlier operation failed."
            )
            operation.finished_at = utc_now()
        self.db_session.commit()
    def _finish_run(self, run_id, worker_id, fencing_token, succeeded, failed, cancelled):
        run = self.db_session.query(AgentRun).filter_by(
            id=run_id,
            lease_owner=worker_id,
            fencing_token=fencing_token,
        ).with_for_update().first()
        if not run:
            self.db_session.rollback()
            return
        operation_states = self.db_session.query(AgentOperation.status).filter_by(
            run_id=run.id,
        ).all()
        recorded_successes = sum(status == "succeeded" for (status,) in operation_states)
        recorded_failures = any(status == "failed" for (status,) in operation_states)
        did_succeed = max(succeeded, recorded_successes)
        did_fail = failed or recorded_failures
        all_operations_succeeded = bool(operation_states) and did_succeed == len(operation_states)
        was_cancelled = (cancelled or run.cancel_requested_at is not None) and not all_operations_succeeded
        run.status = (
            "partially_succeeded" if was_cancelled and did_succeed
            else "cancelled" if was_cancelled
            else "partially_succeeded" if did_fail and did_succeed
            else "failed" if did_fail
            else "succeeded" if all_operations_succeeded
            else "failed"
        )
        run.finished_at = utc_now()
        run.lease_owner = None
        run.lease_expires_at = None
        task = self.db_session.query(AgentTaskBrief).join(
            AgentProposal,
            AgentProposal.task_id == AgentTaskBrief.id,
        ).filter(AgentProposal.id == run.proposal_id).first()
        if task:
            task.status = run.status
        self.db_session.commit()
    def _renew_run_lease(self, run_id, worker_id, fencing_token):
        """Extend a worker lease before each operation under the fencing token."""
        run = self.db_session.query(AgentRun).filter_by(
            id=run_id,
            lease_owner=worker_id,
            fencing_token=fencing_token,
            status="running",
        ).with_for_update().first()
        if not run or _aware(run.lease_expires_at) <= utc_now():
            self.db_session.rollback()
            return None
        run.lease_expires_at = utc_now() + dt.timedelta(
            seconds=config.AGENT_RUN_LEASE_SECONDS
        )
        self.db_session.commit()
        return run
    def get_run_for_worker(self, run_id):
        run = self.db_session.query(AgentRun).filter_by(id=run_id).first()
        return self.serialize_run(run, include_operations=True) if run else None
    def _record_operation_failure(self, run_id, operation_id, worker_id, fencing_token, code, message):
        run = self.db_session.query(AgentRun).filter_by(
            id=run_id,
            lease_owner=worker_id,
            fencing_token=fencing_token,
        ).with_for_update().first()
        operation = self.db_session.query(AgentOperation).filter_by(
            run_id=run_id,
            operation_id=operation_id,
        ).with_for_update().first()
        if not run or not operation:
            self.db_session.rollback()
            return False
        if operation.status == "succeeded":
            self.db_session.rollback()
            return True
        operation.status = "failed"
        operation.error_code = code
        operation.error_message = message[:500]
        operation.finished_at = utc_now()
        self.db_session.commit()
        return False
    def _execute_operation(self, run, operation, worker_id, fencing_token):
        operation = self.db_session.query(AgentOperation).filter_by(
            run_id=run.id,
            operation_id=operation.operation_id,
        ).with_for_update().first()
        if operation.status == "succeeded":
            return operation.result
        if operation.input_hash != _digest(operation.input_data):
            raise AgentHarnessError("Operation payload integrity check failed", 409, "input_changed")
        locked_run = self.db_session.query(AgentRun).filter_by(
            id=run.id,
            lease_owner=worker_id,
            fencing_token=fencing_token,
            status="running",
        ).with_for_update().first()
        if (
            not locked_run
            or _aware(locked_run.lease_expires_at) <= utc_now()
        ):
            raise AgentHarnessError("Execution lease was lost", 409, "lease_lost")
        approved_proposal = self.db_session.query(AgentProposal).filter(
            AgentProposal.id == locked_run.proposal_id,
            AgentProposal.user_id == locked_run.user_id,
            AgentProposal.root_id == locked_run.root_id,
            AgentProposal.status == "approved",
            AgentProposal.expires_at > utc_now(),
        ).with_for_update().first()
        approval = self.db_session.query(AgentApproval).filter(
            AgentApproval.proposal_id == locked_run.proposal_id,
            AgentApproval.user_id == locked_run.user_id,
            AgentApproval.root_id == locked_run.root_id,
            AgentApproval.proposal_hash == (
                approved_proposal.proposal_hash if approved_proposal else None
            ),
            AgentApproval.decision == "approve",
        ).first()
        if (
            not approved_proposal
            or _digest(approved_proposal.operations) != approved_proposal.proposal_hash
            or not approval
        ):
            raise AgentHarnessError("Current user approval could not be verified", 403, "approval_required")
        grant = None
        if locked_run.grant_id:
            grant = self._grant(locked_run.grant_id, locked_run.user_id, locked_run.root_id)
        operation_metadata = OPERATION_REGISTRY.get(operation.kind)
        required_scope = operation_metadata["scope"] if operation_metadata else None
        if grant and required_scope not in set((grant.scopes or "").split()):
            raise AgentHarnessError("The AI connection no longer grants this write", 403, "insufficient_scope")
        operation.status = "running"
        operation.started_at = operation.started_at or utc_now()
        pending_events = []
        prior_operations = self.db_session.query(AgentOperation).filter(
            AgentOperation.run_id == locked_run.id,
            AgentOperation.sequence < operation.sequence,
            AgentOperation.status == "succeeded",
        ).order_by(AgentOperation.sequence).all()
        references = {
            row.operation_id: row.result.get("id")
            for row in prior_operations
            if isinstance(row.result, dict) and row.result.get("id")
        }
        input_data = self._resolve_references(operation.input_data, references)

        expected_state_hash = input_data.get("_expected_state_hash")
        if expected_state_hash and expected_state_hash != operation_state_hash(
            self.db_session, locked_run.root_id, input_data,
        ):
            raise AgentHarnessError(
                "The reviewed record changed after preview; create and approve a new proposal",
                409,
                "stale_context",
            )
        if expected_state_hash:
            locked_state_hash = operation_state_hash(
                self.db_session,
                locked_run.root_id,
                input_data,
                for_update=True,
            )
            if locked_state_hash != expected_state_hash:
                raise AgentHarnessError(
                    "The reviewed record changed while execution was starting; create and approve a new proposal",
                    409,
                    "stale_context",
                )
        if operation.kind == "schedule_program_day":
            expected_source_hash = input_data.get("expected_source_hash")
            if expected_source_hash and expected_source_hash != self._program_day_state_hash(
                locked_run.root_id,
                input_data["program_id"],
                input_data["block_id"],
                input_data["day_id"],
                operation=input_data,
                for_update=True,
            ):
                raise AgentHarnessError(
                    "The program day changed after review; create and approve a new proposal",
                    409,
                    "stale_context",
                )
        inverse = operation_restore_payload(
            self.db_session, locked_run.root_id, input_data,
        )

        if operation.kind == "update_goal":
            service = GoalService(self.db_session, sync_targets=sync_goal_targets)
            entity, error, status = service.update_fractal_goal(
                locked_run.root_id,
                input_data["goal_id"],
                locked_run.user_id,
                input_data["data"],
                commit=False,
                pending_events=pending_events,
            )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            result = {
                "id": entity.id,
                "name": entity.name,
                "root_id": entity.root_id,
                "href": self._app_href(locked_run.root_id, "goals"),
            }
        elif operation.kind in {"update_activity", "associate_activity_goals"}:
            service = ActivityService(self.db_session)
            if operation.kind == "update_activity":
                entity, error, status = service.update_activity_definition(
                    locked_run.root_id,
                    input_data["activity_id"],
                    locked_run.user_id,
                    input_data["data"],
                    commit=False,
                    pending_events=pending_events,
                )
            else:
                from services.activity_association_service import ActivityAssociationService

                entity, error, status = ActivityAssociationService(self.db_session).set_activity_goals(
                    locked_run.root_id,
                    input_data["activity_id"],
                    locked_run.user_id,
                    input_data["goal_ids"],
                    commit=False,
                    pending_events=pending_events,
                )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            result = {
                "id": entity.id,
                "name": entity.name,
                "root_id": locked_run.root_id,
                "goal_ids": list(input_data.get("goal_ids") or input_data.get("data", {}).get("goal_ids") or []),
                "href": self._app_href(locked_run.root_id, "manage-activities"),
            }
        elif operation.kind in {"update_program", "update_block", "update_program_day"}:
            from services.programs import ProgramService

            try:
                if operation.kind == "update_program":
                    entity = ProgramService.update_program(
                        self.db_session, locked_run.root_id, input_data["program_id"],
                        input_data["data"], locked_run.user_id,
                        commit=False, pending_events=pending_events,
                    )
                    entity_id = input_data["program_id"]
                elif operation.kind == "update_block":
                    entity = ProgramService.update_block(
                        self.db_session, locked_run.root_id, input_data["program_id"],
                        input_data["block_id"], input_data["data"], locked_run.user_id,
                        commit=False, pending_events=pending_events,
                    )
                    entity_id = input_data["block_id"]
                else:
                    entity = ProgramService.update_block_day(
                        self.db_session, locked_run.root_id, input_data["program_id"],
                        input_data["block_id"], input_data["day_id"], input_data["data"],
                        locked_run.user_id, commit=False, pending_events=pending_events,
                    )
                    entity_id = input_data["day_id"]
            except ValueError as exc:
                raise AgentHarnessError(str(exc), 400, "validation_failed") from exc
            if entity is None:
                raise AgentHarnessError("Program was not found", 404, "not_found")
            result = {
                "id": entity_id,
                "name": entity.get("name"),
                "root_id": locked_run.root_id,
                "href": self._app_href(locked_run.root_id, "programs", input_data["program_id"]),
            }
        elif operation.kind == "create_goal":
            service = GoalService(self.db_session, sync_targets=sync_goal_targets)
            entity, error, status = service.create_fractal_goal(
                locked_run.root_id,
                locked_run.user_id,
                input_data["data"],
                commit=False,
                pending_events=pending_events,
            )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            result = {
                "id": entity.id,
                "name": entity.name,
                "type": get_canonical_goal_type(entity),
                "root_id": entity.root_id,
                "href": self._app_href(locked_run.root_id, "goals"),
            }
        elif operation.kind == "create_activity":
            service = ActivityService(self.db_session)
            entity, error, status = service.create_activity_definition(
                locked_run.root_id,
                locked_run.user_id,
                input_data["data"],
                commit=False,
                pending_events=pending_events,
            )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            result = {
                "id": entity.id,
                "name": entity.name,
                "root_id": entity.root_id,
                "goal_ids": list(input_data["data"].get("goal_ids") or []),
                "href": self._app_href(locked_run.root_id, "manage-activities"),
            }
        elif operation.kind == "create_note":
            entity, error, status = NoteService(self.db_session).create_note(
                locked_run.root_id,
                locked_run.user_id,
                input_data["data"],
                commit=False,
                pending_events=pending_events,
                agent_grant_id=grant.id if grant else None,
                agent_run_id=locked_run.id,
            )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            result = {
                "id": entity["id"],
                "context_type": entity["context_type"],
                "context_id": entity["context_id"],
                "root_id": locked_run.root_id,
                "href": self._app_href(locked_run.root_id, "notes"),
            }
        elif operation.kind in {"create_session", "update_session"}:
            from services.session_service import SessionService

            service = SessionService(self.db_session)
            if operation.kind == "create_session":
                entity, error, status = service.create_session(
                    locked_run.root_id, locked_run.user_id, input_data["data"],
                    commit=False, pending_events=pending_events,
                )
                entity_id = entity.get("id") if entity else None
            else:
                entity, error, status = service.update_session(
                    locked_run.root_id, input_data["session_id"], locked_run.user_id,
                    input_data["data"], commit=False, pending_events=pending_events,
                )
                entity_id = input_data["session_id"]
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            result = {
                "id": entity_id,
                "name": entity.get("name") if entity else None,
                "root_id": locked_run.root_id,
                "href": self._app_href(locked_run.root_id, "sessions"),
            }
        elif operation.kind in {"create_metric", "update_metric"}:
            service = ActivityService(self.db_session)
            if operation.kind == "create_metric":
                entity, error, status = service.create_fractal_metric(
                    locked_run.root_id, locked_run.user_id, input_data["data"],
                    commit=False, pending_events=pending_events,
                )
            else:
                entity, error, status = service.update_fractal_metric(
                    locked_run.root_id, input_data["metric_id"], locked_run.user_id,
                    input_data["data"], commit=False, pending_events=pending_events,
                )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            result = {
                "id": entity.id,
                "name": entity.name,
                "root_id": locked_run.root_id,
                "href": self._app_href(locked_run.root_id, "metrics"),
            }
        elif operation.kind == "create_template":
            from services.template_service import TemplateService

            entity, error, status = TemplateService(self.db_session).create_template(
                locked_run.root_id,
                locked_run.user_id,
                input_data["data"],
                commit=False,
                pending_events=pending_events,
            )
            if error:
                raise AgentHarnessError(str(error), status, "validation_failed")
            result = {
                "id": entity.id,
                "name": entity.name,
                "root_id": locked_run.root_id,
                "href": self._app_href(locked_run.root_id, "manage-session-templates"),
            }
        elif operation.kind == "create_program":
            from services.programs import ProgramService

            entity = ProgramService.create_program(
                self.db_session,
                locked_run.root_id,
                input_data["data"],
                locked_run.user_id,
                commit=False,
                pending_events=pending_events,
            )
            result = {
                "id": entity["id"],
                "name": entity.get("name"),
                "root_id": locked_run.root_id,
                "href": self._app_href(locked_run.root_id, "programs", entity["id"]),
            }
        elif operation.kind == "create_block":
            from services.programs import ProgramService

            entity = ProgramService.create_block(
                self.db_session,
                locked_run.root_id,
                input_data["program_id"],
                input_data["data"],
                locked_run.user_id,
                commit=False,
                pending_events=pending_events,
            )
            result = {
                "id": entity["id"],
                "name": entity.get("name"),
                "root_id": locked_run.root_id,
                "href": self._app_href(locked_run.root_id, "programs", input_data["program_id"]),
            }
        elif operation.kind == "create_program_day":
            from services.programs import ProgramService

            created = ProgramService.add_block_day(
                self.db_session,
                locked_run.root_id,
                input_data["program_id"],
                input_data["block_id"],
                input_data["data"],
                locked_run.user_id,
                commit=False,
                pending_events=pending_events,
                create_only=True,
            )
            first_day = (created.get("days") or [{}])[0]
            result = {
                "id": first_day.get("id"),
                "name": first_day.get("name"),
                "root_id": locked_run.root_id,
                "href": self._app_href(locked_run.root_id, "programs", input_data["program_id"]),
            }
        elif operation.kind == "schedule_program_day":
            from services.programs import ProgramService

            input_data.pop("expected_source_hash", None)
            scheduled = ProgramService.schedule_block_day(
                self.db_session,
                locked_run.root_id,
                input_data["program_id"],
                input_data["block_id"],
                input_data["day_id"],
                input_data["data"],
                locked_run.user_id,
                commit=False,
                pending_events=pending_events,
            )
            result = {
                "id": scheduled.get("id"),
                "program_day_id": input_data["day_id"],
                "date": scheduled.get("date"),
                "name": scheduled.get("name"),
                "root_id": locked_run.root_id,
                "href": self._app_href(
                    locked_run.root_id, "programs", input_data["program_id"],
                ),
            }
        else:
            raise AgentHarnessError("Unsupported operation type", 400, "unsupported_operation")

        if inverse is not None and inverse.get("undo_supported"):
            self.db_session.flush()
            inverse["post_state_hash"] = operation_state_hash(
                self.db_session, locked_run.root_id, input_data,
            )
        if inverse is not None:
            result["inverse"] = inverse
        operation.status = "succeeded"
        operation.result = result
        operation.finished_at = utc_now()
        for event in pending_events:
            event_data = dict(event.data or {})
            event_data.setdefault("root_id", locked_run.root_id)
            self.db_session.add(AgentOutboxEvent(
                event_type=event.name,
                payload={
                    "id": event.id,
                    "data": event_data,
                    "source": event.source,
                    "timestamp": event.timestamp.isoformat(),
                },
            ))
        cursor = self.db_session.query(AgentChangeCursor).filter_by(
            user_id=locked_run.user_id,
            root_id=locked_run.root_id,
        ).with_for_update().first()
        if cursor is None:
            cursor = AgentChangeCursor(
                user_id=locked_run.user_id,
                root_id=locked_run.root_id,
                cursor=1,
            )
            self.db_session.add(cursor)
        else:
            cursor.cursor += 1
            cursor.updated_at = utc_now()
        # Domain write, operation result, query cursor, and pending events share
        # the same transaction. A retry reads this committed result by op id.
        self.db_session.commit()
        return result
    def run_once(self, worker_id):
        from services.feature_flag_service import FeatureFlagService

        flags, error, _ = FeatureFlagService(self.db_session).get_flags()
        agent_flags = flags.get("flags", {}) if not error and flags else {}
        enabled_origins = _enabled_run_origins(agent_flags)
        if not enabled_origins:
            self.dispatch_outbox()
            return None
        now = utc_now()
        run = self.db_session.query(AgentRun).filter(
            or_(
                AgentRun.status == "queued",
                (AgentRun.status == "running") & (AgentRun.lease_expires_at < now),
            ),
            AgentRun.execution_origin.in_(enabled_origins),
        ).order_by(AgentRun.created_at, AgentRun.id).with_for_update(skip_locked=True).first()
        if not run:
            self.dispatch_outbox()
            return None
        run.status = "running"
        run.lease_owner = worker_id
        run.lease_expires_at = now + dt.timedelta(seconds=config.AGENT_RUN_LEASE_SECONDS)
        run.fencing_token = (run.fencing_token or 0) + 1
        run.started_at = run.started_at or now
        fencing_token = run.fencing_token
        run_id = run.id
        self.db_session.commit()

        succeeded = 0
        failed = False
        cancelled = False
        stop_sequence = None
        operations = self.db_session.query(AgentOperation).filter(
            AgentOperation.run_id == run_id,
        ).order_by(AgentOperation.sequence).all()
        for operation in operations:
            if operation.status == "succeeded":
                succeeded += 1
                continue
            if operation.status == "failed":
                failed = True
                stop_sequence = operation.sequence
                break
            current_run = self._renew_run_lease(run_id, worker_id, fencing_token)
            if current_run is None:
                return {"id": run_id, "status": "lease_lost"}
            if current_run.cancel_requested_at:
                cancelled = True
                stop_sequence = operation.sequence
                break
            try:
                flags, error, _ = FeatureFlagService(self.db_session).get_flags()
                agent_flags = flags.get("flags", {})
                if error or current_run.execution_origin not in _enabled_run_origins(agent_flags):
                    raise AgentHarnessError(
                        "This proposal's execution channel was paused by an administrator",
                        409,
                        "feature_disabled",
                    )
                self._execute_operation(current_run, operation, worker_id, fencing_token)
                succeeded += 1
            except AgentHarnessError as error:
                self.db_session.rollback()
                committed = self._record_operation_failure(
                    run_id,
                    operation.operation_id,
                    worker_id,
                    fencing_token,
                    error.code,
                    error.message,
                )
                if committed:
                    succeeded += 1
                    continue
                failed = True
                stop_sequence = operation.sequence
                break
            except StaleDataError:
                self.db_session.rollback()
                committed = self._record_operation_failure(
                    run_id,
                    operation.operation_id,
                    worker_id,
                    fencing_token,
                    "stale_context",
                    "The record changed during execution; create and approve a new proposal.",
                )
                if committed:
                    succeeded += 1
                    continue
                failed = True
                stop_sequence = operation.sequence
                break
            except Exception:
                self.db_session.rollback()
                logger.exception("Agent operation failed run_id=%s operation_id=%s", run_id, operation.operation_id)
                committed = self._record_operation_failure(
                    run_id,
                    operation.operation_id,
                    worker_id,
                    fencing_token,
                    "execution_failed",
                    "The operation failed; retry after reviewing the current state.",
                )
                if committed:
                    succeeded += 1
                    continue
                failed = True
                stop_sequence = operation.sequence
                break

        if stop_sequence is not None and (failed or cancelled):
            self._mark_unstarted_operations(
                run_id,
                worker_id,
                fencing_token,
                stop_sequence,
                cancelled=cancelled,
            )
        self._finish_run(run_id, worker_id, fencing_token, succeeded, failed, cancelled)
        self.dispatch_outbox()
        return self.get_run_for_worker(run_id)
    def request_cancel(self, user_id, run_id):
        run = self.db_session.query(AgentRun).filter(
            AgentRun.id == run_id,
            AgentRun.user_id == user_id,
        ).with_for_update().first()
        if not run:
            raise AgentHarnessError("Run not found", 404, "not_found")
        if run.status in {"succeeded", "partially_succeeded", "failed", "cancelled"}:
            return self.serialize_run(run)
        run.cancel_requested_at = utc_now()
        if run.status == "queued":
            run.status = "cancelled"
            run.finished_at = utc_now()
            task = self.db_session.query(AgentTaskBrief).join(
                AgentProposal,
                AgentProposal.task_id == AgentTaskBrief.id,
            ).filter(AgentProposal.id == run.proposal_id).first()
            if task:
                task.status = "cancelled"
        self.db_session.commit()
        return self.serialize_run(run)
    def dispatch_outbox(self, limit=100):
        rows = self.db_session.query(AgentOutboxEvent).filter(
            AgentOutboxEvent.dispatched_at.is_(None),
        ).order_by(AgentOutboxEvent.created_at, AgentOutboxEvent.id).limit(
            min(500, max(1, limit))
        ).with_for_update(skip_locked=True).all()
        if not rows:
            return 0
        from services.events import Event, event_bus
        from services.event_logger import _get_entity_info, _get_event_description
        emitted_events = []
        for row in rows:
            payload = row.payload or {}
            timestamp = payload.get("timestamp")
            try:
                event_time = dt.datetime.fromisoformat(timestamp) if timestamp else utc_now()
            except ValueError:
                event_time = utc_now()
            event_data = payload.get("data") or {}
            event = Event(
                row.event_type,
                event_data,
                id=payload.get("id") or row.id,
                timestamp=event_time,
                source=payload.get("source"),
            )
            root_id = event.data.get("root_id")
            root_exists = bool(root_id and self.db_session.query(Goal.id).filter_by(
                id=root_id,
                deleted_at=None,
            ).first())
            if root_exists and not self.db_session.query(EventLog.id).filter_by(
                event_id=event.id,
            ).first():
                entity_type, entity_id = _get_entity_info(event)
                self.db_session.add(EventLog(
                    root_id=root_id,
                    event_type=event.name,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    description=_get_event_description(event),
                    payload=event.data,
                    source=event.source or "system",
                    event_id=event.id,
                    timestamp=event.timestamp,
                ))
            row.dispatched_at = utc_now()
            emitted_events.append(event)
        self.db_session.commit()
        # EventBus consumers are best-effort in-process handlers. The durable
        # event-history consumer and dispatch acknowledgement committed above.
        for event in emitted_events:
            event_bus.emit(event)
        return len(rows)
