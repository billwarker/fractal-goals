"""Context operations for the delegated AI harness."""

import datetime as dt
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from sqlalchemy import func
from models import ActivityDefinition, AgentGrant, AgentOAuthClient, AgentTaskBrief, Goal, Program, ProgramBlock, ProgramDay, SessionTemplate, program_day_templates, utc_now, validate_root_goal
from services.goal_type_utils import get_canonical_goal_type
from validators.agent import AgentTaskBriefSchema

from services.agent_harness_common import AgentHarnessError, MAX_CONTEXT_ACTIVITIES, MAX_CONTEXT_GOALS, MAX_CONTEXT_PROGRAMS, MAX_CONTEXT_TEMPLATES, TASK_TTL_HOURS, _canonical_json, _iso


class AgentContextMixin:
    def _root(self, root_id, user_id):
        root = validate_root_goal(self.db_session, root_id, owner_id=user_id)
        if not root:
            raise AgentHarnessError("Fractal not found", 404, "not_found")
        return root
    def list_fractals(self, user_id, allowed_roots=None):
        query = self.db_session.query(Goal).filter(
            Goal.owner_id == user_id,
            Goal.parent_id.is_(None),
            Goal.deleted_at.is_(None),
            Goal.root_id == Goal.id,
        )
        if allowed_roots is not None:
            query = query.filter(Goal.id.in_(allowed_roots))
        roots = query.order_by(Goal.created_at.desc(), Goal.id).limit(51).all()
        return {
            "items": [
                {
                    "id": goal.id,
                    "name": goal.name,
                    "type": get_canonical_goal_type(goal),
                    "updated_at": _iso(goal.updated_at),
                }
                for goal in roots[:50]
            ],
            "truncated": len(roots) > 50,
        }
    def _grant(self, grant_id, user_id, root_id=None):
        if not grant_id:
            return None
        grant = self.db_session.query(AgentGrant).join(
            AgentOAuthClient,
            AgentOAuthClient.id == AgentGrant.client_id,
        ).filter(
            AgentGrant.id == grant_id,
            AgentGrant.user_id == user_id,
            AgentGrant.revoked_at.is_(None),
            AgentGrant.expires_at > utc_now(),
            AgentOAuthClient.revoked_at.is_(None),
        ).first()
        if not grant:
            raise AgentHarnessError("AI connection has been revoked or expired", 403, "grant_revoked")
        if root_id and root_id not in (grant.allowed_roots or []):
            raise AgentHarnessError("Fractal is outside the AI connection's allowed scope", 403, "root_forbidden")
        return grant
    def get_goal_context(
        self, user_id, root_id, *, goals_offset=0, activities_offset=0,
        programs_offset=0, templates_offset=0, page_size=None,
    ):
        root = self._root(root_id, user_id)
        page_size = min(100, max(1, int(page_size))) if page_size is not None else None
        goal_page_limit = min(MAX_CONTEXT_GOALS, page_size or MAX_CONTEXT_GOALS)
        activity_page_limit = min(MAX_CONTEXT_ACTIVITIES, page_size or MAX_CONTEXT_ACTIVITIES)
        program_page_limit = min(MAX_CONTEXT_PROGRAMS, page_size or MAX_CONTEXT_PROGRAMS)
        template_page_limit = min(MAX_CONTEXT_TEMPLATES, page_size or MAX_CONTEXT_TEMPLATES)
        goals = self.db_session.query(Goal).filter(
            Goal.root_id == root_id,
            Goal.deleted_at.is_(None),
        ).order_by(Goal.created_at, Goal.id).offset(max(0, goals_offset)).limit(goal_page_limit + 1).all()
        activities = self.db_session.query(ActivityDefinition).filter(
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).order_by(ActivityDefinition.name, ActivityDefinition.id).offset(
            max(0, activities_offset)
        ).limit(activity_page_limit + 1).all()
        programs = self.db_session.query(Program).filter(
            Program.root_id == root_id,
        ).order_by(Program.start_date, Program.id).offset(max(0, programs_offset)).limit(program_page_limit + 1).all()
        templates = self.db_session.query(SessionTemplate).filter(
            SessionTemplate.root_id == root_id,
            SessionTemplate.archived_at.is_(None),
            SessionTemplate.deleted_at.is_(None),
        ).order_by(SessionTemplate.name, SessionTemplate.id).offset(max(0, templates_offset)).limit(template_page_limit + 1).all()

        goal_items = [
            {
                "id": row.id,
                "name": row.name,
                "type": get_canonical_goal_type(row),
                "parent_id": row.parent_id,
                "description": row.description,
                "deadline": row.deadline.isoformat() if row.deadline else None,
                "completed": bool(row.completed),
            }
            for row in goals[:goal_page_limit]
        ]
        activity_items = [
            {"id": row.id, "name": row.name, "description": row.description, "group_id": row.group_id}
            for row in activities[:activity_page_limit]
        ]
        # Keep nested detail proportional to the requested page. A page size of
        # one must be a genuinely small recovery page, rather than a catalog
        # page that still expands five programs and their descendants.
        nested_program_limit = min(5, program_page_limit)
        nested_block_limit = min(9, max(1, page_size or 9))
        nested_day_limit = min(11, max(1, page_size or 11))
        nested_template_limit = min(5, max(1, page_size or 5))
        detailed_programs = programs[:nested_program_limit]
        program_context = []
        block_rows = []
        days_by_block = {}
        template_counts = {}
        if detailed_programs:
            program_ids = [row.id for row in detailed_programs]
            ranked_blocks = self.db_session.query(
                ProgramBlock.id.label("id"),
                ProgramBlock.program_id.label("program_id"),
                ProgramBlock.name.label("name"),
                ProgramBlock.start_date.label("start_date"),
                ProgramBlock.end_date.label("end_date"),
                func.row_number().over(
                    partition_by=ProgramBlock.program_id,
                    order_by=(ProgramBlock.start_date, ProgramBlock.id),
                ).label("rank"),
            ).filter(ProgramBlock.program_id.in_(program_ids)).subquery()
            block_rows = self.db_session.query(ranked_blocks).filter(
                    ranked_blocks.c.rank <= nested_block_limit,
            ).order_by(ranked_blocks.c.program_id, ranked_blocks.c.rank).all()
            block_ids = [row.id for row in block_rows]

            day_rows = []
            if block_ids:
                ranked_days = self.db_session.query(
                    ProgramDay.id.label("id"),
                    ProgramDay.block_id.label("block_id"),
                    ProgramDay.name.label("name"),
                    ProgramDay.date.label("date"),
                    ProgramDay.day_of_week.label("day_of_week"),
                    ProgramDay.completion_min_templates.label("completion_min_templates"),
                    func.row_number().over(
                        partition_by=ProgramDay.block_id,
                        order_by=(ProgramDay.day_number, ProgramDay.id),
                    ).label("rank"),
                ).filter(ProgramDay.block_id.in_(block_ids)).subquery()
                day_rows = self.db_session.query(ranked_days).filter(
                        ranked_days.c.rank <= nested_day_limit,
                ).order_by(ranked_days.c.block_id, ranked_days.c.rank).all()

            day_ids = [row.id for row in day_rows]
            templates_by_day = {}
            template_counts = {}
            if day_ids:
                ranked_templates = self.db_session.query(
                    program_day_templates.c.program_day_id.label("program_day_id"),
                    SessionTemplate.id.label("id"),
                    SessionTemplate.name.label("name"),
                    func.row_number().over(
                        partition_by=program_day_templates.c.program_day_id,
                        order_by=(program_day_templates.c.order, SessionTemplate.id),
                    ).label("rank"),
                ).join(
                    SessionTemplate,
                    SessionTemplate.id == program_day_templates.c.session_template_id,
                ).filter(
                    program_day_templates.c.program_day_id.in_(day_ids),
                    SessionTemplate.deleted_at.is_(None),
                ).subquery()
                template_rows = self.db_session.query(ranked_templates).filter(
                    ranked_templates.c.rank <= nested_template_limit,
                ).order_by(ranked_templates.c.program_day_id, ranked_templates.c.rank).all()
                for row in template_rows:
                    templates_by_day.setdefault(row.program_day_id, []).append(
                        {"id": row.id, "name": row.name}
                    )
                template_counts = dict(self.db_session.query(
                    program_day_templates.c.program_day_id,
                    func.count(),
                ).filter(
                    program_day_templates.c.program_day_id.in_(day_ids),
                ).group_by(program_day_templates.c.program_day_id).all())

            for day in day_rows:
                days_by_block.setdefault(day.block_id, []).append({
                    "id": day.id,
                    "name": day.name,
                    "date": _iso(day.date),
                    "day_of_week": day.day_of_week or [],
                    "completion_min_templates": day.completion_min_templates,
                    "templates": templates_by_day.get(day.id, []),
                        "templates_truncated": template_counts.get(day.id, 0) > nested_template_limit,
                })
            blocks_by_program = {}
            for block in block_rows:
                days = days_by_block.get(block.id, [])
                blocks_by_program.setdefault(block.program_id, []).append({
                    "id": block.id,
                    "name": block.name,
                    "start_date": _iso(block.start_date),
                    "end_date": _iso(block.end_date),
                    "days": days[:nested_day_limit],
                    "days_truncated": len(days) > nested_day_limit,
                })

            for program in detailed_programs:
                blocks = blocks_by_program.get(program.id, [])
                program_context.append({
                    "id": program.id,
                    "name": program.name,
                    "start_date": _iso(program.start_date),
                    "end_date": _iso(program.end_date),
                    "blocks": blocks[:nested_block_limit],
                    "blocks_truncated": len(blocks) > nested_block_limit,
                })
        return {
            "root": {"id": root_id, "name": root.name},
            "goals": {
                "items": goal_items,
                "offset": max(0, goals_offset),
                "next_offset": max(0, goals_offset) + len(goal_items) if len(goals) > goal_page_limit else None,
                "truncated": len(goals) > goal_page_limit,
            },
            "activities": {
                "items": activity_items,
                "offset": max(0, activities_offset),
                "next_offset": max(0, activities_offset) + len(activity_items)
                if len(activities) > activity_page_limit else None,
                "truncated": len(activities) > activity_page_limit,
            },
            "programs": {
                "items": program_context,
                "catalog": {
                    "items": [
                        {"id": row.id, "name": row.name,
                         "start_date": _iso(row.start_date), "end_date": _iso(row.end_date)}
                        for row in programs[:program_page_limit]
                    ],
                    "offset": max(0, programs_offset),
                    "next_offset": max(0, programs_offset) + min(len(programs), program_page_limit)
                    if len(programs) > program_page_limit else None,
                },
                "truncated": len(programs) > program_page_limit,
                "details_truncated": len(programs) > nested_program_limit
                or any(len(blocks_by_program.get(row.id, [])) > nested_block_limit for row in detailed_programs)
                or any(len(days_by_block.get(block.id, [])) > nested_day_limit for block in block_rows)
                or any(count > 5 for count in template_counts.values()),
            },
            "templates": {
                "items": [
                    {"id": row.id, "name": row.name, "description": row.description}
                    for row in templates[:template_page_limit]
                ],
                "offset": max(0, templates_offset),
                "next_offset": max(0, templates_offset) + min(len(templates), template_page_limit)
                if len(templates) > template_page_limit else None,
                "truncated": len(templates) > template_page_limit,
            },
        }

    def get_program_context(
        self, user_id, root_id, *, offset=0, limit=50, program_id=None,
        block_offset=0, block_id=None, day_offset=0, day_id=None,
        templates_offset=0,
    ):
        """Page program entities and resolve selected descendants by scoped ID."""
        root = self._root(root_id, user_id)
        page_size = min(100, max(1, int(limit or 50)))
        offset = max(0, int(offset or 0))
        programs_query = self.db_session.query(Program).filter_by(root_id=root_id).order_by(
            Program.start_date, Program.id,
        )
        if program_id:
            programs_query = programs_query.filter(Program.id == program_id)
            if not programs_query.first():
                raise AgentHarnessError("Program is not available in this fractal", 404, "not_found")
        else:
            programs_query = programs_query.offset(offset)
        programs = programs_query.limit(page_size + 1).all()
        has_more_programs = len(programs) > page_size
        programs = programs[:page_size]

        def program_item(row):
            return {
                "id": row.id,
                "name": row.name,
                "description": row.description,
                "start_date": _iso(row.start_date),
                "end_date": _iso(row.end_date),
            }

        result = {
            "root": {"id": root_id, "name": root.name},
            "items": [program_item(row) for row in programs],
            "offset": offset,
            "next_offset": offset + len(programs) if has_more_programs else None,
            "selected": None,
        }
        if not program_id:
            return result

        program = programs[0]
        blocks_query = self.db_session.query(ProgramBlock).filter_by(
            program_id=program.id,
        ).order_by(ProgramBlock.start_date, ProgramBlock.id)
        selected_block = None
        if block_id:
            selected_block = blocks_query.filter(ProgramBlock.id == block_id).first()
            if not selected_block:
                raise AgentHarnessError("Block is not available in this program", 404, "not_found")
        blocks = blocks_query.offset(max(0, int(block_offset or 0))).limit(page_size + 1).all()
        has_more_blocks = len(blocks) > page_size
        blocks = blocks[:page_size]
        selected = {
            "program": program_item(program),
            "blocks": {
                "items": [{
                    "id": row.id, "name": row.name,
                    "start_date": _iso(row.start_date), "end_date": _iso(row.end_date),
                } for row in blocks],
                "offset": max(0, int(block_offset or 0)),
                "next_offset": max(0, int(block_offset or 0)) + len(blocks) if has_more_blocks else None,
            },
        }
        result["selected"] = selected
        if not block_id:
            return result

        days_query = self.db_session.query(ProgramDay).filter_by(
            block_id=selected_block.id,
        ).order_by(ProgramDay.day_number, ProgramDay.id)
        selected_day = None
        if day_id:
            selected_day = days_query.filter(ProgramDay.id == day_id).first()
            if not selected_day:
                raise AgentHarnessError("Day is not available in this block", 404, "not_found")
        days = days_query.offset(max(0, int(day_offset or 0))).limit(page_size + 1).all()
        has_more_days = len(days) > page_size
        days = days[:page_size]
        selected["block"] = {
            "id": selected_block.id,
            "name": selected_block.name,
            "days": {
                "items": [{
                    "id": row.id, "name": row.name, "day_number": row.day_number,
                    "date": _iso(row.date), "day_of_week": row.day_of_week or [],
                } for row in days],
                "offset": max(0, int(day_offset or 0)),
                "next_offset": max(0, int(day_offset or 0)) + len(days) if has_more_days else None,
            },
        }
        if not day_id:
            return result

        template_query = self.db_session.query(
            SessionTemplate.id,
            SessionTemplate.name,
            SessionTemplate.description,
            program_day_templates.c.order,
            program_day_templates.c.is_required,
        ).join(
            program_day_templates,
            program_day_templates.c.session_template_id == SessionTemplate.id,
        ).filter(
            program_day_templates.c.program_day_id == selected_day.id,
            SessionTemplate.root_id == root_id,
            SessionTemplate.deleted_at.is_(None),
        ).order_by(program_day_templates.c.order, SessionTemplate.name, SessionTemplate.id)
        templates = template_query.offset(max(0, int(templates_offset or 0))).limit(page_size + 1).all()
        has_more_templates = len(templates) > page_size
        templates = templates[:page_size]
        selected["day"] = {
            "id": selected_day.id,
            "name": selected_day.name,
            "day_number": selected_day.day_number,
            "date": _iso(selected_day.date),
            "templates": {
                "items": [{
                    "id": row.id, "name": row.name, "description": row.description,
                    "order": row.order, "is_required": bool(row.is_required),
                } for row in templates],
                "offset": max(0, int(templates_offset or 0)),
                "next_offset": max(0, int(templates_offset or 0)) + len(templates)
                if has_more_templates else None,
            },
        }
        return result

    def list_templates(self, user_id, root_id, *, offset=0, limit=100):
        """Page reusable templates within one owned fractal."""
        root = self._root(root_id, user_id)
        page_size = min(100, max(1, int(limit or 100)))
        offset = max(0, int(offset or 0))
        rows = self.db_session.query(SessionTemplate).filter(
            SessionTemplate.root_id == root_id,
            SessionTemplate.archived_at.is_(None),
            SessionTemplate.deleted_at.is_(None),
        ).order_by(SessionTemplate.name, SessionTemplate.id).offset(offset).limit(page_size + 1).all()
        has_more = len(rows) > page_size
        return {
            "root": {"id": root_id, "name": root.name},
            "items": [{
                "id": row.id, "name": row.name, "description": row.description,
            } for row in rows[:page_size]],
            "offset": offset,
            "next_offset": offset + min(len(rows), page_size) if has_more else None,
        }
    @staticmethod
    def serialize_task(task):
        return {
            "id": task.id,
            "root_id": task.root_id,
            "request_text": task.request_text,
            "context": task.context,
            "timezone": task.timezone,
            "limits": task.limits,
            "status": task.status,
            "expires_at": _iso(task.expires_at),
            "created_at": _iso(task.created_at),
        }
    def _get_task_row(self, user_id, task_id):
        task = self.db_session.query(AgentTaskBrief).filter(
            AgentTaskBrief.id == task_id,
            AgentTaskBrief.user_id == user_id,
            AgentTaskBrief.expires_at > utc_now(),
        ).first()
        if not task:
            raise AgentHarnessError("Task not found or expired", 404, "not_found")
        return task
    def create_task(self, user_id, data, *, grant_id=None, execution_origin="first_party", commit=True):
        brief = AgentTaskBriefSchema.model_validate(data)
        self._root(brief.root_id, user_id)
        grant = self._grant(grant_id or brief.grant_id, user_id, brief.root_id)
        if grant:
            execution_origin = "connector"
        if execution_origin not in {
            "first_party", "connector", "embedded_openai", "embedded_anthropic",
        }:
            raise AgentHarnessError("Unsupported trusted task origin", 400, "invalid_origin")
        try:
            ZoneInfo(brief.timezone)
        except ZoneInfoNotFoundError as error:
            raise AgentHarnessError("timezone must be a valid IANA timezone", 400, "invalid_timezone") from error
        if len(brief.context) > 4:
            raise AgentHarnessError("Task context or limits exceed the allowed size")
        if len(_canonical_json(brief.context).encode("utf-8")) > 16_384:
            raise AgentHarnessError("Task context is too large")
        allowed_context = {"goal_ids", "activity_ids", "program_ids", "template_ids"}
        if set(brief.context) - allowed_context:
            raise AgentHarnessError("Task context contains unsupported entity references")
        context_models = {
            "goal_ids": (Goal, Goal.root_id),
            "activity_ids": (ActivityDefinition, ActivityDefinition.root_id),
            "program_ids": (Program, Program.root_id),
            "template_ids": (SessionTemplate, SessionTemplate.root_id),
        }
        for key, ids in brief.context.items():
            if not isinstance(ids, list) or len(ids) > 25 or any(not isinstance(item, str) for item in ids):
                raise AgentHarnessError(f"{key} must be a list of at most 25 entity IDs")
            model, root_column = context_models[key]
            query = self.db_session.query(model.id).filter(
                model.id.in_(ids),
                root_column == brief.root_id,
            )
            if hasattr(model, "deleted_at"):
                query = query.filter(model.deleted_at.is_(None))
            if hasattr(model, "archived_at"):
                query = query.filter(model.archived_at.is_(None))
            found = {row[0] for row in query.all()}
            if found != set(ids):
                raise AgentHarnessError(f"{key} contains an unavailable or out-of-scope entity")
        normalized_limits = brief.limits.model_dump()
        task = AgentTaskBrief(
            user_id=user_id,
            grant_id=grant.id if grant else None,
            root_id=brief.root_id,
            execution_origin=execution_origin,
            request_text=brief.request_text,
            context=brief.context,
            timezone=brief.timezone,
            limits=normalized_limits,
            status="open",
            expires_at=utc_now() + dt.timedelta(hours=TASK_TTL_HOURS),
        )
        self.db_session.add(task)
        if commit:
            self.db_session.commit()
        else:
            self.db_session.flush()
        return self.serialize_task(task)
    def get_task(self, user_id, task_id, *, grant_id=None, allowed_roots=None):
        task = self.db_session.query(AgentTaskBrief).filter(
            AgentTaskBrief.id == task_id,
            AgentTaskBrief.user_id == user_id,
            AgentTaskBrief.expires_at > utc_now(),
        ).first()
        if not task:
            raise AgentHarnessError("Task not found or expired", 404, "not_found")
        if allowed_roots is not None and task.root_id not in allowed_roots:
            raise AgentHarnessError("Task is outside the AI connection's allowed scope", 403, "root_forbidden")
        if grant_id:
            self._grant(grant_id, user_id, task.root_id)
            if task.grant_id and task.grant_id != grant_id:
                raise AgentHarnessError("Task belongs to another AI connection", 403, "grant_mismatch")
            if not task.grant_id:
                task.grant_id = grant_id
                self.db_session.commit()
        return self.serialize_task(task)
