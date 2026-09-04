"""Program-scoped calendar summary and day-detail read model."""

from collections import defaultdict
import base64
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload
from models import Program, Session, validate_root_goal
from services.program_day_occurrences import build_day_facts, date_part, summarize_chain_facts
from services.program_metrics_service import MAX_WINDOW_DAYS, ProgramMetricsService
from services.program_scope import resolve_program_scope
from services.programs import ProgramService
from services.session_filters import resolve_timezone, session_duration_seconds_from_row
from services.session_runtime import get_session_template_color, get_session_template_name, get_template_color


class ProgramDayReadModelService:
    SCHEMA_VERSION = 2
    CHAIN_LOOKBACK_DAYS = MAX_WINDOW_DAYS

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
        sessions = self._load_sessions(
            root_id, program_id, current_user_id, chain_start, chain_end, zone,
        )
        scope = resolve_program_scope(self.db_session, root_id, program_id)
        aligned_evidence = self._load_aligned_evidence(
            root_id, current_user_id, start, min(end, datetime.now(zone).date()), zone, scope.goal_ids
        )
        local_today = datetime.now(zone).date()
        all_facts = build_day_facts(
            program, chain_start, chain_end, sessions, aligned_evidence, zone, local_today
        )
        facts = [item for item in all_facts if start <= item["date"] <= end]
        payload = self._summary(program, facts, start, end, timezone_name)
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
                root_id, current_user_id, program, facts, detail, zone, limit, cursor_offset
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

    def _load_sessions(self, root_id, program_id, current_user_id, start, end, zone):
        utc_start = datetime.combine(start, time.min, tzinfo=zone).astimezone(timezone.utc)
        utc_end = datetime.combine(end + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc)
        effective = func.coalesce(Session.session_start, Session.completed_at, Session.created_at)
        return self.db_session.query(Session).options(selectinload(Session.template)).filter(
            Session.root_id == root_id,
            Session.owner_id == current_user_id,
            Session.program_id == program_id,
            Session.deleted_at.is_(None),
            effective >= utc_start,
            effective < utc_end,
        ).order_by(effective.asc(), Session.id.asc()).all()

    def _load_aligned_evidence(self, root_id, current_user_id, start, end, zone, scope_ids):
        if end < start:
            return []
        return ProgramMetricsService(self.db_session).load_aligned_evidence(
            root_id, current_user_id, start, end, zone, scope_ids
        )

    def _summary(self, program, facts, start, end, timezone_name):
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
            })
        closed_scheduled = [item for item in facts if item["scheduled"] and (item["closed"] or item["counts_as_success"])]
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
                "met_dates": sum(item["state"] == "scheduled_met" for item in facts),
                "partial_dates": sum(item["state"] == "scheduled_partial" for item in facts),
                "missed_dates": sum(item["state"] == "scheduled_missed" for item in facts),
                "pending_dates": sum(item["state"] == "scheduled_pending" for item in facts),
                "evidence_dates": sum(item["state"] == "unscheduled_evidence" for item in facts),
                "rest_dates": sum(item["state"] == "rest" for item in facts),
                "upcoming_dates": sum(item["state"] == "upcoming" for item in facts),
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

    def _detail(self, root_id, current_user_id, program, facts, detail_date, zone, limit, offset):
        fact = next((item for item in facts if item["date"] == detail_date), None)
        occurrence_rows = fact["occurrences"] if fact else []
        linked_entries = [
            (session, row["program_day"].id)
            for row in occurrence_rows for session in row["sessions"]
        ]
        other_rows = self._load_other_sessions(
            root_id, current_user_id, program.id, detail_date, zone, offset + limit + 1
        )
        page, has_more = self._paginate_session_entries(
            linked_entries, other_rows, offset, limit
        )
        selected_ids = {session.id for session, _day_id in page}
        occurrences = []
        if fact:
            for row in occurrence_rows:
                day = row["program_day"]
                sessions = [
                    self._serialize_session(session)
                    for session in row["sessions"] if session.id in selected_ids
                ]
                completed_ids = set(row["evaluation"]["completed_template_ids"])
                occurrences.append({
                    "occurrence_key": f"{day.id}:{detail_date.isoformat()}",
                    "program_day_id": day.id,
                    "block": {"id": row["block"].id, "name": row["block"].name, "color": row["block"].color},
                    "name": day.name,
                    "definition_note": day.notes,
                    "goal_ids": [goal.id for goal in day.goals or []],
                    "requirements": row["evaluation"],
                    "templates": [
                        {
                            "id": rule.session_template_id,
                            "name": rule.template.name if rule.template else "Deleted template",
                            "description": rule.template.description if rule.template else None,
                            "color": get_template_color(rule.template.template_data) if rule.template else None,
                            "is_required": bool(rule.is_required),
                            "order": rule.order or 0,
                            "status": "completed" if rule.session_template_id in completed_ids else (
                                "in_progress" if any(
                                    session.template_id == rule.session_template_id and not session.completed
                                    for session in row["sessions"]
                                ) else "pending"
                            ),
                        } for rule in day.template_links or [] if rule.template is not None
                    ],
                    "sessions": sessions,
                })
        other = [session for session, day_id in page if day_id is None]
        goals_touched = set()
        if fact:
            for evidence in fact["aligned_items"]:
                goals_touched.update(evidence["in_scope_ids"])
        return {
            "date": detail_date.isoformat(),
            "requirements": fact["date_evaluation"] if fact else None,
            "occurrences": occurrences,
            "other_sessions": [self._serialize_session(item) for item in other],
            "goals_touched_ids": sorted(goals_touched),
            "sessions_page": {
                "limit": limit,
                "returned": len(page),
                "has_more": has_more,
                "next_cursor": self._encode_cursor(offset + len(page)) if has_more else None,
            },
        }

    @staticmethod
    def _encode_cursor(offset):
        return base64.urlsafe_b64encode(f"sessions:{offset}".encode()).decode().rstrip("=")

    @staticmethod
    def _session_sort_key(session):
        value = session.session_start or session.completed_at or session.created_at
        if value and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return (value or datetime.min.replace(tzinfo=timezone.utc), session.id)

    @classmethod
    def _paginate_session_entries(cls, linked_entries, other_rows, offset, limit):
        """Page two independently ordered streams without dropping either source.

        The caller loads the first ``offset + limit + 1`` rows of the other stream.
        No later row from that sorted stream can enter the same prefix after merging,
        even when every linked row sorts ahead of it.
        """
        entries = list(linked_entries) + [(session, None) for session in other_rows]
        entries.sort(key=lambda entry: cls._session_sort_key(entry[0]))
        page = entries[offset:offset + limit]
        return page, len(entries) > offset + len(page)

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

    def _load_other_sessions(self, root_id, current_user_id, program_id, day_value, zone, limit):
        if limit <= 0:
            return []
        start = datetime.combine(day_value, time.min, tzinfo=zone).astimezone(timezone.utc)
        end = datetime.combine(day_value + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc)
        effective = func.coalesce(Session.session_start, Session.completed_at, Session.created_at)
        return self.db_session.query(Session).options(selectinload(Session.template)).filter(
            Session.root_id == root_id,
            Session.owner_id == current_user_id,
            Session.deleted_at.is_(None),
            or_(Session.program_id.is_(None), Session.program_id != program_id),
            effective >= start,
            effective < end,
        ).order_by(effective.asc(), Session.id.asc()).limit(limit).all()

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
