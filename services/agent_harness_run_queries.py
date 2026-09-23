"""Paginated read models for delegated agent runs."""

from models import AgentChangeCursor, AgentOperation, AgentRun
from services.agent_harness_common import AgentHarnessError, _iso


class AgentRunQueriesMixin:
    def serialize_run(self, run, *, include_operations=False):
        result = {
            "id": run.id,
            "proposal_id": run.proposal_id,
            "root_id": run.root_id,
            "status": run.status,
            "trace_id": run.trace_id,
            "created_at": _iso(run.created_at),
            "started_at": _iso(run.started_at),
            "finished_at": _iso(run.finished_at),
            "cancel_requested": run.cancel_requested_at is not None,
        }
        if include_operations:
            result["operations"] = [
                {
                    "id": row.operation_id,
                    "sequence": row.sequence,
                    "type": row.kind,
                    "status": row.status,
                    "result": row.result,
                    "error": (
                        {"code": row.error_code, "message": row.error_message}
                        if row.error_code else None
                    ),
                }
                for row in self.db_session.query(AgentOperation).filter_by(
                    run_id=run.id
                ).order_by(AgentOperation.sequence).all()
            ]
        return result
    def get_run(self, user_id, run_id, *, allowed_roots=None):
        run = self.db_session.query(AgentRun).filter(
            AgentRun.id == run_id,
            AgentRun.user_id == user_id,
        ).first()
        if not run or (allowed_roots is not None and run.root_id not in allowed_roots):
            raise AgentHarnessError("Run not found", 404, "not_found")
        return self.serialize_run(run, include_operations=True)
    def get_change_cursor(self, user_id, root_id, *, allowed_roots=None):
        if allowed_roots is not None and root_id not in allowed_roots:
            raise AgentHarnessError("Fractal is outside the AI connection's allowed scope", 403, "root_forbidden")
        self._root(root_id, user_id)
        cursor = self.db_session.get(AgentChangeCursor, (user_id, root_id))
        return {"root_id": root_id, "cursor": cursor.cursor if cursor else 0}
    def list_runs(self, user_id, *, root_id=None, allowed_roots=None, limit=50, before=None):
        query = self.db_session.query(AgentRun).filter(AgentRun.user_id == user_id)
        if root_id:
            if allowed_roots is not None and root_id not in allowed_roots:
                raise AgentHarnessError("Fractal is outside the AI connection's allowed scope", 403, "root_forbidden")
            query = query.filter(AgentRun.root_id == root_id)
        elif allowed_roots is not None:
            query = query.filter(AgentRun.root_id.in_(allowed_roots))
        if before:
            query = query.filter(AgentRun.created_at < before)
        page_size = min(100, max(1, limit))
        rows = query.order_by(AgentRun.created_at.desc(), AgentRun.id.desc()).limit(page_size + 1).all()
        visible_rows = rows[:page_size]
        run_ids = [run.id for run in visible_rows]
        operations_by_run = {}
        if run_ids:
            operations = self.db_session.query(AgentOperation).filter(
                AgentOperation.run_id.in_(run_ids),
            ).order_by(AgentOperation.run_id, AgentOperation.sequence).all()
            for operation in operations:
                operations_by_run.setdefault(operation.run_id, []).append({
                    "id": operation.operation_id,
                    "sequence": operation.sequence,
                    "type": operation.kind,
                    "status": operation.status,
                    "result": operation.result,
                    "error": (
                        {"code": operation.error_code, "message": operation.error_message}
                        if operation.error_code else None
                    ),
                })
        items = [self.serialize_run(run) for run in visible_rows]
        for item in items:
            item["operations"] = operations_by_run.get(item["id"], [])
        return {
            "items": items,
            "truncated": len(rows) > page_size,
            "next_before": _iso(rows[page_size - 1].created_at) if len(rows) > page_size else None,
        }
