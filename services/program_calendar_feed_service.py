"""Root-scoped, range-bounded program calendar feed.

The calendar loads this feed in month chunks for the rows in view. One response
carries everything the calendar draws for the range across every program: program
and block spans, canonical per-program date facts with light occurrence ribbons,
completed sessions (once, with their credits unioned across programs), and
calendar periods. Full program detail is never needed to render the calendar.
"""

from datetime import date, datetime, timedelta

from sqlalchemy.orm import selectinload

from models import Program, ProgramDay, ProgramDayTemplate, validate_root_goal
from models.program import get_program_day_template_rules
from services._serialize_common import format_utc
from services.calendar_periods import load_calendar_periods, serialize_calendar_period
from services.program_calendar_sessions import load_completed_sessions_by_date
from services.program_day_occurrences import date_part
from services.program_day_read_model_service import ProgramDayReadModelService
from services.session_filters import resolve_timezone
from services.session_runtime import get_template_color

MAX_CALENDAR_FEED_DAYS = 62


def _parse_date(value):
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _feed_load_options():
    """Only what the occurrence evaluator and ribbons read; no serializer graph."""
    day_load = selectinload(Program.days)
    return [
        selectinload(Program.blocks),
        day_load.selectinload(ProgramDay.goals),
        day_load.selectinload(ProgramDay.occurrence_schedules),
        day_load.selectinload(ProgramDay.templates),
        day_load.selectinload(ProgramDay.template_links).selectinload(ProgramDayTemplate.template),
    ]


class ProgramCalendarFeedService:
    SCHEMA_VERSION = 1

    def __init__(self, db_session):
        self.db_session = db_session
        self.read_model = ProgramDayReadModelService(db_session)

    def get(self, root_id, current_user_id, *, range_start, range_end, timezone_name):
        if not validate_root_goal(self.db_session, root_id, owner_id=current_user_id):
            return None, "Fractal not found or access denied", 404
        zone = resolve_timezone(timezone_name)
        if zone is None:
            return None, "Invalid timezone", 400
        start = _parse_date(range_start)
        end = _parse_date(range_end)
        if not start or not end or start > end:
            return None, "Calendar range must use valid YYYY-MM-DD dates", 400
        if (end - start).days + 1 > MAX_CALENDAR_FEED_DAYS:
            return None, f"Calendar range cannot exceed {MAX_CALENDAR_FEED_DAYS} days", 400

        programs = self.db_session.query(Program).options(*_feed_load_options()).filter(
            Program.root_id == root_id,
            Program.start_date < datetime.combine(end + timedelta(days=1), datetime.min.time()),
            Program.end_date >= datetime.combine(start, datetime.min.time()),
        ).order_by(Program.start_date, Program.id).all()

        local_today = datetime.now(zone).date()
        windows = {
            program.id: self.read_model._resolve_chain_window(
                date_part(program.start_date), date_part(program.end_date), start, end,
            )
            for program in programs
        }
        period_start = min([start, *(window[0] for window in windows.values())])
        period_end = max([end, *(window[1] for window in windows.values())])
        periods = load_calendar_periods(self.db_session, root_id, current_user_id, period_start, period_end)

        program_days = []
        credits_by_date = {}
        for program in programs:
            program_start = max(start, date_part(program.start_date))
            program_end = min(end, date_part(program.end_date))
            built = self.read_model.build_range_facts(
                root_id, current_user_id, program, start, end, zone, periods=periods,
            )
            for fact in built["facts"]:
                if fact["session_credits"]:
                    credits_by_date.setdefault(fact["date"], []).append(fact["session_credits"])
                if not program_start <= fact["date"] <= program_end:
                    continue
                program_days.append(
                    ProgramDayReadModelService.serialize_day_fact(fact) | {
                        "program_id": program.id,
                        "occurrences": [self._serialize_occurrence(row) for row in fact["occurrences"]],
                    }
                )

        completed_by_date = load_completed_sessions_by_date(
            self.db_session, root_id, current_user_id, start, min(end, local_today), zone,
        )
        completed_session_days = [
            {
                "date": day_value.isoformat(),
                "completed_sessions": [
                    self._serialize_session(session, credits_by_date.get(day_value, []))
                    for session in sessions
                ],
            }
            for day_value, sessions in sorted(completed_by_date.items())
            if sessions
        ]

        return {
            "schema_version": self.SCHEMA_VERSION,
            "timezone": timezone_name,
            "range": {"start": start.isoformat(), "end": end.isoformat()},
            "programs": [self._serialize_program(program) for program in programs],
            "blocks": [
                self._serialize_block(block)
                for program in programs
                for block in sorted(program.blocks or [], key=lambda item: (str(item.start_date), item.id))
                if block.start_date and block.end_date
                and date_part(block.start_date) <= end and date_part(block.end_date) >= start
            ],
            "program_days": program_days,
            "completed_session_days": completed_session_days,
            "periods": [
                serialize_calendar_period(period) for period in periods
                if period.start_date <= end and period.end_date >= start
            ],
        }, None, 200

    @staticmethod
    def _serialize_program(program):
        return {
            "id": program.id,
            "root_id": program.root_id,
            "name": program.name,
            "color": program.color,
            "start_date": format_utc(program.start_date),
            "end_date": format_utc(program.end_date),
        }

    @staticmethod
    def _serialize_block(block):
        return {
            "id": block.id,
            "program_id": block.program_id,
            "name": block.name,
            "color": block.color,
            "start_date": format_utc(block.start_date),
            "end_date": format_utc(block.end_date),
            "track_weeks": bool(block.track_weeks),
            "week_start_day": block.week_start_day,
        }

    @staticmethod
    def _serialize_occurrence(row):
        day = row["program_day"]
        block = row["block"]
        return {
            "program_day_id": day.id,
            "name": day.name,
            "block_id": block.id if block is not None else None,
            "block_color": block.color if block is not None else None,
            "requirements_met": bool(row["evaluation"]["requirements_met"]),
            "goal_ids": [goal.id for goal in day.goals or []],
            "templates": [
                {
                    "id": rule["template_id"],
                    "name": rule["template"].name,
                    "color": get_template_color(rule["template"].template_data),
                    "is_required": rule["is_required"],
                }
                for rule in get_program_day_template_rules(day)
            ],
        }

    @staticmethod
    def _serialize_session(session, credit_maps):
        """One compact session, with credited day links unioned across programs."""
        program_day_ids = set()
        for credit_map in credit_maps:
            credit_fact = credit_map.get(session.id)
            if credit_fact:
                program_day_ids.update(
                    ProgramDayReadModelService._serialize_calendar_session(session, credit_fact)["program_day_ids"]
                )
        payload = ProgramDayReadModelService._serialize_calendar_session(session)
        payload["program_day_ids"] = sorted(program_day_ids)
        return payload
