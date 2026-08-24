"""Fixed, program-native metrics built on governed analytics datasets."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
import logging
import time as time_module

from models import ActivityInstance, Program, ProgramBlock, ProgramDay, Session, Target, validate_root_goal
from services.analytics_engine import build_scoped_dataset_query, get_analytics_dataset
from services.effective_goal_activities import resolve_effective_goals_by_activity
from services.goal_contribution import resolve_contribution_goal
from services.goal_loading import load_fractal_goals_for_serialization
from services.goal_type_utils import get_canonical_goal_type
from services.program_scope import resolve_program_scope, resolve_program_scopes
from services.programs import ProgramService
from services.serializers import calculate_smart_status
from services.session_filters import resolve_timezone, session_duration_seconds_from_row
from services.service_types import JsonDict, ServiceResult


logger = logging.getLogger(__name__)
MAX_WINDOW_DAYS = 366
CALCULATION_VERSION = 1
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

    def get_program_metrics(
        self,
        root_id,
        program_id,
        current_user_id,
        *,
        timezone_name=None,
        range_start=None,
        range_end=None,
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
            *ProgramService._program_serializer_load_options()
        ).filter(Program.id == program_id, Program.root_id == root_id).first()
        if not program:
            return None, "Program not found", 404

        window, error = self._resolve_window(program, local_today, range_start, range_end)
        if error:
            return None, error, 400

        scope = resolve_program_scope(self.db_session, root_id, program.id)
        goals_by_id = load_fractal_goals_for_serialization(
            self.db_session, root_id, include_group_activities=True
        )
        evidence_rows = self._load_evidence(
            root_id, current_user_id, window, zone
        )
        activity_ids = {row.activity_definition_id for row in evidence_rows if row.activity_definition_id}
        effective_goals = resolve_effective_goals_by_activity(goals_by_id, activity_ids)
        evidence = self._resolve_evidence(evidence_rows, effective_goals, goals_by_id, scope.goal_ids, zone)
        program_sessions = self._load_program_sessions(
            root_id, program.id, current_user_id, window, zone
        )
        targets = self._load_targets(root_id, current_user_id, scope.goal_ids)

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
        goals_by_id = load_fractal_goals_for_serialization(
            self.db_session, root_id, include_group_activities=True
        )
        activity_ids = {row.activity_definition_id for row in evidence_rows if row.activity_definition_id}
        effective_goals = resolve_effective_goals_by_activity(goals_by_id, activity_ids)
        scopes = resolve_program_scopes(self.db_session, root_id, [item.id for item in programs])
        schedule_rows = self.db_session.query(
            ProgramBlock.program_id,
            ProgramBlock.start_date,
            ProgramBlock.end_date,
            ProgramDay.date,
            ProgramDay.day_of_week,
        ).join(ProgramDay, ProgramDay.block_id == ProgramBlock.id).filter(
            ProgramBlock.program_id.in_([item.id for item in programs])
        ).all()
        schedules_by_program = defaultdict(list)
        for schedule_row in schedule_rows:
            schedules_by_program[schedule_row.program_id].append(schedule_row)

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
            aligned_dates = {item["date"] for item in aligned}
            scheduled_dates = set()
            for schedule in schedules_by_program[program.id]:
                block_start = schedule.start_date or window["display_start"]
                block_end = schedule.end_date or window["observation_end"]
                if schedule.date:
                    if window["observation_start"] <= schedule.date <= window["observation_end"]:
                        scheduled_dates.add(schedule.date)
                    continue
                names = set(
                    schedule.day_of_week
                    if isinstance(schedule.day_of_week, list)
                    else ([schedule.day_of_week] if schedule.day_of_week else [])
                )
                for day_value in _iter_dates(
                    max(window["observation_start"], block_start),
                    min(window["observation_end"], block_end),
                ):
                    if day_value.strftime("%A") in names:
                        scheduled_dates.add(day_value)
            met_dates = scheduled_dates & aligned_dates
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
                "adherence_rate": _rate(len(met_dates), len(scheduled_dates)),
                "alignment_rate": _rate(aligned_duration, total_duration),
                "aligned_duration_seconds": aligned_duration,
                "instances": len(aligned),
                "met_days": len(met_dates),
                "scheduled_days_observed": len(scheduled_dates),
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

    def _load_evidence(self, root_id, current_user_id, window, zone):
        start, end = self._utc_bounds(window, zone)
        if not start:
            return []
        dataset = get_analytics_dataset("activity_instances")
        effective_at = dataset.fields["effective_at"].expression
        return build_scoped_dataset_query(
            self.db_session, "activity_instances", [root_id], current_user_id
        ).join(Session, Session.id == ActivityInstance.session_id).filter(
            Session.root_id == root_id,
            Session.deleted_at.is_(None),
            ActivityInstance.completed.is_(True),
            effective_at >= start,
            effective_at < end,
        ).with_entities(
            ActivityInstance.id,
            ActivityInstance.session_id,
            ActivityInstance.activity_definition_id,
            ActivityInstance.duration_seconds,
            effective_at.label("effective_at"),
            Session.program_id,
            Session.program_block_id,
        ).all()

    def _load_program_sessions(self, root_id, program_id, current_user_id, window, zone):
        start = datetime.combine(window["display_start"], time.min, tzinfo=zone).astimezone(timezone.utc)
        end = datetime.combine(window["display_end"] + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc)
        dataset = get_analytics_dataset("sessions")
        effective_at = dataset.fields["effective_at"].expression
        return build_scoped_dataset_query(
            self.db_session, "sessions", [root_id], current_user_id
        ).filter(
            Session.program_id == program_id,
            Session.completed.is_(True),
            effective_at >= start,
            effective_at < end,
        ).with_entities(
            Session.id,
            Session.template_id,
            Session.program_day_id,
            Session.program_block_id,
            Session.total_duration_seconds,
            Session.duration_minutes,
            Session.session_start,
            Session.session_end,
            Session.completed_at,
            Session.created_at,
            effective_at.label("effective_at"),
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

    def _aggregate(self, *, program, scope, goals_by_id, evidence, program_sessions, targets, window, zone, timezone_name, local_today):
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

        evidence_by_date = defaultdict(list)
        for item in evidence:
            evidence_by_date[item["date"]].append(item)

        blocks = list(program.blocks or [])
        scheduled_by_date = defaultdict(lambda: {"block_ids": set(), "days": []})
        template_occurrences = []
        for block in blocks:
            for day_obj in block.days or []:
                for day_value in _iter_dates(window["display_start"], window["display_end"]):
                    if not ProgramService._program_day_scheduled_on(day_obj, block, day_value):
                        continue
                    scheduled_by_date[day_value]["block_ids"].add(block.id)
                    scheduled_by_date[day_value]["days"].append(day_obj)
                    for link in day_obj.template_links or []:
                        if link.template is not None and not getattr(link.template, "deleted_at", None):
                            template_occurrences.append((day_obj, block, day_value, link))

        days = []
        observed_scheduled = met_days = active_days = unscheduled_evidence = 0
        for day_value in _iter_dates(window["display_start"], window["display_end"]):
            observed = bool(window["observation_end"] and day_value <= window["observation_end"])
            scheduled = day_value in scheduled_by_date
            aligned_items = [item for item in evidence_by_date[day_value] if item["in_scope_ids"]]
            met = bool(observed and scheduled and aligned_items)
            active = bool(observed and aligned_items)
            if active:
                active_days += 1
            if observed and scheduled:
                observed_scheduled += 1
                met_days += int(met)
            if observed and not scheduled and active:
                unscheduled_evidence += 1
            if not observed:
                state = "upcoming"
            elif scheduled:
                state = "scheduled_met" if met else "scheduled_missed"
            elif active:
                state = "unscheduled_evidence"
            else:
                state = "rest"
            days.append({
                "date": day_value.isoformat(),
                "state": state,
                "scheduled": scheduled,
                "observed": observed,
                "met": met,
                "instances": len(aligned_items),
                "duration_seconds": sum(item["duration"] for item in aligned_items),
                "weekday": day_value.weekday(),
                "block_ids": sorted(scheduled_by_date[day_value]["block_ids"]),
            })

        mode = "scheduled" if observed_scheduled else "density"
        denominator_days = observed_scheduled if mode == "scheduled" else window["observed_days"]
        adherence_numerator = met_days if mode == "scheduled" else active_days
        current_streak, longest_streak = self._streaks(days, mode)

        aligned = [item for item in evidence if item["in_scope_ids"]]
        other = [item for item in evidence if not item["in_scope_ids"]]
        aligned_duration = sum(item["duration"] for item in aligned)
        total_duration = sum(item["duration"] for item in evidence)

        coverage = defaultdict(lambda: {"instances": 0, "duration": 0.0, "last": None})
        for item in aligned:
            allocation = item["duration"] / len(item["in_scope_ids"]) if item["in_scope_ids"] else 0
            for goal_id in item["in_scope_ids"]:
                row = coverage[goal_id]
                row["instances"] += 1
                row["duration"] += allocation
                row["last"] = max(filter(None, [row["last"], item["timestamp"]]))

        targets_by_goal = defaultdict(list)
        for target in targets:
            targets_by_goal[target.goal_id].append(target)
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
                "completed_in_window": bool(goal.completed_at and window["display_start"] <= _local_date(goal.completed_at, zone) <= window["display_end"]),
                "targets_met_in_window": sum(1 for target in goal_targets if target.completed_at and window["display_start"] <= _local_date(target.completed_at, zone) <= window["display_end"]),
            })

        other_groups = defaultdict(lambda: {"instances": 0, "duration": 0.0})
        for item in other:
            goal_ids = item["out_scope_ids"] or {None}
            allocation = item["duration"] / len(goal_ids)
            for goal_id in goal_ids:
                other_groups[goal_id]["instances"] += 1
                other_groups[goal_id]["duration"] += allocation
        other_goals = [{
            "goal_id": goal_id,
            "name": goals_by_id[goal_id].name if goal_id in goals_by_id else "Unassociated",
            "instances": values["instances"],
            "allocated_duration_seconds": round(values["duration"]),
        } for goal_id, values in other_groups.items()]

        sessions_by_occurrence = defaultdict(list)
        for session in program_sessions:
            local_day = _local_date(session.session_start or session.completed_at or session.created_at, zone)
            sessions_by_occurrence[(session.program_day_id, local_day, session.template_id)].append(session)
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
                latest = max(_as_utc(item.completed_at or item.effective_at) for item in matches)
                stats["last"] = max(filter(None, [stats["last"], latest]))
        templates = [{
            "template_id": template_id,
            "name": stats["template"].name if stats["template"] else "Deleted template",
            "color": None,
            "scheduled_occurrences": stats["scheduled"],
            "completed_occurrences": stats["completed"],
            "extra_completions": stats["extra"],
            "completion_rate": _rate(stats["completed"], stats["scheduled"]),
            "is_required": stats["required"],
            "last_completed_at": stats["last"].isoformat().replace("+00:00", "Z") if stats["last"] else None,
        } for template_id, stats in template_stats.items()]

        block_rows = []
        for block in blocks:
            block_start = max(window["display_start"], block.start_date or window["display_start"])
            block_end = min(window["display_end"], block.end_date or window["display_end"])
            block_days = [item for item in days if block.id in item["block_ids"]]
            block_sessions = [item for item in program_sessions if item.program_block_id == block.id]
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
                    "met_days": sum(item["met"] for item in block_days if item["observed"]),
                    "scheduled_days_observed": sum(item["scheduled"] for item in block_days if item["observed"]),
                },
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
            weekday_days = [item for item in days if date.fromisoformat(item["date"]).weekday() == weekday_index and item["observed"]]
            weekday.append({
                "weekday": weekday_index,
                "scheduled_days_observed": sum(item["scheduled"] for item in weekday_days),
                "met_days": sum(item["met"] for item in weekday_days),
                "instances": sum(item["instances"] for item in weekday_days),
                "duration_seconds": sum(item["duration_seconds"] for item in weekday_days),
            })

        completed_targets = [target for target in targets if target.completed_at and window["display_start"] <= _local_date(target.completed_at, zone) <= window["display_end"]]
        completed_goals = [goal for goal_id, goal in goals_by_id.items() if goal_id in scope.goal_ids and goal.completed_at and window["display_start"] <= _local_date(goal.completed_at, zone) <= window["display_end"]]
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
                **{key: value.isoformat() if isinstance(value, date) else value for key, value in window.items()},
                "as_of": local_today.isoformat(), "timezone": timezone_name,
                "scope_label": "Whole program" if not window["is_partial"] else f"{window['display_start'].isoformat()} – {window['display_end'].isoformat()}",
            },
            "scope": {"goal_ids": sorted(scope.goal_ids), "seed_goal_ids": sorted(scope.seed_goal_ids), "goal_count": len(scope.goal_ids)},
            "adherence": {
                "mode": mode, "streak_mode": "scheduled" if mode == "scheduled" else "calendar",
                "scheduled_days_observed": observed_scheduled, "scheduled_days_total": len(scheduled_by_date),
                "met_days": met_days, "active_days": active_days, "denominator_days": denominator_days,
                "rate": _rate(adherence_numerator, denominator_days), "current_streak": current_streak,
                "longest_streak": longest_streak, "unscheduled_days_with_evidence": unscheduled_evidence,
            },
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
                "has_data": bool(evidence or program_sessions), "observed_days": window["observed_days"],
                "minimum_days": MINIMUM_SUFFICIENCY_DAYS,
                "message": "Program has not started" if status == "upcoming" else (f"Needs {MINIMUM_SUFFICIENCY_DAYS} observed days — {window['observed_days']} so far" if window["observed_days"] < MINIMUM_SUFFICIENCY_DAYS else None),
            },
            "semantics": {"attribution": "current_state", "effort_allocation": "equal_split", "execution_linkage": "explicit", "data_layer": "analytics_engine"},
            "calculation_version": CALCULATION_VERSION,
        }

    @staticmethod
    def _streaks(days, mode):
        considered = [item for item in days if item["observed"] and (item["scheduled"] if mode == "scheduled" else True)]
        longest = running = 0
        for item in considered:
            success = item["met"] if mode == "scheduled" else item["instances"] > 0
            running = running + 1 if success else 0
            longest = max(longest, running)
        current = 0
        for item in reversed(considered):
            success = item["met"] if mode == "scheduled" else item["instances"] > 0
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
