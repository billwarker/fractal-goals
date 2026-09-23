"""Proposals operations for the delegated AI harness."""

import datetime as dt
import secrets
from urllib.parse import quote
from models import AgentApproval, AgentOperation, AgentProposal, AgentRun, AgentTaskBrief, Goal, Program, ProgramBlock, ProgramDay, Session, SessionTemplate, program_day_templates, utc_now
from validators.agent import AgentProposalSchema

from services.agent_harness_common import AgentHarnessError, PROPOSAL_TTL_HOURS, _aware, _digest, _iso, _model_data
from services.agent_operation_versions import operation_state_hash


class AgentProposalsMixin:
    @staticmethod
    def _app_href(root_id, section, entity_id=None):
        root = quote(str(root_id), safe="")
        if section == "programs" and entity_id:
            return f"/{root}/programs/{quote(str(entity_id), safe='')}"
        return f"/{root}/{section}"
    def decide_proposal(self, user_id, proposal_id, proposal_hash, decision):
        proposal = self.db_session.query(AgentProposal).filter(
            AgentProposal.id == proposal_id,
            AgentProposal.user_id == user_id,
        ).with_for_update().first()
        if not proposal:
            raise AgentHarnessError("Proposal not found", 404, "not_found")
        if proposal_hash != proposal.proposal_hash:
            raise AgentHarnessError("Proposal changed after review; reload it before deciding", 409, "proposal_changed")
        if _digest(proposal.operations) != proposal.proposal_hash:
            raise AgentHarnessError("Proposal data failed its integrity check", 409, "proposal_changed")
        if _aware(proposal.expires_at) <= utc_now():
            proposal.status = "expired"
            self.db_session.commit()
            raise AgentHarnessError("Proposal expired", 409, "proposal_expired")
        self._root(proposal.root_id, user_id)
        if proposal.status == "approved":
            approval = self.db_session.query(AgentApproval).filter_by(
                proposal_id=proposal.id,
                decision="approve",
                proposal_hash=proposal.proposal_hash,
            ).first()
            if decision == "approve" and approval:
                return self.queue_approved_proposal(proposal.id, user_id)
            raise AgentHarnessError("Proposal has already been decided", 409, "proposal_decided")
        if proposal.status != "awaiting_approval":
            raise AgentHarnessError("Proposal is no longer awaiting review", 409, "proposal_decided")

        approval = AgentApproval(
            proposal_id=proposal.id,
            user_id=user_id,
            root_id=proposal.root_id,
            proposal_hash=proposal.proposal_hash,
            decision=decision,
        )
        self.db_session.add(approval)
        proposal.status = "approved" if decision == "approve" else "rejected"
        self.db_session.commit()
        if decision == "reject":
            return {"proposal_id": proposal.id, "status": "rejected"}
        return self.queue_approved_proposal(proposal.id, user_id)
    def _goal_names(self, root_id, goal_ids):
        if not goal_ids:
            return []
        rows = self.db_session.query(Goal.id, Goal.name).filter(
            Goal.root_id == root_id,
            Goal.id.in_(goal_ids),
            Goal.deleted_at.is_(None),
        ).all()
        names = {goal_id: name for goal_id, name in rows}
        return [names[goal_id] for goal_id in goal_ids if goal_id in names]

    def _template_names(self, root_id, templates):
        template_ids = [
            item.get("template_id") if isinstance(item, dict) else item
            for item in (templates or [])
        ]
        template_ids = [template_id for template_id in template_ids if template_id]
        if not template_ids:
            return []
        rows = self.db_session.query(SessionTemplate.id, SessionTemplate.name).filter(
            SessionTemplate.root_id == root_id,
            SessionTemplate.id.in_(template_ids),
            SessionTemplate.deleted_at.is_(None),
        ).all()
        names = {template_id: name for template_id, name in rows}
        return [names[template_id] for template_id in template_ids if template_id in names]
    def create_proposal(
        self,
        user_id,
        task_id,
        data,
        *,
        grant_id=None,
        allowed_roots=None,
        expected_state_hashes=None,
        commit=True,
    ):
        task = self._get_task_row(user_id, task_id)
        if allowed_roots is not None and task.root_id not in allowed_roots:
            raise AgentHarnessError("Task is outside the AI connection's allowed scope", 403, "root_forbidden")
        if grant_id:
            grant = self._grant(grant_id, user_id, task.root_id)
            if task.grant_id and task.grant_id != grant.id:
                raise AgentHarnessError("Task belongs to another AI connection", 403, "grant_mismatch")
            if not task.grant_id:
                task.grant_id = grant.id

        proposal_data = AgentProposalSchema.model_validate(data)
        max_operations = min(50, int((task.limits or {}).get("max_operations", 50)))
        if len(proposal_data.operations) > max_operations:
            raise AgentHarnessError(f"Task allows at most {max_operations} operations", 400, "operation_limit")

        operations = [_model_data(operation) for operation in proposal_data.operations]
        ids = [operation["operation_id"] for operation in operations]
        if len(ids) != len(set(ids)):
            raise AgentHarnessError("operation_id values must be unique within a proposal")

        preview = []
        preview_refs = {}
        savepoint = self.db_session.begin_nested()
        try:
            for operation in operations:
                target_field = {
                    "update_goal": "goal_id",
                    "update_activity": "activity_id",
                    "associate_activity_goals": "activity_id",
                    "update_program": "program_id",
                    "update_block": "block_id",
                    "update_program_day": "day_id",
                    "update_session": "session_id",
                    "update_metric": "metric_id",
                }.get(operation["type"])
                if target_field and str(operation.get(target_field, "")).startswith("$ref:"):
                    raise AgentHarnessError(
                        "An update cannot target an entity created earlier in the same proposal",
                        400,
                        "invalid_reference",
                    )
                resolved = self._resolve_references(operation, preview_refs)
                if operation["type"] in {
                    "update_goal", "update_activity", "associate_activity_goals",
                    "update_program", "update_block", "update_program_day", "update_session", "update_metric",
                }:
                    actual_state_hash = operation_state_hash(
                        self.db_session, task.root_id, resolved,
                    )
                    expected_state_hash = (expected_state_hashes or {}).get(
                        operation["operation_id"],
                    )
                    if expected_state_hash and expected_state_hash != actual_state_hash:
                        raise AgentHarnessError(
                            "The record changed after the original run; undo would overwrite later work",
                            409,
                            "stale_context",
                        )
                    operation["_expected_state_hash"] = expected_state_hash or actual_state_hash
                    resolved["_expected_state_hash"] = operation["_expected_state_hash"]
                if operation["type"] == "schedule_program_day" and not any(
                    str(operation[field]).startswith("$ref:")
                    for field in ("program_id", "block_id", "day_id")
                ):
                    operation["expected_source_hash"] = self._program_day_state_hash(
                        task.root_id,
                        resolved["program_id"],
                        resolved["block_id"],
                        resolved["day_id"],
                        operation=resolved,
                    )
                summary, result = self._validate_and_preview_operation(
                    task, user_id, resolved
                )
                preview.append(summary)
                if result.get("id"):
                    preview_refs[operation["operation_id"]] = result["id"]
        finally:
            savepoint.rollback()
        previous_revision = self.db_session.query(AgentProposal.revision).filter(
            AgentProposal.task_id == task.id,
        ).order_by(AgentProposal.revision.desc()).first()
        revision = (previous_revision[0] if previous_revision else 0) + 1
        proposal = AgentProposal(
            task_id=task.id,
            user_id=user_id,
            root_id=task.root_id,
            revision=revision,
            proposal_hash=_digest(operations),
            operations=operations,
            preview=preview,
            status="awaiting_approval",
            expires_at=utc_now() + dt.timedelta(hours=PROPOSAL_TTL_HOURS),
        )
        task.status = "proposal_ready"
        self.db_session.add(proposal)
        if commit:
            self.db_session.commit()
        else:
            self.db_session.flush()
        return self.serialize_proposal(proposal)

    def create_undo_proposal(self, user_id, run_id):
        run = self.db_session.query(AgentRun).filter_by(
            id=run_id, user_id=user_id,
        ).first()
        if not run or run.status not in {"succeeded", "partially_succeeded"}:
            raise AgentHarnessError("Only completed runs with successful changes can be undone", 409, "undo_unavailable")
        successful = self.db_session.query(AgentOperation).filter_by(
            run_id=run.id, status="succeeded",
        ).order_by(AgentOperation.sequence.desc()).all()
        if not successful:
            raise AgentHarnessError("This run has no successful changes to undo", 409, "undo_unavailable")

        inverses = []
        expected_state_hashes = {}
        for sequence, operation in enumerate(successful):
            inverse = (operation.result or {}).get("inverse")
            if not inverse or not inverse.get("undo_supported"):
                reason = (inverse or {}).get("reason") or "This run contains changes without a safe inverse"
                raise AgentHarnessError(reason, 409, "undo_unavailable")
            operation_id = f"undo-{sequence}-{_digest(operation.operation_id)[:12]}"
            inverse_operation = {
                "operation_id": operation_id,
                "type": inverse["type"],
            }
            for field in ("goal_id", "activity_id", "program_id", "block_id", "day_id"):
                if field in inverse:
                    inverse_operation[field] = inverse[field]
            if "goal_ids" in inverse:
                inverse_operation["goal_ids"] = inverse["goal_ids"]
            if "data" in inverse:
                inverse_operation["data"] = inverse["data"]
            inverses.append(inverse_operation)
            if inverse.get("post_state_hash"):
                expected_state_hashes[operation_id] = inverse["post_state_hash"]
                if operation_state_hash(
                    self.db_session, run.root_id, inverse_operation,
                ) != inverse["post_state_hash"]:
                    raise AgentHarnessError(
                        "The record changed after the original run; undo would overwrite later work",
                        409,
                        "stale_context",
                    )
            else:
                raise AgentHarnessError(
                    "This run predates safe undo state checks; create a new proposal instead",
                    409,
                    "undo_unavailable",
                )

        source_proposal = self.db_session.query(AgentProposal).filter_by(
            id=run.proposal_id, user_id=user_id,
        ).first()
        source_task = self.db_session.query(AgentTaskBrief).filter_by(
            id=source_proposal.task_id if source_proposal else None,
            user_id=user_id,
        ).first()
        if not source_task:
            raise AgentHarnessError("The source task for this run is unavailable", 404, "not_found")
        task = self.create_task(user_id, {
            "root_id": run.root_id,
            "request_text": f"Review an inverse for run {run.id}",
            "timezone": source_task.timezone,
            "context": source_task.context or {},
            "limits": source_task.limits or {},
        })
        return self.create_proposal(
            user_id,
            task["id"],
            {"operations": inverses},
            expected_state_hashes=expected_state_hashes,
        )
    def queue_approved_proposal(self, proposal_id, user_id):
        proposal = self.db_session.query(AgentProposal).filter(
            AgentProposal.id == proposal_id,
            AgentProposal.user_id == user_id,
        ).with_for_update().first()
        if not proposal or proposal.status != "approved":
            raise AgentHarnessError("Proposal has not been approved by the user", 403, "approval_required")
        if _digest(proposal.operations) != proposal.proposal_hash:
            raise AgentHarnessError("Approved proposal data failed its integrity check", 409, "proposal_changed")
        approval = self.db_session.query(AgentApproval).filter(
            AgentApproval.proposal_id == proposal.id,
            AgentApproval.user_id == user_id,
            AgentApproval.root_id == proposal.root_id,
            AgentApproval.proposal_hash == proposal.proposal_hash,
            AgentApproval.decision == "approve",
        ).order_by(AgentApproval.created_at.desc()).first()
        if not approval:
            raise AgentHarnessError("Valid user approval was not found", 403, "approval_required")
        self._root(proposal.root_id, user_id)
        task = self._get_task_row(user_id, proposal.task_id)
        if task.grant_id:
            self._grant(task.grant_id, user_id, proposal.root_id)
        run = self.db_session.query(AgentRun).filter_by(proposal_id=proposal.id).first()
        if run is None:
            run = AgentRun(
                proposal_id=proposal.id,
                user_id=user_id,
                grant_id=task.grant_id,
                root_id=proposal.root_id,
                execution_origin=("connector" if task.grant_id else task.execution_origin),
                status="queued",
                fencing_token=0,
                trace_id=secrets.token_hex(16),
            )
            self.db_session.add(run)
            self.db_session.flush()
            for sequence, operation in enumerate(proposal.operations):
                self.db_session.add(AgentOperation(
                    run_id=run.id,
                    operation_id=operation["operation_id"],
                    sequence=sequence,
                    kind=operation["type"],
                    input_hash=_digest(operation),
                    input_data=operation,
                    status="queued",
                ))
            task.status = "queued"
        self.db_session.commit()
        return self.serialize_run(run)
    def _program_day_state_hash(self, root_id, program_id, block_id, day_id, *, operation=None, for_update=False):
        program_query = self.db_session.query(Program).filter_by(
            id=program_id,
            root_id=root_id,
        ).populate_existing()
        if for_update:
            program_query = program_query.with_for_update()
        program = program_query.first()
        block_query = self.db_session.query(ProgramBlock).filter_by(
            id=block_id,
            program_id=program_id,
        ).populate_existing()
        if for_update:
            block_query = block_query.with_for_update()
        block = block_query.first()
        day_query = self.db_session.query(ProgramDay).filter_by(
            id=day_id,
            block_id=block_id,
        ).populate_existing()
        if for_update:
            day_query = day_query.with_for_update()
        day = day_query.first()
        if not program or not block or not day:
            raise AgentHarnessError("The program day changed or is no longer available", 409, "stale_context")
        template_query = self.db_session.query(
            program_day_templates.c.order,
            program_day_templates.c.is_required,
            SessionTemplate.name,
            SessionTemplate.template_data,
        ).join(
            SessionTemplate,
            SessionTemplate.id == program_day_templates.c.session_template_id,
        ).filter(
            program_day_templates.c.program_day_id == day.id,
            SessionTemplate.deleted_at.is_(None),
        ).order_by(program_day_templates.c.order, SessionTemplate.name)
        if for_update:
            template_query = template_query.with_for_update()
        template_links = template_query.all()
        scheduled_query = self.db_session.query(Session).filter(
            Session.root_id == root_id,
            Session.program_day_id == day.id,
            Session.deleted_at.is_(None),
        ).order_by(Session.id).populate_existing()
        if for_update:
            scheduled_query = scheduled_query.with_for_update()
        scheduled_sessions = scheduled_query.all()
        return _digest({
            "root_id": root_id,
            "program": {
                "name": program.name,
                "color": program.color,
                "goals": sorted(goal.id for goal in (program.goals or [])),
            },
            "block": {
                "name": block.name,
                "start_date": _iso(block.start_date),
                "end_date": _iso(block.end_date),
                "color": block.color,
                "goals": sorted(goal.id for goal in (block.goals or [])),
            },
            "day": {
                "name": day.name,
                "day_number": day.day_number,
                "date": _iso(day.date),
                "day_of_week": day.day_of_week or [],
                "completion_min_templates": day.completion_min_templates,
                "templates": [
                    {
                        "order": row.order,
                        "is_required": bool(row.is_required),
                        "name": row.name,
                        "template_data": row.template_data,
                    }
                    for row in template_links
                ],
            },
            "scheduled_sessions": [
                {
                    "id": row.id,
                    "session_start": _iso(row.session_start),
                    "session_end": _iso(row.session_end),
                    "completed": bool(row.completed),
                    "deleted_at": _iso(row.deleted_at),
                }
                for row in scheduled_sessions
            ],
        })
    def serialize_proposal(self, proposal):
        return {
            "id": proposal.id,
            "task_id": proposal.task_id,
            "root_id": proposal.root_id,
            "revision": proposal.revision,
            "proposal_hash": proposal.proposal_hash,
            "operations": [
                {key: value for key, value in operation.items() if not key.startswith("_")}
                for operation in proposal.operations
            ],
            "preview": proposal.preview,
            "status": proposal.status,
            "expires_at": _iso(proposal.expires_at),
            "created_at": _iso(proposal.created_at),
        }
    def get_proposal(self, user_id, proposal_id, *, allowed_roots=None):
        proposal = self.db_session.query(AgentProposal).filter(
            AgentProposal.id == proposal_id,
            AgentProposal.user_id == user_id,
        ).first()
        if not proposal or (allowed_roots is not None and proposal.root_id not in allowed_roots):
            raise AgentHarnessError("Proposal not found", 404, "not_found")
        return self.serialize_proposal(proposal)
    @staticmethod
    def _resolve_references(value, references):
        reference_fields = {
            "activity_definition_id",
            "activity_id",
            "block_id",
            "context_id",
            "day_id",
            "goal_id",
            "goal_ids",
            "parent_id",
            "program_id",
            "selectedGoals",
            "selected_goals",
            "template_id",
            "template_ids",
        }

        def resolve(item, field=None):
            if field in reference_fields and isinstance(item, str) and item.startswith("$ref:"):
                operation_id = item[5:]
                resolved = references.get(operation_id)
                if not resolved:
                    raise AgentHarnessError(
                        "References must point to an earlier operation that creates an entity",
                        400,
                        "invalid_reference",
                    )
                return resolved
            if isinstance(item, list):
                return [resolve(value, field) for value in item]
            if isinstance(item, dict):
                return {key: resolve(value, key) for key, value in item.items()}
            return item

        return resolve(value)
