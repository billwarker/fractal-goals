"""Program-day lifecycle: create/update/delete/duplicate/schedule/unschedule + deadlines.

Mixin for ProgramService (audit P1-7). Methods are classmethods; cross-method
calls use cls.<method>(...) and resolve through the composed ProgramService class.
"""

import uuid
import logging
from datetime import datetime, date, time, timedelta, timezone
from typing import List, Dict, Any

from sqlalchemy import func
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from models import Program, ProgramDay, ProgramDayOccurrenceSchedule, ProgramDayOccurrenceExclusion, ProgramDayStatusOverride, ProgramSessionPlan, ProgramDayTemplate, Goal, Session, _safe_load_json
from services import event_bus, Event, Events
from services.program_service_errors import ProgramServiceValidationError
from services.owned_entity_queries import get_owned_program
from services.serializers import format_utc, serialize_program_day, serialize_goal
from services.session_runtime import get_template_color
from services.program_scope import resolve_program_scopes
from services.calendar_periods import load_calendar_periods
from services.program_day_credits import load_program_credit_candidates, load_program_session_credits
from services.program_day_occurrences import (
    block_for_date,
    build_occurrences,
    evaluate_occurrence,
    program_day_scheduled_on,
    resolve_occurrence_credits,
    weekday_names,
)
from services.program_status_override_queries import load_program_status_overrides
from services.program_focus import assert_day_goals_valid, resolve_focus_scopes
from services.program_calendar_invariants import (
    assert_dates_within_program,
    assert_single_program_day_per_date,
    lock_program_calendar,
)

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # Mixins resolve shared helpers through the composed ProgramService.
    from services._program_helpers import _ProgramHelpersMixin as _ProgramMixinBase
else:
    _ProgramMixinBase = object

logger = logging.getLogger(__name__)


class _ProgramDaysMixin(_ProgramMixinBase):
    @staticmethod
    def _weekday_list(raw) -> List[str]:
        if isinstance(raw, list):
            return [value for value in raw if value]
        return [raw] if raw else []

    @staticmethod
    def _get_program_day(session, program_id: str, day_id: str, *, lock=False):
        query = session.query(ProgramDay).filter_by(id=day_id, program_id=program_id)
        if lock:
            query = query.populate_existing().with_for_update()
        day = query.first()
        if not day:
            raise ValueError("Day not found")
        return day

    @staticmethod
    def _day_template_configs(day) -> List[Dict[str, Any]]:
        return [
            {
                'template_id': link.session_template_id,
                'is_required': bool(link.is_required),
                'order': link.order or index,
            }
            for index, link in enumerate(day.template_links or [])
        ] or [
            {'template_id': template.id, 'is_required': True, 'order': index}
            for index, template in enumerate(day.templates or [])
        ]

    @classmethod
    def create_program_day(
        cls, session, root_id: str, program_id: str, data: Dict,
        current_user_id: str | None = None, *, commit=True, pending_events=None,
    ) -> Dict[str, Any]:
        cls._require_root_access(session, root_id, current_user_id)
        program = lock_program_calendar(session, program_id, root_id)
        if not program:
            raise ValueError("Program not found")

        day_goal_ids = assert_day_goals_valid(
            resolve_focus_scopes(session, root_id, program_id), data.get('goal_ids'),
        ) if data.get('goal_ids') else []
        last_number = session.query(func.max(ProgramDay.day_number)).filter(
            ProgramDay.program_id == program_id,
        ).scalar() or 0
        day = ProgramDay(
            id=str(uuid.uuid4()),
            program_id=program_id,
            day_number=last_number + 1,
            name=data.get('name'),
            notes=data.get('notes'),
            day_of_week=cls._weekday_list(data.get('day_of_week')),
            repeat_every_weeks=data.get('repeat_every_weeks', 1),
            completion_min_templates=data.get('completion_min_templates'),
        )
        session.add(day)
        session.flush()
        if 'template_configs' in data or 'template_ids' in data or 'template_id' in data:
            cls._apply_program_day_template_configs(session, day, cls._normalize_template_configs(data))
        cls._validate_program_day_completion_min(day)
        cls._replace_day_goals(session, day, day_goal_ids, root_id)
        if data.get('excluded_dates'):
            excluded = {value if isinstance(value, date) else date.fromisoformat(str(value))
                        for value in data['excluded_dates']}
            assert_dates_within_program(program, excluded)
            day.occurrence_exclusions = [ProgramDayOccurrenceExclusion(
                date=value, created_by_user_id=current_user_id,
            ) for value in excluded]
        if 'scheduled_dates' in data:
            cls._sync_occurrence_schedules(day, program, data.get('scheduled_dates') or [], current_user_id)

        assert_single_program_day_per_date(session, program_id)
        cls._commit(session, commit=commit)
        cls._queue_or_emit_event(pending_events, Event(Events.PROGRAM_DAY_CREATED, {
            'day_id': day.id,
            'day_name': day.name or f"Day {day.day_number}",
            'program_id': program_id,
            'root_id': root_id,
        }, source='cls.create_program_day'))
        return serialize_program_day(day)

    @classmethod
    def update_program_day(
        cls, session, root_id: str, program_id: str, day_id: str,
        data: Dict, current_user_id: str | None = None, *, commit=True,
        pending_events=None,
    ) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)
        # Program -> day lock order; the program lock serializes every calendar
        # write so the one-day-per-date check holds.
        program = lock_program_calendar(session, program_id, root_id)
        if not program:
            raise ValueError("Program not found")
        syncs_schedule = 'scheduled_dates' in data
        day = cls._get_program_day(session, program_id, day_id, lock=syncs_schedule)

        if 'name' in data: day.name = data['name']
        if 'notes' in data: day.notes = data['notes']
        if 'day_number' in data: day.day_number = data['day_number']
        if 'completion_min_templates' in data:
            day.completion_min_templates = data.get('completion_min_templates')
        if 'day_of_week' in data:
            day.day_of_week = cls._weekday_list(data['day_of_week'])
        if 'repeat_every_weeks' in data:
            day.repeat_every_weeks = data['repeat_every_weeks']
        if 'template_configs' in data or 'template_ids' in data or 'template_id' in data:
            cls._apply_program_day_template_configs(session, day, cls._normalize_template_configs(data))
        cls._validate_program_day_completion_min(day)

        if 'goal_ids' in data:
            day_goal_ids = assert_day_goals_valid(resolve_focus_scopes(session, root_id, program_id), data['goal_ids'])
            cls._replace_day_goals(session, day, day_goal_ids, root_id)

        scheduled_dates_added: List[date] = []
        scheduled_dates_removed: List[date] = []
        if syncs_schedule:
            scheduled_dates_added, scheduled_dates_removed = cls._sync_occurrence_schedules(
                day, program, data.get('scheduled_dates') or [], current_user_id,
            )

        assert_single_program_day_per_date(session, program_id)
        cls._commit(session, day, commit=commit)

        cls._queue_or_emit_event(pending_events, Event(Events.PROGRAM_DAY_UPDATED, {
            'day_id': day.id,
            'day_name': day.name,
            'program_id': program_id,
            'root_id': root_id,
            'updated_fields': list(data.keys()),
            'scheduled_dates_added': [value.isoformat() for value in scheduled_dates_added],
            'scheduled_dates_removed': [value.isoformat() for value in scheduled_dates_removed],
        }, source='cls.update_program_day'))
        return serialize_program_day(day)

    @classmethod
    def delete_program_day(cls, session, root_id: str, program_id: str, day_id: str, current_user_id: str | None = None):
        cls._require_root_access(session, root_id, current_user_id)
        if not lock_program_calendar(session, program_id, root_id):
            raise ValueError("Program not found")
        day = cls._get_program_day(session, program_id, day_id)

        day_name = day.name # Capture before delete
        # Template links are reachable through two relationships (template_links and the
        # templates secondary); remove them once here so the delete doesn't do it twice.
        session.query(ProgramDayTemplate).filter(
            ProgramDayTemplate.program_day_id == day.id,
        ).delete(synchronize_session=False)
        session.expire(day, ['templates', 'template_links'])
        session.delete(day)
        cls._commit(session)

        event_bus.emit(Event(Events.PROGRAM_DAY_DELETED, {
            'day_id': day_id,
            'day_name': day_name,
            'program_id': program_id,
            'root_id': root_id
        }, source='cls.delete_program_day'))

    @classmethod
    def reorder_program_days(
        cls, session, root_id: str, program_id: str, day_ids: List[str], current_user_id: str | None = None,
    ) -> List[Dict[str, Any]]:
        """Set the program's day order (``day_number``) from a full list of its day ids.

        The list must name every day of the program exactly once, so a stale client can't
        drop or duplicate a position; the order is purely presentational.
        """
        cls._require_root_access(session, root_id, current_user_id)
        program = lock_program_calendar(session, program_id, root_id)
        if not program:
            raise ValueError("Program not found")
        days_by_id = {str(day.id): day for day in program.days}
        if set(map(str, day_ids)) != set(days_by_id):
            raise ValueError("day_ids must list every program day exactly once")
        for position, day_id in enumerate(day_ids, start=1):
            day = days_by_id[str(day_id)]
            if day.day_number != position:
                day.day_number = position
        cls._commit(session)
        return [{"id": day_id, "day_number": position} for position, day_id in enumerate(day_ids, start=1)]

    @classmethod
    def duplicate_program_day(cls, session, root_id: str, program_id: str, day_id: str, current_user_id: str | None = None) -> Dict[str, Any]:
        """Copy a day's definition (templates, goals, notes) without its schedule.

        The copy starts unscheduled, so it can never take a date from another day.
        """
        cls._require_root_access(session, root_id, current_user_id)
        if not lock_program_calendar(session, program_id, root_id):
            raise ValueError("Program not found")
        source_day = cls._get_program_day(session, program_id, day_id)
        source_goal_ids = sorted(resolve_focus_scopes(session, root_id, program_id).day_seed_ids.get(str(source_day.id), ()))
        last_number = session.query(func.max(ProgramDay.day_number)).filter(
            ProgramDay.program_id == program_id,
        ).scalar() or 0
        copy = ProgramDay(
            id=str(uuid.uuid4()),
            program_id=program_id,
            day_number=last_number + 1,
            name=f"{source_day.name or 'Program day'} (copy)",
            notes=source_day.notes,
            day_of_week=[],
            completion_min_templates=source_day.completion_min_templates,
        )
        session.add(copy)
        session.flush()
        cls._apply_program_day_template_configs(session, copy, cls._day_template_configs(source_day))
        cls._replace_day_goals(session, copy, source_goal_ids, root_id)
        cls._commit(session, copy)

        event_bus.emit(Event(Events.PROGRAM_DAY_CREATED, {
            'day_id': copy.id,
            'day_name': copy.name,
            'program_id': program_id,
            'root_id': root_id,
        }, source='cls.duplicate_program_day'))
        return serialize_program_day(copy)

    @staticmethod
    def _sync_occurrence_schedules(day, program, scheduled_dates, current_user_id=None):
        """Make ``day``'s explicit occurrence dates exactly ``scheduled_dates``.

        Dates must lie inside the program. Removing a date leaves its sessions
        intact; they simply stop counting as scheduled. Returns the (added, removed) dates.
        """
        wanted = {
            value if isinstance(value, date) else date.fromisoformat(str(value)[:10])
            for value in scheduled_dates
        }
        assert_dates_within_program(program, wanted)

        existing = {row.date: row for row in day.occurrence_schedules or []}
        removed = sorted(set(existing) - wanted)
        added = sorted(wanted - set(existing))
        for value in removed:
            day.occurrence_schedules.remove(existing[value])
        for value in added:
            _ProgramDaysMixin._clear_occurrence_exclusion(day, value)
            day.occurrence_schedules.append(ProgramDayOccurrenceSchedule(
                date=value, created_by_user_id=current_user_id,
            ))
        if added or removed:
            day.row_version = (day.row_version or 1) + 1
        return added, removed

    @classmethod
    def schedule_program_day(
        cls,
        session,
        root_id: str,
        program_id: str,
        day_id: str,
        data: Dict,
        current_user_id: str | None = None,
        *,
        commit=True,
        pending_events=None,
    ) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)

        # Program -> day lock order, shared with reviewed agent snapshots. Ordinary
        # UI schedules advance the same row version used by agent proposals.
        program = lock_program_calendar(session, program_id, root_id)
        if not program:
            raise ValueError("Program not found")
        day = cls._get_program_day(session, program_id, day_id, lock=True)

        scheduled_date = cls._resolve_schedule_date(data)
        assert_dates_within_program(program, [scheduled_date])
        if program_day_scheduled_on(day, program, scheduled_date):
            raise ValueError("This program day already occurs on that date")

        cls._clear_occurrence_exclusion(day, scheduled_date)
        schedule_row = ProgramDayOccurrenceSchedule(
            program_day_id=day.id,
            date=scheduled_date,
            created_by_user_id=current_user_id,
        )
        session.add(schedule_row)
        day.row_version += 1
        assert_single_program_day_per_date(session, program_id)
        cls._commit(session, day, commit=commit)

        cls._queue_or_emit_event(pending_events, Event(Events.PROGRAM_DAY_SCHEDULED, {
            'day_id': day.id,
            'day_name': day.name,
            'program_id': program_id,
            'root_id': root_id,
            'scheduled_date': scheduled_date.isoformat(),
            'schedule_id': schedule_row.id,
        }, source='cls.schedule_program_day'))
        return {
            "id": schedule_row.id,
            "program_day_id": day.id,
            "program_id": program_id,
            "name": day.name,
            "date": scheduled_date.isoformat(),
        }

    @staticmethod
    def _resolve_schedule_date(data: Dict) -> date:
        """Accept an ISO ``date``; ``session_start`` is a one-release compatibility input."""
        raw_date = data.get('date')
        if raw_date:
            try:
                return date.fromisoformat(str(raw_date))
            except ValueError:
                raise ValueError("Invalid date format")
        session_start = data.get('session_start')
        if not session_start:
            raise ValueError("date is required")
        try:
            normalized = datetime.fromisoformat(str(session_start).replace('Z', '+00:00'))
        except ValueError:
            raise ValueError("Invalid session_start format")
        return normalized.date()

    @staticmethod
    def _remove_occurrence(day, target_date, current_user_id):
        rows = [row for row in day.occurrence_schedules if row.date == target_date]
        for row in rows:
            day.occurrence_schedules.remove(row)
        if target_date.strftime('%A') in weekday_names(day):
            if not any(row.date == target_date for row in day.occurrence_exclusions):
                day.occurrence_exclusions.append(ProgramDayOccurrenceExclusion(
                    date=target_date, created_by_user_id=current_user_id,
                ))
        day.row_version += 1
        return len(rows)

    @staticmethod
    def _clear_occurrence_exclusion(day, target_date):
        for row in list(day.occurrence_exclusions):
            if row.date == target_date:
                day.occurrence_exclusions.remove(row)

    @staticmethod
    def _clear_date_statuses(session, program_id, dates):
        session.query(ProgramDayStatusOverride).filter(
            ProgramDayStatusOverride.program_id == program_id,
            ProgramDayStatusOverride.date.in_(dates),
        ).delete(synchronize_session='fetch')

    @classmethod
    def unschedule_program_day_occurrence(cls, session, root_id: str, program_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict[str, Any]:
        cls._require_root_access(session, root_id, current_user_id)
        program = lock_program_calendar(session, program_id, root_id)
        if not program:
            raise ValueError("Program not found")
        day = cls._get_program_day(session, program_id, day_id, lock=True)
        target_date = cls._parse_required_date(data.get('date'), 'date')
        assert_dates_within_program(program, [target_date])
        changed = program_day_scheduled_on(day, program, target_date)
        removed_count = cls._remove_occurrence(day, target_date, current_user_id) if changed else 0
        if changed:
            cls._clear_date_statuses(session, program_id, [target_date])
        assert_single_program_day_per_date(session, program_id)
        cls._commit(session, day)
        if changed:
            event_bus.emit(Event(Events.PROGRAM_DAY_UNSCHEDULED, {
                'day_id': day.id, 'day_name': day.name, 'program_id': program_id,
                'root_id': root_id, 'date': target_date.isoformat(),
                'removed_schedule_count': removed_count,
                'removed_session_ids': [], 'removed_count': 0,
            }, source='cls.unschedule_program_day_occurrence'))
        return {
            'day': serialize_program_day(day), 'removed_schedule_count': removed_count,
            'removed_session_ids': [], 'removed_count': 0,
        }

    @classmethod
    def move_program_day_occurrence(cls, session, root_id: str, program_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict[str, Any]:
        cls._require_root_access(session, root_id, current_user_id)
        program = lock_program_calendar(session, program_id, root_id)
        if not program:
            raise ValueError("Program not found")
        source = cls._parse_required_date(data.get('source_date'), 'source_date')
        target = cls._parse_required_date(data.get('target_date'), 'target_date')
        assert_dates_within_program(program, [source, target])
        if source == target:
            raise ValueError("Choose a different destination date")
        # Lock in stable order, also serializing dated plan writes on affected days.
        days = session.query(ProgramDay).filter_by(program_id=program_id).order_by(
            ProgramDay.id,
        ).populate_existing().with_for_update().all()
        day = next((entry for entry in days if entry.id == day_id), None)
        if not day:
            raise ValueError("Day not found")
        if not program_day_scheduled_on(day, program, source):
            raise ProgramServiceValidationError({
                'error': 'This program day no longer occurs on the source date.',
                'code': 'program_day_source_missing',
            }, 409)
        displaced = next((entry for entry in days if program_day_scheduled_on(entry, program, target)), None)
        cls._remove_occurrence(day, source, current_user_id)
        if displaced:
            cls._remove_occurrence(displaced, target, current_user_id)
        cls._clear_occurrence_exclusion(day, target)
        session.flush()  # Delete a same-definition destination row before reusing its unique key.
        day.occurrence_schedules.append(ProgramDayOccurrenceSchedule(
            date=target, created_by_user_id=current_user_id,
        ))
        plans = session.query(ProgramSessionPlan).filter(
            ProgramSessionPlan.program_day_id == day_id,
            ProgramSessionPlan.date == source,
            ProgramSessionPlan.deleted_at.is_(None),
        ).order_by(ProgramSessionPlan.id).with_for_update().all()
        if plans:
            conflicts = session.query(ProgramSessionPlan).filter(
                ProgramSessionPlan.program_day_id == day_id,
                ProgramSessionPlan.date == target,
                ProgramSessionPlan.session_template_id.in_([plan.session_template_id for plan in plans]),
                ProgramSessionPlan.deleted_at.is_(None),
            ).with_for_update().all()
            for conflict in conflicts:
                conflict.deleted_at = datetime.now(timezone.utc)
            session.flush()  # Release destination unique keys before moving source plans.
            for plan in plans:
                plan.date = target
        cls._clear_date_statuses(session, program_id, [source, target])
        assert_single_program_day_per_date(session, program_id)
        cls._commit(session, day)
        result = {
            'program_day_id': day_id, 'program_id': program_id,
            'source_date': source.isoformat(), 'target_date': target.isoformat(),
            'displaced_day_id': displaced.id if displaced else None,
        }
        event_bus.emit(Event(Events.PROGRAM_DAY_MOVED, {
            **result, 'root_id': root_id, 'day_name': day.name,
        }, source='cls.move_program_day_occurrence'))
        return result

    @classmethod
    def set_goal_deadline_for_program_date(cls, session, root_id: str, program_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)

        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found")

        goal_id = data.get('goal_id')
        if not goal_id:
            raise ValueError("Goal ID required")

        deadline_value = cls._normalize_deadline_value(data.get('deadline'))
        deadline_date = cls._parse_required_date(deadline_value, 'deadline')
        program_start = cls._normalize_goal_date(program.start_date)
        program_end = cls._normalize_goal_date(program.end_date)
        if program_start and deadline_date < program_start or program_end and deadline_date > program_end:
            raise ValueError("Goal deadline must be within the program date range")

        goal = session.query(Goal).filter(
            Goal.id == goal_id,
            Goal.root_id == root_id,
            Goal.deleted_at == None
        ).first()
        if not goal:
            raise ValueError("Goal not found in this fractal")

        cls._validate_goal_in_program_scope(session, program, root_id, goal_id)
        cls._apply_goal_deadline_with_program_rules(session, root_id, current_user_id, goal, deadline_value)

        cls._commit(session, goal)
        return serialize_goal(goal, include_children=False)

    @classmethod
    def get_active_program_days(
        cls,
        session,
        root_id: str,
        current_user_id: str | None = None,
        *,
        target_date: date | None = None,
        timezone_name: str | None = None,
    ) -> List[Dict]:
        cls._require_root_access(session, root_id, current_user_id)
        try:
            zone = ZoneInfo(timezone_name or "UTC")
        except ZoneInfoNotFoundError:
            raise ValueError("Invalid timezone")
        if target_date:
            today = target_date
        else:
            today = datetime.now(zone).date()
        day_start = datetime.combine(today, time.min, tzinfo=zone).astimezone(timezone.utc)
        next_day_start = datetime.combine(today + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc)
        
        from sqlalchemy.orm import selectinload
        active_programs = session.query(Program).options(
            selectinload(Program.blocks),
            selectinload(Program.days).selectinload(ProgramDay.templates),
            selectinload(Program.days)
                .selectinload(ProgramDay.template_links)
                .selectinload(ProgramDayTemplate.template)
        ).filter(
            Program.root_id == root_id,
            Program.start_date < next_day_start,
            Program.end_date >= day_start,
        ).all()
        
        result = []
        scopes = resolve_program_scopes(session, root_id, [program.id for program in active_programs])
        status_overrides = load_program_status_overrides(
            session, [program.id for program in active_programs], today, today,
        )
        manual_status_by_program = {
            program_id: rows[0].status
            for program_id, rows in status_overrides.items()
        }
        protecting_period = next((
            period for period in load_calendar_periods(session, root_id, current_user_id, today, today)
            if period.protects_streaks
        ), None)
        stored_credits = load_program_session_credits(
            session, [program.id for program in active_programs], today, today,
        )
        candidates = load_program_credit_candidates(
            session, root_id, current_user_id, active_programs,
            day_start, next_day_start, stored_credits,
        )
        credits_by_occurrence = {}
        for program in active_programs:
            program_credits, _session_facts = resolve_occurrence_credits(
                build_occurrences(program, today, today), candidates[program.id], zone,
                program_id=program.id, session_credits=stored_credits.get(program.id, []),
            )
            credits_by_occurrence.update(program_credits)
        
        for program in active_programs:
            program_scope = scopes.get(program.id)
            block = block_for_date(program, today)
            for day in program.days:
                if day.templates and cls._program_day_scheduled_on(day, program, today):
                    session_details = []
                    template_rules = {
                        link.session_template_id: {
                            "is_required": bool(link.is_required),
                            "order": link.order or 0,
                        }
                        for link in (day.template_links or [])
                    }
                    for index, template in enumerate(day.templates):
                        template_rule = template_rules.get(template.id, {})
                        template_data = _safe_load_json(template.template_data, {})
                        session_details.append({
                            "template_id": template.id,
                            "template_name": template.name,
                            "template_description": template.description,
                            "template_data": template_data,
                            "template_color": get_template_color(template_data),
                            "is_archived": bool(getattr(template, "archived_at", None)),
                            "archived_at": format_utc(getattr(template, "archived_at", None)),
                            "is_used_in_active_program": True,
                            "is_effectively_active": True,
                            "is_required": template_rule.get("is_required", True),
                            "order": template_rule.get("order", index),
                        })

                    occurrence_credits = credits_by_occurrence.get((day.id, today), [])
                    evaluation = evaluate_occurrence(day, occurrence_credits)
                    result.append({
                        "program_id": program.id,
                        "program_name": program.name,
                        "program_color": program.color,
                        "block_id": block.id if block else None,
                        "block_name": block.name if block else None,
                        "block_color": block.color if block else None,
                        "program_goal_ids": [g.id for g in program.goals],
                        "scope_seed_goal_ids": sorted(getattr(program_scope, "seed_goal_ids", ()) or ()),
                        "scope_goal_ids": sorted(getattr(program_scope, "goal_ids", ()) or ()),
                        "day_id": day.id,
                        "day_name": day.name,
                        "day_number": day.day_number,
                        "manual_status": manual_status_by_program.get(program.id),
                        "time_off": {
                            "id": protecting_period.id,
                            "name": protecting_period.name,
                            "kind": protecting_period.kind,
                        } if protecting_period else None,
                        "completion_min_templates": day.completion_min_templates,
                        "sessions": session_details,
                        "completed_session_count": len({
                            entry["session"].id for entry in occurrence_credits
                            if entry["session"].completed
                        }),
                        "completed_template_ids": evaluation["completed_template_ids"],
                    })
        return result
