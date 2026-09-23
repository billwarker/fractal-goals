"""Fixed, program-native metrics built on governed analytics datasets."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
import logging
import time as time_module
from sqlalchemy.orm import joinedload

from models import ActivityInstance, Program, ProgramBlock, ProgramDay, ProgramDayTemplate, Session, Target, validate_root_goal
from services.analytics_engine import build_scoped_dataset_query, get_analytics_dataset
from services.calendar_periods import load_calendar_periods, serialize_calendar_period
from services.effective_goal_activities import resolve_effective_goals_by_activity
from services.goal_contribution import resolve_contribution_goal
from services.goal_loading import load_fractal_goals_for_serialization
from services.goal_type_utils import get_canonical_goal_type
from services.program_scope import resolve_program_scope, resolve_program_scopes
from services.program_day_credits import (
    completed_credits_by_occurrence_template,
    credited_block_ids_by_session,
    load_program_credit_candidates,
    load_program_session_credits,
    local_date_utc_bounds,
)
from services.program_day_occurrences import build_day_facts, summarize_chain_facts
from services.program_day_summary import allocate_equal_split
from services.program_status_override_queries import load_program_status_overrides
from services.serializers import calculate_smart_status
from services.session_filters import resolve_timezone, session_duration_seconds_from_row
from services.session_runtime import get_template_color
from services.service_types import JsonDict, ServiceResult


logger = logging.getLogger(__name__)
MAX_WINDOW_DAYS = 366
CALCULATION_VERSION = 6
MINIMUM_SUFFICIENCY_DAYS = 7


def _date_part(value) -> date | None:
    if value is None:
        return None
    return value.date() if isinstance(value, datetime) else value


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _local_date(value: datetime | None, zone) -> date | None:
    value = _as_utc(value)
    return value.astimezone(zone).date() if value else None


def _iter_dates(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _rate(numerator, denominator):
    return round(numerator / denominator, 6) if denominator else None


class ProgramMetricsService:
    def __init__(self, db_session):
        self.db_session = db_session

    @staticmethod
    def _read_options():
        days = joinedload(Program.blocks).joinedload(ProgramBlock.days)
        return (
            days.selectinload(ProgramDay.template_links).joinedload(ProgramDayTemplate.template),
            days.selectinload(ProgramDay.templates),
        )

    def load_resolved_evidence(
        self, root_id, current_user_id, zone, scope_ids, *,
        start=None, end=None, session_ids=None, goals_by_id=None,
    ):
        """Return all completed activity evidence resolved against a program scope.

        Select either a local-date window (``start``/``end``) or explicit
        ``session_ids``. Returns ``(resolved_items, goals_by_id)`` so callers can
        reuse the loaded goal graph for a second resolution; ``goals_by_id`` stays
        ``None`` when no evidence required loading it.
        """
        if session_ids is not None:
            rows = self._evidence_query(root_id, current_user_id).filter(
                ActivityInstance.session_id.in_(list(session_ids))
            ).all() if session_ids else []
        else:
            window = {"observation_start": start, "observation_end": end}
            rows = self._load_evidence(root_id, current_user_id, window, zone) if start and end and start <= end else []
        if not rows:
            return [], goals_by_id
        if goals_by_id is None:
            goals_by_id = load_fractal_goals_for_serialization(
                self.db_session, root_id, include_group_activities=True
            )
        activity_ids = {row.activity_definition_id for row in rows if row.activity_definition_id}
        effective_goals = resolve_effective_goals_by_activity(goals_by_id, activity_ids)
        return self._resolve_evidence(rows, effective_goals, goals_by_id, scope_ids, zone), goals_by_id

    def get_program_metrics(
        self,
        root_id,
        program_id,
        current_user_id,
        *,
        timezone_name=None,
        range_start=None,
        range_end=None,
        dates=None,
        as_of=None,
    ) -> ServiceResult[JsonDict]:
        started = time_module.perf_counter()
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        zone = resolve_timezone(timezone_name)
        if zone is None:
            return None, "Invalid timezone", 400
        local_today = as_of or datetime.now(zone).date()

        program = self.db_session.query(Program).options(
            *self._read_options()
        ).filter(Program.id == program_id, Program.root_id == root_id).first()
        if not program:
            return None, "Program not found", 404

        selected_dates = None
        if dates is not None:
            if range_start or range_end:
                return None, "Invalid selected dates", 400
            raw_dates = dates.split(",") if isinstance(dates, str) else dates
            if not isinstance(raw_dates, (list, tuple)) or not raw_dates or len(raw_dates) > MAX_WINDOW_DAYS:
                return None, "Invalid selected dates", 400
            selected_dates = [self._parse_date(value) for value in raw_dates]
            if any(value is None or value.isoformat() != raw for value, raw in zip(selected_dates, raw_dates)):
                return None, "Invalid selected dates", 400
            selected_dates = sorted(set(selected_dates))
            if len(selected_dates) > MAX_WINDOW_DAYS:
                return None, "Invalid selected dates", 400
            program_start, program_end = _date_part(program.start_date), _date_part(program.end_date)
            if not program_start or not program_end or selected_dates[0] < program_start or selected_dates[-1] > program_end:
                return None, "Invalid selected dates", 400
            range_start, range_end = selected_dates[0], selected_dates[-1]

        window, error = self._resolve_window(program, local_today, range_start, range_end)
        if error:
            return None, "Invalid selected dates" if selected_dates is not None else error, 400
        if selected_dates is not None:
            selected_set = frozenset(selected_dates)
            window["selected_dates"] = selected_set
            window["total_days"] = len(selected_set)
            window["observed_days"] = sum(value <= local_today for value in selected_set)
            window["is_partial"] = True
            window["previous_range"] = None
            window["next_range"] = None

        scope = resolve_program_scope(self.db_session, root_id, program.id, programs=[program])
        evidence_rows = self._load_evidence(
            root_id, current_user_id, window, zone
        )
        goals_by_id = load_fractal_goals_for_serialization(
            self.db_session, root_id, include_group_activities=True
        ) if scope.goal_ids or evidence_rows else {}
        activity_ids = {row.activity_definition_id for row in evidence_rows if row.activity_definition_id}
        effective_goals = resolve_effective_goals_by_activity(goals_by_id, activity_ids)
        evidence = self._resolve_evidence(evidence_rows, effective_goals, goals_by_id, scope.goal_ids, zone)
        session_credits = load_program_session_credits(
            self.db_session, [program.id], window["display_start"], window["display_end"]
        )
        utc_start, utc_end = local_date_utc_bounds(window["display_start"], window["display_end"], zone)
        program_sessions = load_program_credit_candidates(
            self.db_session, root_id, current_user_id, [program], utc_start, utc_end, session_credits,
        )[program.id]
        targets = self._load_targets(root_id, current_user_id, scope.goal_ids)
        status_overrides = load_program_status_overrides(
            self.db_session, [program.id], window["display_start"], window["display_end"]
        )[program.id]
        periods = load_calendar_periods(
            self.db_session, root_id, current_user_id, window["display_start"], window["display_end"],
        )

        payload = self._aggregate(
            program=program,
            scope=scope,
            goals_by_id=goals_by_id,
            evidence=evidence,
            program_sessions=program_sessions,
            targets=targets,
            window=window,
            zone=zone,
            timezone_name=timezone_name or "UTC",
            local_today=local_today,
            status_overrides=status_overrides,
            session_credits=session_credits[program.id],
            periods=periods,
        )
        duration_ms = round((time_module.perf_counter() - started) * 1000, 2)
        logger.info(
            "program_metrics_calculated program_id=%s calculation_version=%s display_days=%s evidence_rows=%s duration_ms=%s",
            program.id,
            CALCULATION_VERSION,
            window["total_days"],
            len(evidence_rows),
            duration_ms,
        )
        return payload, None, 200

    def get_program_comparison(
        self,
        root_id,
        current_user_id,
        *,
        anchor_program_id=None,
        limit=5,
        timezone_name=None,
        as_of=None,
    ) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404
        zone = resolve_timezone(timezone_name)
        if zone is None:
            return None, "Invalid timezone", 400
        local_today = as_of or datetime.now(zone).date()
        try:
            normalized_limit = max(1, min(int(limit or 5), 5))
        except (TypeError, ValueError):
            return None, "Invalid limit", 400

        programs = self.db_session.query(Program).filter(
            Program.root_id == root_id,
            Program.end_date < datetime.combine(local_today + timedelta(days=1), time.min),
        ).order_by(Program.end_date.desc(), Program.id.asc()).all()
        if anchor_program_id:
            anchor = next((item for item in programs if item.id == anchor_program_id), None)
            if not anchor:
                return None, "Program not found", 404
            programs = [anchor] + [item for item in programs if item.id != anchor.id]
        programs = programs[:normalized_limit]
        if not programs:
            return {"programs": [], "calculation_version": CALCULATION_VERSION}, None, 200

        # Q38: one governed evidence load and one canonical goal graph for the
        # whole comparison. Never invoke the single-program query plan in a loop.
        windows = {}
        for program in programs:
            window, error = self._resolve_window(program, local_today, None, None)
            if error:
                return None, error, 400
            windows[program.id] = window
        overall_window = {
            "observation_start": min(item["observation_start"] for item in windows.values()),
            "observation_end": max(item["observation_end"] for item in windows.values()),
        }
        evidence_rows = self._load_evidence(root_id, current_user_id, overall_window, zone)
        scopes = resolve_program_scopes(
            self.db_session, root_id, [item.id for item in programs], programs=programs,
        )
        goals_by_id = load_fractal_goals_for_serialization(
            self.db_session, root_id, include_group_activities=True
        ) if evidence_rows or any(scope.goal_ids for scope in scopes.values()) else {}
        activity_ids = {row.activity_definition_id for row in evidence_rows if row.activity_definition_id}
        effective_goals = resolve_effective_goals_by_activity(goals_by_id, activity_ids)
        ordered_ids = [item.id for item in programs]
        loaded_programs = self.db_session.query(Program).options(
            *self._read_options()
        ).filter(Program.id.in_(ordered_ids)).all()
        programs_by_id = {item.id: item for item in loaded_programs}
        programs = [programs_by_id[item_id] for item_id in ordered_ids]
        observation = (overall_window["observation_start"], overall_window["observation_end"])
        credits_by_program = load_program_session_credits(self.db_session, ordered_ids, *observation)
        utc_start, utc_end = local_date_utc_bounds(*observation, zone)
        sessions_by_program = load_program_credit_candidates(
            self.db_session, root_id, current_user_id, programs, utc_start, utc_end, credits_by_program,
        )
        overrides_by_program = load_program_status_overrides(self.db_session, ordered_ids, *observation)
        periods = load_calendar_periods(self.db_session, root_id, current_user_id, *observation)
        rows = []
        for program in programs:
            window = windows[program.id]
            scope = scopes.get(program.id)
            resolved = self._resolve_evidence(
                evidence_rows, effective_goals, goals_by_id, scope.goal_ids, zone
            )
            resolved = [
                item for item in resolved
                if window["observation_start"] <= item["date"] <= window["observation_end"]
            ]
            aligned = [item for item in resolved if item["in_scope_ids"]]
            facts = build_day_facts(
                program,
                window["observation_start"],
                window["observation_end"],
                sessions_by_program[program.id],
                aligned,
                zone,
                local_today,
                status_overrides=overrides_by_program[program.id],
                session_credits=credits_by_program[program.id],
                periods=periods,
            )
            scheduled_facts = [item for item in facts if item["counts_toward_adherence"]]
            observed_scheduled = [
                item for item in scheduled_facts
                if item["closed"] or item["counts_as_success"]
            ]
            met_dates = [item for item in observed_scheduled if item["counts_as_success"]]
            total_duration = sum(item["duration"] for item in resolved)
            aligned_duration = sum(item["duration"] for item in aligned)
            rows.append({
                "program_id": program.id,
                "name": program.name,
                "color": program.color,
                "status": "ended",
                "window": {
                    "display_start": window["display_start"].isoformat(),
                    "display_end": window["display_end"].isoformat(),
                    "as_of": local_today.isoformat(),
                    "timezone": timezone_name or "UTC",
                },
                "adherence_rate": _rate(len(met_dates), len(observed_scheduled)),
                "alignment_rate": _rate(aligned_duration, total_duration),
                "aligned_duration_seconds": aligned_duration,
                "instances": len(aligned),
                "met_days": len(met_dates),
                "scheduled_days_observed": len(observed_scheduled),
            })
        return {
            "programs": rows,
            "semantics": {"attribution": "current_state", "effort_allocation": "equal_split", "data_layer": "analytics_engine"},
            "calculation_version": CALCULATION_VERSION,
        }, None, 200

    @staticmethod
    def _parse_date(value):
        if value is None or value == "":
            return None
        if isinstance(value, date):
            return value
        try:
            return date.fromisoformat(str(value))
        except ValueError:
            return None

    def _resolve_window(self, program, local_today, range_start, range_end):
        program_start = _date_part(program.start_date)
        program_end = _date_part(program.end_date)
        if not program_start or not program_end:
            return None, "Invalid program date range"
        if bool(range_start) != bool(range_end):
            return None, "Invalid date range"
        requested_start = self._parse_date(range_start)
        requested_end = self._parse_date(range_end)
        if (range_start and not requested_start) or (range_end and not requested_end):
            return None, "Invalid date range"
        if requested_start and requested_end and requested_start > requested_end:
            return None, "Invalid date range"

        if requested_start:
            display_start = max(program_start, requested_start)
            display_end = min(program_end, requested_end)
            if display_start > display_end:
                return None, "Invalid date range"
            if (display_end - display_start).days + 1 > MAX_WINDOW_DAYS:
                return None, "Invalid date range"
        elif (program_end - program_start).days + 1 > MAX_WINDOW_DAYS:
            if local_today < program_start:
                display_start = program_start
                display_end = program_start + timedelta(days=MAX_WINDOW_DAYS - 1)
            else:
                display_end = min(program_end, local_today)
                display_start = max(program_start, display_end - timedelta(days=MAX_WINDOW_DAYS - 1))
        else:
            display_start, display_end = program_start, program_end

        observation_end = min(display_end, local_today)
        has_observation = observation_end >= display_start
        observed_days = (observation_end - display_start).days + 1 if has_observation else 0
        total_days = (display_end - display_start).days + 1

        def adjacent(delta):
            start = display_start + timedelta(days=delta * MAX_WINDOW_DAYS)
            end = display_end + timedelta(days=delta * MAX_WINDOW_DAYS)
            if end < program_start or start > program_end:
                return None
            start, end = max(start, program_start), min(end, program_end)
            return {"start": start.isoformat(), "end": end.isoformat()}

        return {
            "display_start": display_start,
            "display_end": display_end,
            "observation_start": display_start if has_observation else None,
            "observation_end": observation_end if has_observation else None,
            "observed_days": observed_days,
            "total_days": total_days,
            "is_partial": display_start != program_start or display_end != program_end,
            "previous_range": adjacent(-1),
            "next_range": adjacent(1),
        }, None

    def _utc_bounds(self, window, zone):
        if not window["observation_start"]:
            return None, None
        start = datetime.combine(window["observation_start"], time.min, tzinfo=zone).astimezone(timezone.utc)
        end = datetime.combine(window["observation_end"] + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc)
        return start, end

    def _evidence_query(self, root_id, current_user_id):
        dataset = get_analytics_dataset("activity_instances")
        effective_at = dataset.fields["effective_at"].expression
        return build_scoped_dataset_query(
            self.db_session, "activity_instances", [root_id], current_user_id
        ).join(Session, Session.id == ActivityInstance.session_id).filter(
            Session.root_id == root_id,
            Session.deleted_at.is_(None),
            ActivityInstance.completed.is_(True),
        ).with_entities(
            ActivityInstance.id,
            ActivityInstance.session_id,
            ActivityInstance.activity_definition_id,
            ActivityInstance.duration_seconds,
            effective_at.label("effective_at"),
            Session.program_id,
            Session.program_block_id,
        )

    def _load_evidence(self, root_id, current_user_id, window, zone):
        start, end = self._utc_bounds(window, zone)
        if not start:
            return []
        effective_at = get_analytics_dataset("activity_instances").fields["effective_at"].expression
        return self._evidence_query(root_id, current_user_id).filter(
            effective_at >= start,
            effective_at < end,
        ).all()

    def _load_targets(self, root_id, current_user_id, scope_ids):
        if not scope_ids:
            return []
        return build_scoped_dataset_query(
            self.db_session, "targets", [root_id], current_user_id
        ).filter(Target.goal_id.in_(scope_ids)).with_entities(
            Target.id,
            Target.goal_id,
            Target.name,
            Target.completed,
            Target.completed_at,
        ).all()

    def _resolve_evidence(self, rows, effective_goals, goals_by_id, scope_ids, zone):
        scope_ids = set(scope_ids)
        resolved = []
        for row in rows:
            goals = []
            for goal in effective_goals.get(str(row.activity_definition_id), []):
                contribution = resolve_contribution_goal(goal, row.effective_at, goals_by_id)
                if contribution and contribution.id not in {item.id for item in goals}:
                    goals.append(contribution)
            goal_ids = {goal.id for goal in goals}
            resolved.append({
                "id": row.id,
                "session_id": row.session_id,
                "date": _local_date(row.effective_at, zone),
                "timestamp": _as_utc(row.effective_at),
                "duration": max(0, int(row.duration_seconds or 0)),
                "program_id": row.program_id,
                "program_block_id": row.program_block_id,
                "goals": goals,
                "in_scope_ids": goal_ids & scope_ids,
                "out_scope_ids": goal_ids - scope_ids,
            })
        return resolved

    def _aggregate(self, *, program, scope, goals_by_id, evidence, program_sessions, targets, window, zone, timezone_name, local_today, status_overrides, session_credits=(), periods=()):
        program_start, program_end = _date_part(program.start_date), _date_part(program.end_date)
        if local_today < program_start:
            status = "upcoming"
        elif local_today > program_end:
            status = "ended"
        else:
            status = "active"
        program_total_days = (program_end - program_start).days + 1
        elapsed_days = max(0, min(program_total_days, (local_today - program_start).days + 1))
        days_until_start = max(0, (program_start - local_today).days) if status == "upcoming" else 0
        days_remaining = max(0, (program_end - local_today).days) if status == "active" else 0

        blocks = list(program.blocks or [])
        template_occurrences = []
        aligned_evidence = [item for item in evidence if item["in_scope_ids"]]
        day_facts = build_day_facts(
            program,
            window["display_start"],
            window["display_end"],
            program_sessions,
            aligned_evidence,
            zone,
            local_today,
            status_overrides=status_overrides,
            session_credits=session_credits,
            periods=periods,
        )
        credited_blocks_by_session = credited_block_ids_by_session(day_facts)
        # Execution metrics describe completed sessions linked to or credited to
        # this program; unlinked template matches only count once credited.
        program_sessions = [
            item for item in program_sessions
            if item.completed and (item.program_id == program.id or item.id in credited_blocks_by_session)
        ]
        selected_dates = window.get("selected_dates")
        if selected_dates is not None:
            day_facts = [fact for fact in day_facts if fact["date"] in selected_dates]
            evidence = [item for item in evidence if item["date"] in selected_dates]
            program_sessions = [item for item in program_sessions if _local_date(
                item.session_start or item.completed_at or item.created_at, zone
            ) in selected_dates]
            status_overrides = [item for item in status_overrides if item.date in selected_dates]
        days = []
        observed_scheduled = met_days = active_days = unscheduled_evidence = 0
        for fact in day_facts:
            day_value = fact["date"]
            observed = fact["observed"]
            scheduled = fact["scheduled"]
            aligned_items = fact["aligned_items"]
            met = fact["counts_as_success"]
            active = bool(observed and aligned_items)
            if active:
                active_days += 1
            if fact["counts_toward_adherence"] and (fact["closed"] or met):
                observed_scheduled += 1
                met_days += int(met)
            if observed and not scheduled and active:
                unscheduled_evidence += 1
            for occurrence in fact["occurrences"]:
                day_obj = occurrence["program_day"]
                block = occurrence["block"]
                for link in day_obj.template_links or []:
                    if link.template is not None and not getattr(link.template, "deleted_at", None):
                        template_occurrences.append((day_obj, block, day_value, link))
            days.append({
                "date": day_value.isoformat(),
                "state": fact["state"],
                "scheduled": scheduled,
                "counts_toward_adherence": fact["counts_toward_adherence"],
                "automatic_state": fact["automatic_state"],
                "status_source": fact["status_source"],
                "manual_status": fact["manual_status"],
                "period_id": fact["period_id"],
                "observed": observed,
                "closed": fact["closed"],
                "met": met,
                "counts_as_success": met,
                "breaks_chain": fact["breaks_chain"],
                "broke_active_chain": fact["broke_active_chain"],
                "chain_role": fact["chain_role"],
                "run_length_at_date": fact["run_length_at_date"],
                "requirements_met": fact["requirements_met"],
                "completed_template_count": fact["completed_template_count"],
                "required_template_count": fact["required_template_count"],
                "scheduled_template_count": fact["scheduled_template_count"],
                "instances": len(aligned_items),
                "duration_seconds": sum(item["duration"] for item in aligned_items),
                "weekday": day_value.weekday(),
                "block_ids": sorted({row["block"].id for row in fact["occurrences"]}),
            })

        mode = "scheduled" if any(item["scheduled"] for item in day_facts) else "density"
        denominator_days = observed_scheduled if mode == "scheduled" else window["observed_days"]
        adherence_numerator = met_days if mode == "scheduled" else active_days
        current_streak, longest_streak = self._streaks(days, mode, selected_dates is not None)

        aligned = [item for item in evidence if item["in_scope_ids"]]
        other = [item for item in evidence if not item["in_scope_ids"]]
        aligned_duration = sum(item["duration"] for item in aligned)
        total_duration = sum(item["duration"] for item in evidence)

        coverage = allocate_equal_split(aligned, lambda item: item["in_scope_ids"])

        targets_by_goal = defaultdict(list)
        for target in targets:
            targets_by_goal[target.goal_id].append(target)
        def in_selected_window(value):
            local_date = _local_date(value, zone)
            return bool(local_date and (
                local_date in selected_dates if selected_dates is not None
                else window["display_start"] <= local_date <= window["display_end"]
            ))

        goal_coverage = []
        for goal_id in sorted(scope.goal_ids):
            goal = goals_by_id.get(goal_id)
            if not goal:
                continue
            values = coverage[goal_id]
            goal_targets = targets_by_goal[goal_id]
            last = values["last"]
            goal_coverage.append({
                "goal_id": goal_id,
                "name": goal.name,
                "level": getattr(getattr(goal, "level", None), "name", None),
                "level_id": goal.level_id,
                "level_name": getattr(getattr(goal, "level", None), "name", None),
                "type": get_canonical_goal_type(goal),
                "is_smart": all(calculate_smart_status(goal).values()),
                "is_seed": goal_id in scope.seed_goal_ids,
                "seed_level": getattr(getattr(goal, "level", None), "name", None) if goal_id in scope.seed_goal_ids else None,
                "credited_instances": values["instances"],
                "allocated_duration_seconds": round(values["duration"]),
                "effort_share": _rate(values["duration"], aligned_duration),
                "last_evidence_at": last.isoformat().replace("+00:00", "Z") if last else None,
                "days_since_evidence": (local_today - _local_date(last, zone)).days if last else None,
                "completed_in_window": in_selected_window(goal.completed_at),
                "targets_met_in_window": sum(in_selected_window(target.completed_at) for target in goal_targets),
            })

        other_groups = allocate_equal_split(other, lambda item: item["out_scope_ids"] or {None})
        other_goals = [{
            "goal_id": goal_id,
            "name": goals_by_id[goal_id].name if goal_id in goals_by_id else "Unassociated",
            "instances": values["instances"],
            "allocated_duration_seconds": round(values["duration"]),
        } for goal_id, values in other_groups.items()]

        sessions_by_occurrence = completed_credits_by_occurrence_template(day_facts)
        template_stats = defaultdict(lambda: {"scheduled": 0, "completed": 0, "extra": 0, "required": False, "last": None, "template": None})
        for day_obj, _block, day_value, link in template_occurrences:
            stats = template_stats[link.session_template_id]
            stats["template"] = link.template
            stats["scheduled"] += int(bool(window["observation_end"] and day_value <= window["observation_end"]))
            stats["required"] = stats["required"] or bool(link.is_required)
            matches = sessions_by_occurrence[(day_obj.id, day_value, link.session_template_id)]
            if matches and day_value <= (window["observation_end"] or date.min):
                stats["completed"] += 1
                stats["extra"] += max(0, len(matches) - 1)
                latest = max(_as_utc(item.completed_at or item.session_start or item.created_at) for item in matches)
                stats["last"] = max(filter(None, [stats["last"], latest]))
        templates = [{
            "template_id": template_id,
            "name": stats["template"].name if stats["template"] else "Deleted template",
            "color": get_template_color(stats["template"].template_data) if stats["template"] else None,
            "scheduled_occurrences": stats["scheduled"],
            "completed_occurrences": stats["completed"],
            "extra_completions": stats["extra"],
            "completion_rate": _rate(stats["completed"], stats["scheduled"]),
            "is_required": stats["required"],
            "last_completed_at": stats["last"].isoformat().replace("+00:00", "Z") if stats["last"] else None,
        } for template_id, stats in template_stats.items()]

        program_day_stats_by_block = defaultdict(
            lambda: defaultdict(lambda: {
                "name": "Program day",
                "day_number": None,
                "scheduled_occurrences": 0,
                "completed_occurrences": 0,
            })
        )
        for fact in day_facts:
            for occurrence in fact["occurrences"]:
                day_obj = occurrence["program_day"]
                stats = program_day_stats_by_block[occurrence["block"].id][day_obj.id]
                stats["name"] = day_obj.name or "Program day"
                stats["day_number"] = day_obj.day_number
                stats["scheduled_occurrences"] += 1
                stats["completed_occurrences"] += int(
                    occurrence["evaluation"]["requirements_met"]
                )

        block_rows = []
        for block in blocks:
            block_start = max(window["display_start"], block.start_date or window["display_start"])
            block_end = min(window["display_end"], block.end_date or window["display_end"])
            if selected_dates is not None and not any(block_start <= value <= block_end for value in selected_dates):
                continue
            block_days = [item for item in days if block.id in item["block_ids"]]
            program_day_stats = program_day_stats_by_block[block.id]
            block_sessions = [
                item for item in program_sessions
                if item.program_block_id == block.id or block.id in credited_blocks_by_session.get(item.id, ())
            ]
            block_evidence = [
                item for item in evidence
                if item["program_block_id"] == block.id
                and block_start <= item["date"] <= block_end
            ] if block_start <= block_end else []
            block_aligned = [item for item in block_evidence if item["in_scope_ids"]]
            block_rows.append({
                "block_id": block.id,
                "name": block.name,
                "color": block.color,
                "start_date": block.start_date.isoformat() if block.start_date else None,
                "end_date": block.end_date.isoformat() if block.end_date else None,
                "adherence": {
                    "met_days": sum(item["met"] for item in block_days if item["closed"] or item["met"]),
                    "scheduled_days_observed": sum(item["counts_toward_adherence"] for item in block_days if item["closed"] or item["met"]),
                },
                "program_days": [
                    {"program_day_id": day_id, **stats}
                    for day_id, stats in sorted(
                        program_day_stats.items(),
                        key=lambda item: (
                            item[1]["day_number"] is None,
                            item[1]["day_number"] or 0,
                            item[1]["name"],
                            str(item[0]),
                        ),
                    )
                ],
                "alignment": {
                    "instances": {"aligned": len(block_aligned), "total": len(block_evidence), "rate": _rate(len(block_aligned), len(block_evidence))},
                    "duration_seconds": {"aligned": sum(item["duration"] for item in block_aligned), "total": sum(item["duration"] for item in block_evidence), "rate": _rate(sum(item["duration"] for item in block_aligned), sum(item["duration"] for item in block_evidence))},
                },
                "aligned_instances": len(block_aligned),
                "aligned_duration_seconds": sum(item["duration"] for item in block_aligned),
                "linked_sessions": len(block_sessions),
                "linked_duration_seconds": sum(session_duration_seconds_from_row(item.total_duration_seconds, item.duration_minutes, item.session_start, item.session_end) for item in block_sessions),
            })

        volume = self._volume(aligned, window)
        weekday = []
        for weekday_index in range(7):
            weekday_days = [item for item in days if date.fromisoformat(item["date"]).weekday() == weekday_index and (item["closed"] or item["met"])]
            weekday.append({
                "weekday": weekday_index,
                "scheduled_days_observed": sum(item["counts_toward_adherence"] for item in weekday_days),
                "met_days": sum(item["met"] for item in weekday_days),
                "instances": sum(item["instances"] for item in weekday_days),
                "duration_seconds": sum(item["duration_seconds"] for item in weekday_days),
            })

        completed_targets = [target for target in targets if in_selected_window(target.completed_at)]
        completed_goals = [goal for goal_id, goal in goals_by_id.items() if goal_id in scope.goal_ids and in_selected_window(goal.completed_at)]
        execution_duration = sum(session_duration_seconds_from_row(item.total_duration_seconds, item.duration_minutes, item.session_start, item.session_end) for item in program_sessions)

        return {
            "program": {
                "id": program.id, "name": program.name, "color": program.color,
                "start_date": program_start.isoformat(), "end_date": program_end.isoformat(), "status": status,
                "progress": {
                    "elapsed_days": elapsed_days, "total_days": program_total_days,
                    "days_remaining": days_remaining, "days_until_start": days_until_start,
                    "rate": _rate(elapsed_days, program_total_days),
                },
            },
            "window": {
                **{key: value.isoformat() if isinstance(value, date) else value for key, value in window.items() if key != "selected_dates"},
                **({"dates": [value.isoformat() for value in sorted(selected_dates)]} if selected_dates is not None else {}),
                "as_of": local_today.isoformat(), "timezone": timezone_name,
                "scope_label": f"{len(selected_dates)} selected days" if selected_dates is not None else (
                    "Whole program" if not window["is_partial"] else f"{window['display_start'].isoformat()} – {window['display_end'].isoformat()}"
                ),
            },
            "scope": {"goal_ids": sorted(scope.goal_ids), "seed_goal_ids": sorted(scope.seed_goal_ids), "goal_count": len(scope.goal_ids)},
            "adherence": {
                "mode": mode, "streak_mode": "scheduled" if mode == "scheduled" else "calendar",
                "scheduled_days_observed": observed_scheduled, "scheduled_days_total": sum(item["scheduled"] for item in days),
                "adherence_eligible_days_total": sum(item["counts_toward_adherence"] for item in days),
                "met_days": met_days, "active_days": active_days, "denominator_days": denominator_days,
                "rate": _rate(adherence_numerator, denominator_days), "current_streak": current_streak,
                "longest_streak": longest_streak, "unscheduled_days_with_evidence": unscheduled_evidence,
                "manual_complete_days": sum(item["manual_status"] == "complete" for item in days),
                "manual_rest_days": sum(item["manual_status"] == "rest" for item in days),
                "period_rest_days": sum(item["status_source"] == "period" for item in days),
            },
            "periods": [serialize_calendar_period(period) for period in periods],
            "alignment": {
                "instances": {"aligned": len(aligned), "total": len(evidence), "rate": _rate(len(aligned), len(evidence))},
                "duration_seconds": {"aligned": aligned_duration, "total": total_duration, "rate": _rate(aligned_duration, total_duration)},
                "other_work": {"instances": len(other), "duration_seconds": sum(item["duration"] for item in other), "goals": other_goals},
            },
            "execution": {"linked_sessions": len(program_sessions), "linked_duration_seconds": execution_duration},
            "days": days,
            "blocks": block_rows,
            "goal_coverage": goal_coverage,
            "templates": templates,
            "volume": volume,
            "weekday": weekday,
            "outcomes": {
                "goals_completed_in_window": len(completed_goals), "goals_in_scope": len(scope.goal_ids),
                "targets_met_in_window": [{"target_id": item.id, "goal_id": item.goal_id, "name": item.name, "met_at": _as_utc(item.completed_at).isoformat().replace("+00:00", "Z")} for item in completed_targets],
                "targets_open": sum(not item.completed for item in targets), "attribution": "current_state",
            },
            "data_sufficiency": {
                "has_data": bool(evidence or program_sessions or status_overrides), "observed_days": window["observed_days"],
                "minimum_days": MINIMUM_SUFFICIENCY_DAYS,
                "message": "Program has not started" if status == "upcoming" else (f"Needs {MINIMUM_SUFFICIENCY_DAYS} observed days — {window['observed_days']} so far" if window["observed_days"] < MINIMUM_SUFFICIENCY_DAYS else None),
            },
            "semantics": {"attribution": "current_state", "effort_allocation": "equal_split", "execution_linkage": "explicit", "data_layer": "analytics_engine"},
            "calculation_version": CALCULATION_VERSION,
        }

    @staticmethod
    def _streaks(days, mode, selected_dates=False):
        if selected_dates:
            running = longest = 0
            previous = None
            for item in days:
                day_value = date.fromisoformat(item["date"])
                if previous and day_value != previous + timedelta(days=1):
                    running = 0
                if mode == "scheduled":
                    if item["met"]:
                        running += 1
                    elif item["breaks_chain"]:
                        running = 0
                else:
                    running = running + 1 if item["observed"] and item["instances"] else 0
                longest = max(longest, running)
                previous = day_value
            return running, longest
        if mode == "scheduled":
            summary = summarize_chain_facts(days)
            return summary["current_streak"], summary["longest_streak"]

        considered = [item for item in days if item["observed"]]
        longest = running = 0
        for item in considered:
            success = item["instances"] > 0
            running = running + 1 if success else 0
            longest = max(longest, running)
        current = 0
        for item in reversed(considered):
            success = item["instances"] > 0
            if not success:
                break
            current += 1
        return current, longest

    @staticmethod
    def _volume(aligned, window):
        buckets = defaultdict(list)
        daily = window["total_days"] <= 21
        for item in aligned:
            key = item["date"] if daily else item["date"] - timedelta(days=item["date"].weekday())
            buckets[key].append(item)
        return [{
            "period_start": key.isoformat(),
            "sessions": len({item["session_id"] for item in values}),
            "instances": len(values),
            "duration_seconds": sum(item["duration"] for item in values),
        } for key, values in sorted(buckets.items())]
