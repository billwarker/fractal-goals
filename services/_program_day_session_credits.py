"""Occurrence-level session credit mutations for program calendar dates."""

from datetime import datetime

from models import Program, ProgramDaySessionCredit, Session
from services import Event, Events, event_bus
from services.program_day_occurrences import (
    build_occurrences,
    effective_session_date,
    resolve_occurrence_credits,
)
from services.program_service_errors import ProgramServiceValidationError
from models.program import get_program_day_template_rules
from services.session_filters import resolve_timezone


def _ineligible(code, message):
    return ProgramServiceValidationError({"error": message, "code": code})


class _ProgramDaySessionCreditsMixin:
    @classmethod
    def set_program_day_session_credit(cls, session, root_id, program_id, data, current_user_id):
        """Credit, exclude, or restore automatic attribution of one session on one date."""
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

        day_value = data["date"]
        disposition = data["disposition"]
        session_row = session.query(Session).filter(
            Session.id == data["session_id"],
            Session.root_id == root_id,
            Session.owner_id == current_user_id,
            Session.deleted_at.is_(None),
        ).first()
        if not session_row:
            raise ProgramServiceValidationError("Session not found", 404)
        existing = session.query(ProgramDaySessionCredit).filter(
            ProgramDaySessionCredit.program_id == program_id,
            ProgramDaySessionCredit.date == day_value,
            ProgramDaySessionCredit.session_id == session_row.id,
        ).first()

        if disposition == "automatic":
            if existing is not None:
                session.delete(existing)
        else:
            template_id = cls._validate_session_credit(
                program, session_row, day_value, disposition, data.get("template_id"), zone,
            )
            if existing is None:
                session.add(ProgramDaySessionCredit(
                    program_id=program_id,
                    date=day_value,
                    session_id=session_row.id,
                    disposition=disposition,
                    template_id=template_id,
                    set_by_user_id=current_user_id,
                ))
            else:
                existing.disposition = disposition
                existing.template_id = template_id
                existing.set_by_user_id = current_user_id

        session.commit()
        event_bus.emit(Event(Events.PROGRAM_DAY_SESSION_CREDIT_UPDATED, {
            "root_id": root_id,
            "program_id": program_id,
            "program_name": program.name,
            "date": day_value.isoformat(),
            "session_id": session_row.id,
            "disposition": disposition,
            "template_id": data.get("template_id") if disposition == "credit" else None,
        }, source="ProgramService.set_program_day_session_credit"))
        return {
            "program_id": program_id,
            "date": day_value.isoformat(),
            "session_id": session_row.id,
            "disposition": disposition,
        }

    @staticmethod
    def _validate_session_credit(program, session_row, day_value, disposition, template_id, zone):
        if day_value > datetime.now(zone).date():
            raise _ineligible("future_date", "Sessions can only be credited through today")
        if effective_session_date(session_row, zone) != day_value:
            raise _ineligible("session_not_on_date", "Session did not take place on this date")
        if not session_row.completed:
            raise _ineligible("session_incomplete", "Only completed sessions can be credited")
        occurrences_by_date = build_occurrences(program, day_value, day_value)
        occurrence_rows = occurrences_by_date.get(day_value, [])
        if not occurrence_rows:
            raise _ineligible("not_scheduled", "This date has no scheduled program day")
        if disposition == "credit":
            scheduled_template_ids = {
                rule["template_id"]
                for row in occurrence_rows
                for rule in get_program_day_template_rules(row["program_day"])
            }
            if template_id not in scheduled_template_ids:
                raise _ineligible("template_not_scheduled", "That template is not scheduled on this date")
            return template_id
        _credits, session_facts = resolve_occurrence_credits(
            occurrences_by_date, [session_row], zone, program_id=program.id,
        )
        if not session_facts.get(day_value, {}).get(session_row.id, {}).get("source"):
            raise _ineligible("no_automatic_credit", "This session is not automatically credited")
        return None
