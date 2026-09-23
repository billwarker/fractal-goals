"""Program-scoped calendar summary and day-detail read model."""

from collections import defaultdict
import base64
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import selectinload
from models import Program, ProgramDayStatusOverride, Session, validate_root_goal
from services.program_day_credits import (
    effective_session_timestamp,
    load_program_credit_candidates,
    load_program_session_credits,
    local_date_utc_bounds,
)
from services.program_day_occurrences import (
    build_day_facts,
    date_part,
    effective_session_date,
    program_day_explicitly_scheduled_on,
    summarize_chain_facts,
)
from services.calendar_periods import load_calendar_periods, serialize_calendar_period
from services.program_day_summary import session_alignment
from services.program_metrics_service import MAX_WINDOW_DAYS, ProgramMetricsService
from services.program_scope import resolve_program_scope
from services.programs import ProgramService
from services.session_filters import resolve_timezone, session_duration_seconds_from_row
from services.session_runtime import get_session_template_color, get_session_template_name, get_template_color


class ProgramDayReadModelService:
    SCHEMA_VERSION = 5
    CHAIN_LOOKBACK_DAYS = MAX_WINDOW_DAYS
    # A hard safety bound for one local date; the summary covers every loaded
    # session while the session list itself is cursor-paged.
    MAX_DETAIL_DAY_SESSIONS = 500

    def __init__(self, db_session):
        self.db_session = db_session

    @staticmethod
    def _parse_date(value):
        try:
            return date.fromisoformat(str(value)) if value else None
        except ValueError:
            return None

    def get(self, root_id, program_id, current_user_id, *, range_start, range_end,
            timezone_name, detail_date=None, session_limit=50, session_cursor=None):
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404
        zone = resolve_timezone(timezone_name)
        if zone is None:
            return None, "Invalid timezone", 400
        start = self._parse_date(range_start)
        end = self._parse_date(range_end)
        detail = self._parse_date(detail_date)
        if not start or not end or start > end or (end - start).days + 1 > MAX_WINDOW_DAYS:
            return None, "Invalid date range", 400
        if detail_date and (not detail or detail < start or detail > end):
            return None, "Invalid detail date", 400
        try:
            limit = int(session_limit or 50)
        except (TypeError, ValueError):
            return None, "Invalid session limit", 400
        if limit < 1 or limit > 100:
            return None, "Invalid session limit", 400
        try:
            cursor_offset = self._decode_cursor(session_cursor)
        except ValueError:
            return None, "Invalid session cursor", 400
        if cursor_offset and not detail:
            return None, "Session cursor requires detail date", 400

        program = self.db_session.query(Program).options(
            *ProgramService._program_serializer_load_options()
        ).filter(Program.id == program_id, Program.root_id == root_id).first()
        if not program:
            return None, "Program not found", 404

        program_start = date_part(program.start_date) or start
        program_end = date_part(program.end_date) or end
        chain_start, chain_end, chain_context_truncated = self._resolve_chain_window(
            program_start, program_end, start, end
        )
        session_credits = load_program_session_credits(
            self.db_session, [program.id], chain_start, chain_end,
        )[program.id]
        utc_start, utc_end = local_date_utc_bounds(chain_start, chain_end, zone)
        sessions = load_program_credit_candidates(
            self.db_session, root_id, current_user_id, [program], utc_start, utc_end,
            {program.id: session_credits},
        )[program.id]
        status_overrides = self.db_session.query(ProgramDayStatusOverride).filter(
            ProgramDayStatusOverride.program_id == program_id,
            ProgramDayStatusOverride.date >= chain_start,
            ProgramDayStatusOverride.date <= chain_end,
        ).all()
        periods = load_calendar_periods(self.db_session, root_id, current_user_id, chain_start, chain_end)
        scope = resolve_program_scope(self.db_session, root_id, program_id)
        range_evidence, goals_by_id = ProgramMetricsService(self.db_session).load_resolved_evidence(
            root_id, current_user_id, zone, scope.goal_ids,
            start=start, end=min(end, datetime.now(zone).date()),
        )
        aligned_evidence = [item for item in range_evidence if item["in_scope_ids"]]
        local_today = datetime.now(zone).date()
        all_facts = build_day_facts(
            program, chain_start, chain_end, sessions, aligned_evidence, zone, local_today,
            status_overrides=status_overrides, session_credits=session_credits, periods=periods,
        )
        facts = [item for item in all_facts if start <= item["date"] <= end]
        completed_by_date = self._load_completed_sessions_by_date(
            root_id, current_user_id, start, min(end, local_today), zone,
        )
        payload = self._summary(program, facts, start, end, timezone_name, completed_by_date)
        payload["periods"] = [
            serialize_calendar_period(period) for period in periods
            if period.start_date <= end and period.end_date >= start
        ]
        payload["chain"]["context_start"] = chain_start.isoformat()
        payload["chain"]["context_truncated_before"] = chain_context_truncated
        previous = next((item for item in all_facts if item["date"] == start - timedelta(days=1)), None)
        following = next((item for item in all_facts if item["date"] == end + timedelta(days=1)), None)
        payload["chain"]["continues_before_range"] = bool(
            previous and previous["run_length_at_date"] and facts
            and not facts[0]["breaks_chain"]
        )
        payload["chain"]["continues_after_range"] = bool(
            following and not following["breaks_chain"]
            and facts and facts[-1]["run_length_at_date"]
        )
        if detail:
            payload["detail"] = self._detail(
                root_id, current_user_id, program, facts, detail, zone, limit, cursor_offset,
                scope_goal_ids=scope.goal_ids, local_today=local_today, goals_by_id=goals_by_id,
            )
        return payload, None, 200

    @classmethod
    def _resolve_chain_window(cls, program_start, program_end, start, end):
        """Bound the complete expanded chain window, including forward context."""
        requested_days = (end - start).days + 1
        forward_days = int(program_end > end and requested_days < MAX_WINDOW_DAYS)
        chain_end = end + timedelta(days=forward_days)
        available_lookback = max(0, MAX_WINDOW_DAYS - requested_days - forward_days)
        lookback_days = min(cls.CHAIN_LOOKBACK_DAYS, available_lookback)
        chain_start = max(program_start, start - timedelta(days=lookback_days))
        return chain_start, chain_end, program_start < chain_start

    def _summary(self, program, facts, start, end, timezone_name, completed_by_date):
        chain_summary = summarize_chain_facts(facts)
        template_stats = defaultdict(lambda: {
            "name": "Deleted template", "color": None,
            "scheduled_occurrences": 0, "completed_occurrences": 0,
        })
        goals_touched = set()
        days = []
        range_run = longest_range_run = 0
        for fact in facts:
            if fact["counts_as_success"]:
                range_run += 1
                longest_range_run = max(longest_range_run, range_run)
            elif fact["breaks_chain"]:
                range_run = 0
            linked_sessions = [session for row in fact["occurrences"] for session in row["sessions"]]
            block_ids = sorted({row["block"].id for row in fact["occurrences"]})
            for evidence in fact["aligned_items"]:
                goals_touched.update(evidence["in_scope_ids"])
            for occurrence in fact["occurrences"]:
                goals_touched.update(goal.id for goal in occurrence["program_day"].goals or [])
                completed = set(occurrence["evaluation"]["completed_template_ids"])
                for rule in occurrence["program_day"].template_links or []:
                    template = rule.template
                    if template is None or getattr(template, "deleted_at", None):
                        continue
                    row = template_stats[template.id]
                    row["name"] = template.name
                    row["color"] = get_template_color(template.template_data)
                    row["scheduled_occurrences"] += 1
                    row["completed_occurrences"] += int(template.id in completed)
            days.append({
                key: (value.isoformat() if key == "date" else value)
                for key, value in fact.items()
                if key not in {"occurrences", "aligned_items", "date_evaluation"}
            } | {
                "occurrence_count": len(fact["occurrences"]),
                "duration_seconds": sum(
                    session_duration_seconds_from_row(
                        item.total_duration_seconds, item.duration_minutes,
                        item.session_start, item.session_end,
                    ) for item in linked_sessions
                ),
                "aligned_instance_count": len(fact["aligned_items"]),
                "block_ids": block_ids,
                "completed_sessions": [
                    self._serialize_calendar_session(item)
                    for item in completed_by_date.get(fact["date"], [])
                ],
            })
        closed_scheduled = [
            item for item in facts
            if item["counts_toward_adherence"]
            and (item["closed"] or item["counts_as_success"])
        ]
        return {
            "schema_version": self.SCHEMA_VERSION,
            "program_id": program.id,
            "timezone": timezone_name,
            "range": {"start": start.isoformat(), "end": end.isoformat()},
            "chain": {
                "current_streak": chain_summary["current_streak"],
                "longest_streak": chain_summary["longest_streak"],
                "continues_before_range": False,
                "continues_after_range": False,
            },
            "range_summary": {
                "scheduled_dates": sum(item["scheduled"] for item in facts),
                "adherence_eligible_dates": sum(item["counts_toward_adherence"] for item in facts),
                "met_dates": sum(item["state"] == "scheduled_met" for item in facts),
                "partial_dates": sum(item["state"] == "scheduled_partial" for item in facts),
                "missed_dates": sum(item["state"] == "scheduled_missed" for item in facts),
                "pending_dates": sum(item["state"] == "scheduled_pending" for item in facts),
                "evidence_dates": sum(item["state"] == "unscheduled_evidence" for item in facts),
                "rest_dates": sum(item["state"] == "rest" for item in facts),
                "upcoming_dates": sum(item["state"] == "upcoming" for item in facts),
                "manual_complete_dates": sum(item["manual_status"] == "complete" for item in facts),
                "manual_rest_dates": sum(item["manual_status"] == "rest" for item in facts),
                "period_rest_dates": sum(item["status_source"] == "period" for item in facts),
                "closed_scheduled_dates": len(closed_scheduled),
                "chain_breaks": chain_summary["chain_breaks"],
                "longest_run_in_range": longest_range_run,
                "linked_duration_seconds": sum(item["duration_seconds"] for item in days),
                "template_completion": [
                    {"template_id": template_id, **values}
                    for template_id, values in sorted(template_stats.items())
                ],
                "goals_touched_ids": sorted(goals_touched),
            },
            "days": days,
        }

    def _detail(self, root_id, current_user_id, program, facts, detail_date, zone, limit, offset,
                *, scope_goal_ids, local_today, goals_by_id=None):
        fact = next((item for item in facts if item["date"] == detail_date), None)
        occurrence_rows = fact["occurrences"] if fact else []
        credit_facts = fact["session_credits"] if fact else {}
        day_sessions = self._load_day_sessions(root_id, current_user_id, detail_date, zone)
        evidence, _goals_by_id = ProgramMetricsService(self.db_session).load_resolved_evidence(
            root_id, current_user_id, zone, scope_goal_ids,
            session_ids=[session.id for session in day_sessions], goals_by_id=goals_by_id,
        )
        evidence_by_session = defaultdict(list)
        for item in evidence:
            evidence_by_session[item["session_id"]].append(item)
        date_evaluation = fact["date_evaluation"] if fact else None
        can_edit_credits = bool(fact and fact["scheduled"] and detail_date <= local_today)
        credit_options = self._credit_options(occurrence_rows, date_evaluation) if can_edit_credits else []

        page = day_sessions[offset:offset + limit]
        has_more = len(day_sessions) > offset + len(page)
        occurrences = []
        for row in occurrence_rows:
            day = row["program_day"]
            completed_ids = set(row["evaluation"]["completed_template_ids"])
            occurrences.append({
                "occurrence_key": f"{day.id}:{detail_date.isoformat()}",
                "program_day_id": day.id,
                "scheduled_explicitly": program_day_explicitly_scheduled_on(day, row["block"], detail_date),
                "block": {"id": row["block"].id, "name": row["block"].name, "color": row["block"].color},
                "name": day.name,
                "definition_note": day.notes,
                "goal_ids": [goal.id for goal in day.goals or []],
                "requirements": row["evaluation"],
                "templates": [
                    {
                        "id": rule.session_template_id,
                        "name": rule.template.name,
                        "description": rule.template.description,
                        "color": get_template_color(rule.template.template_data),
                        "is_required": bool(rule.is_required),
                        "order": rule.order or 0,
                        "status": "completed" if rule.session_template_id in completed_ids else (
                            "in_progress" if any(
                                entry["template_id"] == rule.session_template_id
                                and not entry["session"].completed
                                for entry in row["credits"]
                            ) else "pending"
                        ),
                    } for rule in day.template_links or [] if rule.template is not None
                ],
                "credits": [
                    {
                        "session_id": entry["session"].id,
                        "template_id": entry["template_id"],
                        "source": entry["source"],
                    } for entry in row["credits"]
                ],
            })
        return {
            "date": detail_date.isoformat(),
            "state": fact["state"] if fact else None,
            "automatic_state": fact["automatic_state"] if fact else None,
            "status_source": fact["status_source"] if fact else "automatic",
            "manual_status": fact["manual_status"] if fact else None,
            "scheduled": fact["scheduled"] if fact else False,
            "completed_template_count": fact["completed_template_count"] if fact else 0,
            "requirements": date_evaluation,
            "occurrences": occurrences,
            "can_edit_credits": can_edit_credits,
            "sessions": [
                self._serialize_day_session(
                    session, program.id, credit_facts.get(session.id),
                    evidence_by_session[session.id], credit_options,
                ) for session in page
            ],
            "sessions_page": {
                "limit": limit,
                "returned": len(page),
                "has_more": has_more,
                "next_cursor": self._encode_cursor(offset + len(page)) if has_more else None,
            },
        }

    @staticmethod
    def _credit_options(occurrence_rows, date_evaluation):
        """Scheduled templates still outstanding on the date, in schedule order."""
        completed = set((date_evaluation or {}).get("completed_template_ids") or [])
        options = {}
        for row in occurrence_rows:
            for rule in sorted(row["program_day"].template_links or [], key=lambda item: item.order or 0):
                template = rule.template
                if template is None or getattr(template, "deleted_at", None):
                    continue
                if rule.session_template_id in completed or rule.session_template_id in options:
                    continue
                options[rule.session_template_id] = {
                    "template_id": rule.session_template_id,
                    "name": template.name,
                    "color": get_template_color(template.template_data),
                }
        return list(options.values())

    @classmethod
    def _serialize_day_session(cls, session, program_id, credit_fact, evidence, credit_options):
        relation = cls._session_relation(session, program_id, credit_fact)
        credited = relation == "credited"
        return {
            **cls._serialize_session(session),
            "program_id": session.program_id,
            "relation": relation,
            "credit": {
                "source": credit_fact["source"],
                "template_id": credit_fact["template_id"],
                "program_day_ids": credit_fact["program_day_ids"],
            } if credited else None,
            "excluded": bool(credit_fact and credit_fact["excluded"]),
            "alignment": session_alignment(evidence),
            "credit_options": credit_options if session.completed and not credited else [],
        }

    @staticmethod
    def _encode_cursor(offset):
        return base64.urlsafe_b64encode(f"sessions:{offset}".encode()).decode().rstrip("=")

    @staticmethod
    def _decode_cursor(cursor):
        if not cursor:
            return 0
        try:
            padded = str(cursor) + "=" * (-len(str(cursor)) % 4)
            raw = base64.urlsafe_b64decode(padded.encode()).decode()
            prefix, value = raw.split(":", 1)
            offset = int(value)
            if prefix != "sessions" or offset < 0:
                raise ValueError
            return offset
        except (ValueError, UnicodeDecodeError, base64.binascii.Error) as exc:
            raise ValueError("Invalid cursor") from exc

    def _load_completed_sessions_by_date(self, root_id, current_user_id, start, end, zone):
        """Completed sessions of the owner in any program, bucketed by local date."""
        grouped = defaultdict(list)
        if end < start:
            return grouped
        utc_start, utc_end = local_date_utc_bounds(start, end, zone)
        effective = effective_session_timestamp()
        rows = self.db_session.query(Session).options(selectinload(Session.template)).filter(
            Session.root_id == root_id,
            Session.owner_id == current_user_id,
            Session.deleted_at.is_(None),
            Session.completed.is_(True),
            effective >= utc_start,
            effective < utc_end,
        ).order_by(effective.asc(), Session.id.asc()).all()
        for session in rows:
            grouped[effective_session_date(session, zone)].append(session)
        return grouped

    @staticmethod
    def _session_relation(session, program_id, credit_fact):
        if credit_fact and credit_fact["source"] and not credit_fact["excluded"]:
            return "credited"
        if session.program_id and session.program_id != program_id:
            return "other_program"
        return "off_plan"

    @staticmethod
    def _serialize_calendar_session(session):
        """Compact calendar projection; the day detail carries full session facts."""
        return {"id": session.id, "name": get_session_template_name(session) or session.name}

    def _load_day_sessions(self, root_id, current_user_id, day_value, zone):
        """Every non-deleted session of the owner on one local date, in any program."""
        start, end = local_date_utc_bounds(day_value, day_value, zone)
        effective = effective_session_timestamp()
        return self.db_session.query(Session).options(selectinload(Session.template)).filter(
            Session.root_id == root_id,
            Session.owner_id == current_user_id,
            Session.deleted_at.is_(None),
            effective >= start,
            effective < end,
        ).order_by(effective.asc(), Session.id.asc()).limit(self.MAX_DETAIL_DAY_SESSIONS).all()

    @staticmethod
    def _serialize_session(session):
        template_name = get_session_template_name(session)
        template_color = get_session_template_color(session)
        session_start = session.session_start
        if session_start and session_start.tzinfo is None:
            session_start = session_start.replace(tzinfo=timezone.utc)
        completed_at = session.completed_at
        if completed_at and completed_at.tzinfo is None:
            completed_at = completed_at.replace(tzinfo=timezone.utc)
        session_end = session.session_end
        if session_end and session_end.tzinfo is None:
            session_end = session_end.replace(tzinfo=timezone.utc)
        return {
            "id": session.id,
            "name": session.name,
            "template_id": session.template_id,
            "template": {
                "id": session.template_id,
                "name": template_name or session.name,
                "color": template_color,
            } if session.template_id else None,
            "program_day_id": session.program_day_id,
            "session_start": session_start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if session_start else None,
            "session_end": session_end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if session_end else None,
            "completed_at": completed_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if completed_at else None,
            "total_duration_seconds": session_duration_seconds_from_row(
                session.total_duration_seconds, session.duration_minutes,
                session.session_start, session.session_end,
            ),
            "completed": bool(session.completed),
            "is_paused": bool(session.is_paused),
        }
