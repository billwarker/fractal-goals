"""Occurrence-level manual status mutations for program calendar dates."""

from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func

from models import Program, ProgramDayStatusOverride, Session
from services import Event, Events, event_bus
from services.program_day_occurrences import date_part, effective_session_date, program_day_scheduled_on
from services.program_service_errors import ProgramServiceValidationError
from services.session_filters import resolve_timezone


class _ProgramDayStatusesMixin:
    @classmethod
    def set_program_day_statuses(cls, session, root_id, program_id, data, current_user_id):
        cls._require_root_access(session, root_id, current_user_id)
        zone = resolve_timezone(data.get("timezone"))
        if zone is None:
            raise ProgramServiceValidationError({"error": "Invalid timezone"})

        program = session.query(Program).options(
            *cls._program_serializer_load_options()
        ).filter(
            Program.id == program_id,
            Program.root_id == root_id,
        ).with_for_update().first()
        if not program:
            raise ProgramServiceValidationError("Program not found", 404)

        dates = sorted(set(data["dates"]))
        status = data["status"]
        program_start = date_part(program.start_date)
        program_end = date_part(program.end_date)
        existing = {
            row.date: row
            for row in session.query(ProgramDayStatusOverride).filter(
                ProgramDayStatusOverride.program_id == program_id,
                ProgramDayStatusOverride.date.in_(dates),
            ).all()
        }
        scheduled = {
            day_value
            for day_value in dates
            if program_start <= day_value <= program_end and any(
                program_day_scheduled_on(day, block, day_value)
                for block in program.blocks or []
                for day in block.days or []
            )
        }
        invalid = []
        local_today = datetime.now(zone).date()
        for day_value in dates:
            # Automatic is also allowed to clear a dormant override after a
            # schedule edit makes its original occurrence ineligible.
            if day_value not in scheduled and not (
                status == "automatic" and day_value in existing
            ):
                invalid.append({"date": day_value.isoformat(), "reason": "not_scheduled"})
            elif status == "complete" and day_value > local_today:
                invalid.append({"date": day_value.isoformat(), "reason": "future_complete"})
        if invalid:
            raise ProgramServiceValidationError({
                "error": "One or more dates are not eligible",
                "code": "ineligible_dates",
                "dates": invalid,
            })

        evidence_dates = []
        if status == "rest":
            start = datetime.combine(dates[0], time.min, tzinfo=zone).astimezone(timezone.utc)
            end = datetime.combine(dates[-1] + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc)
            effective = func.coalesce(Session.session_start, Session.completed_at, Session.created_at)
            rows = session.query(Session).filter(
                Session.root_id == root_id,
                Session.owner_id == current_user_id,
                Session.program_id == program_id,
                Session.program_day_id.isnot(None),
                Session.completed.is_(True),
                Session.deleted_at.is_(None),
                effective >= start,
                effective < end,
            ).all()
            requested = set(dates)
            evidence_dates = sorted({
                local_date
                for row in rows
                if (local_date := effective_session_date(row, zone)) in requested
            })
            if evidence_dates and not data.get("acknowledge_completed_evidence"):
                raise ProgramServiceValidationError({
                    "error": "Completed sessions exist on one or more selected dates",
                    "code": "completed_evidence_confirmation_required",
                    "dates": [value.isoformat() for value in evidence_dates],
                }, 409)

        if status == "automatic":
            for row in existing.values():
                session.delete(row)
        else:
            for day_value in dates:
                row = existing.get(day_value)
                if row is None:
                    session.add(ProgramDayStatusOverride(
                        program_id=program_id,
                        date=day_value,
                        status=status,
                        set_by_user_id=current_user_id,
                    ))
                else:
                    row.status = status
                    row.set_by_user_id = current_user_id

        session.commit()
        event_bus.emit(Event(Events.PROGRAM_DAY_STATUSES_UPDATED, {
            "root_id": root_id,
            "program_id": program_id,
            "program_name": program.name,
            "status": status,
            "dates": [value.isoformat() for value in dates],
            "date_count": len(dates),
            "evidence_dates": [value.isoformat() for value in evidence_dates],
        }, source="ProgramService.set_program_day_statuses"))
        return {
            "program_id": program_id,
            "status": status,
            "dates": [value.isoformat() for value in dates],
            "updated_count": len(dates),
        }
