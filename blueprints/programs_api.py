from flask import Blueprint, request, jsonify
from datetime import date, datetime
import logging
import time
import models
from sqlalchemy.exc import SQLAlchemyError
from models import get_session
from validators import (
    ProgramCreateSchema,
    ProgramUpdateSchema,
    ProgramDayCreateSchema,
    ProgramDayUpdateSchema,
    ProgramDayOrderSchema,
    ProgramDayScheduleSchema,
    ProgramDayOccurrenceUnscheduleSchema,
    ProgramDayOccurrenceMoveSchema,
    ProgramDayStatusesUpdateSchema,
    ProgramDaySessionCreditSchema,
    ProgramGoalDeadlineSchema,
    ProgramBlockSchema,
    ProgramBlockUpdateSchema,
    ProgramDayGoalAttachSchema,
    validate_request
)
from services.programs import ProgramService, ProgramServiceValidationError
from blueprints.auth_api import token_required
from blueprints.api_utils import get_db_session, internal_error, parse_optional_pagination
from services import event_bus, Event, Events
from services.program_metrics_service import ProgramMetricsService
from services.program_day_read_model_service import ProgramDayReadModelService
from services.program_calendar_feed_service import ProgramCalendarFeedService
from services.session_filters import resolve_timezone

logger = logging.getLogger(__name__)

# Create blueprint
programs_bp = Blueprint('programs', __name__, url_prefix='/api')


def _program_service_error_response(error: ProgramServiceValidationError):
    return jsonify(error.payload if isinstance(error.payload, dict) else {"error": str(error)}), error.status_code


def _request_timezone_and_date():
    timezone_name = request.args.get("timezone") or "UTC"
    zone = resolve_timezone(timezone_name)
    if zone is None:
        return None, None
    return timezone_name, datetime.now(zone).date()


def _get_program_response(current_user, root_id, *, calendar_summary=False):
    """Share the scoped read and database error boundary for program lists."""
    session = get_db_session()
    try:
        if calendar_summary:
            return jsonify(ProgramService.get_program_summaries(session, root_id, current_user.id))
        timezone_name, as_of = _request_timezone_and_date()
        if timezone_name is None:
            return jsonify({"error": "Invalid timezone"}), 400
        programs = ProgramService.get_programs(session, root_id, current_user.id, as_of=as_of)
        limit, offset = parse_optional_pagination(request, max_limit=200)
        if limit is not None:
            programs = programs[offset: offset + limit]
        return jsonify(programs)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error getting programs")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

# ============================================================================
# PROGRAM ENDPOINTS
# ============================================================================

@programs_bp.route('/<root_id>/programs', methods=['GET'])
@token_required
def get_programs(current_user, root_id):
    """Get all training programs for a fractal if owned by user."""
    return _get_program_response(current_user, root_id)


@programs_bp.route('/<root_id>/programs/calendar', methods=['GET'])
@token_required
def get_program_calendar_summaries(current_user, root_id):
    """Get every program's name, color, and span; date-bounded content is the calendar feed."""
    return _get_program_response(current_user, root_id, calendar_summary=True)


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['GET'])
@token_required
def get_program(current_user, root_id, program_id):
    """Get a specific training program if owned by user."""
    session = get_db_session()
    try:
        timezone_name, as_of = _request_timezone_and_date()
        if timezone_name is None:
            return jsonify({"error": "Invalid timezone"}), 400
        program = ProgramService.get_program(session, root_id, program_id, current_user.id, as_of=as_of)
        if program is None:
            return jsonify({"error": "Program not found"}), 404
        return jsonify(program)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error getting program")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>/metrics', methods=['GET'])
@token_required
def get_program_metrics(current_user, root_id, program_id):
    session = get_db_session()
    started = time.perf_counter()
    try:
        payload, error, status = ProgramMetricsService(session).get_program_metrics(
            root_id,
            program_id,
            current_user.id,
            timezone_name=request.args.get('timezone'),
            range_start=request.args.get('range_start'),
            range_end=request.args.get('range_end'),
            dates=request.args.get('dates'),
        )
        if error:
            return jsonify({"error": error}), status
        response = jsonify(payload)
        logger.info(
            "program_metrics_response program_id=%s calculation_version=%s response_bytes=%s request_ms=%.2f",
            program_id, payload.get("calculation_version"), len(response.get_data()),
            (time.perf_counter() - started) * 1000,
        )
        return response
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error calculating program metrics")
        return internal_error(logger, "Program metrics request failed")
    finally:
        session.close()


def _calendar_read_model_response(label, build):
    """Shared request boundary for timezone-scoped calendar read models.

    ``build(session, timezone_name)`` returns ``(payload, error, status)`` or a
    ready response for request-shape errors.
    """
    session = get_db_session()
    try:
        timezone_name = request.args.get('timezone')
        if not timezone_name:
            return jsonify({"error": "Timezone is required."}), 400
        payload, error, status = build(session, timezone_name)
        if error or payload is None:
            return jsonify({"error": error or f"{label.capitalize()} is unavailable"}), status
        return payload
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error building %s", label)
        return internal_error(logger, f"{label.capitalize()} request failed")
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/calendar-feed', methods=['GET'])
@token_required
def get_program_calendar_feed(current_user, root_id):
    """Everything the program calendar draws for one bounded date range, across programs."""
    started = time.perf_counter()

    def build(session, timezone_name):
        payload, error, status = ProgramCalendarFeedService(session).get(
            root_id,
            current_user.id,
            range_start=request.args.get('range_start'),
            range_end=request.args.get('range_end'),
            timezone_name=timezone_name,
        )
        if error:
            return payload, error, status
        response = jsonify(payload)
        logger.info(
            "calendar_feed_response range=%s..%s programs=%s days=%s session_days=%s "
            "response_bytes=%s request_ms=%.2f",
            payload["range"]["start"], payload["range"]["end"], len(payload["programs"]),
            len(payload["program_days"]), len(payload["completed_session_days"]),
            len(response.get_data()), (time.perf_counter() - started) * 1000,
        )
        # Revalidate every time; an unchanged chunk answers 304 without a body.
        response.headers["Cache-Control"] = "private, no-cache"
        response.add_etag(weak=True)
        return response.make_conditional(request), None, 200

    return _calendar_read_model_response("program calendar feed", build)


@programs_bp.route('/<root_id>/programs/<program_id>/day-read-model', methods=['GET'])
@token_required
def get_program_day_read_model(current_user, root_id, program_id):
    if request.args.get('date'):
        return jsonify({"error": "Use range_start and range_end."}), 400

    def build(session, timezone_name):
        payload, error, status = ProgramDayReadModelService(session).get(
            root_id,
            program_id,
            current_user.id,
            range_start=request.args.get('range_start'),
            range_end=request.args.get('range_end'),
            timezone_name=timezone_name,
            detail_date=request.args.get('detail_date'),
            session_limit=request.args.get('session_limit', 50),
            session_cursor=request.args.get('session_cursor'),
        )
        return (jsonify(payload) if payload is not None else None), error, status

    return _calendar_read_model_response("program day read model", build)


@programs_bp.route('/<root_id>/programs/<program_id>/day-statuses', methods=['PATCH'])
@token_required
@validate_request(ProgramDayStatusesUpdateSchema)
def update_program_day_statuses(current_user, root_id, program_id, validated_data):
    """Atomically set or clear occurrence-level manual day statuses."""
    session = get_db_session()
    try:
        result = ProgramService.set_program_day_statuses(
            session, root_id, program_id, validated_data, current_user.id
        )
        return jsonify(result)
    except ProgramServiceValidationError as exc:
        session.rollback()
        return _program_service_error_response(exc)
    except ValueError as exc:
        session.rollback()
        return jsonify({"error": str(exc)}), 400
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>/day-session-credits', methods=['PUT'])
@token_required
@validate_request(ProgramDaySessionCreditSchema)
def update_program_day_session_credit(current_user, root_id, program_id, validated_data):
    """Credit, exclude, or restore automatic attribution of one session on one date."""
    session = get_db_session()
    try:
        result = ProgramService.set_program_day_session_credit(
            session, root_id, program_id, validated_data, current_user.id
        )
        day_value = result["date"]
        day, error, status = ProgramDayReadModelService(session).get(
            root_id,
            program_id,
            current_user.id,
            range_start=day_value,
            range_end=day_value,
            timezone_name=validated_data["timezone"],
            detail_date=day_value,
            session_limit=20,
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify({**result, "day": day})
    except ProgramServiceValidationError as exc:
        session.rollback()
        return _program_service_error_response(exc)
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/metrics/comparison', methods=['GET'])
@token_required
def get_program_metrics_comparison(current_user, root_id):
    session = get_db_session()
    started = time.perf_counter()
    try:
        payload, error, status = ProgramMetricsService(session).get_program_comparison(
            root_id,
            current_user.id,
            anchor_program_id=request.args.get('anchor_program_id'),
            limit=request.args.get('limit', 5),
            timezone_name=request.args.get('timezone'),
        )
        if error:
            return jsonify({"error": error}), status
        response = jsonify(payload)
        logger.info(
            "program_metrics_comparison_response program_count=%s calculation_version=%s response_bytes=%s request_ms=%.2f",
            len(payload.get("programs", [])), payload.get("calculation_version"), len(response.get_data()),
            (time.perf_counter() - started) * 1000,
        )
        return response
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error calculating program metrics comparison")
        return internal_error(logger, "Program metrics comparison request failed")
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs', methods=['POST'])
@token_required
@validate_request(ProgramCreateSchema)
def create_program(current_user, root_id, validated_data):
    """Create a new training program if owned by user."""
    session = get_db_session()
    try:
        result = ProgramService.create_program(session, root_id, validated_data, current_user.id)
        return jsonify(result), 201
    except ProgramServiceValidationError as e:
        return _program_service_error_response(e)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error creating program")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['PUT'])
@token_required
@validate_request(ProgramUpdateSchema)
def update_program(current_user, root_id, program_id, validated_data):
    """Update a training program if owned by user."""
    session = get_db_session()
    try:
        result = ProgramService.update_program(session, root_id, program_id, validated_data, current_user.id)
        if not result:
            return jsonify({"error": "Program not found"}), 404
        return jsonify(result)
    except ProgramServiceValidationError as e:
        session.rollback()
        return _program_service_error_response(e)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error updating program")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['DELETE'])
@token_required
def delete_program(current_user, root_id, program_id):
    """Delete a training program if owned by user."""
    session = get_db_session()
    try:
        result = ProgramService.delete_program(session, root_id, program_id, current_user.id)
        return jsonify({
            "message": "Program deleted successfully",
            "affected_sessions": result["affected_sessions"]
        })
    except ValueError as e:
         return jsonify({"error": str(e)}), 404
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error deleting program")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/session-count', methods=['GET'])
@token_required
def get_program_session_count(current_user, root_id, program_id):
    """Get the count of sessions associated with a program if owned by user."""
    session = get_db_session()
    try:
        count = ProgramService.get_program_session_count(session, root_id, program_id, current_user.id)
        return jsonify({"session_count": count})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error getting program session count")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

# =============================================================================
# BLOCK MANAGEMENT
# =============================================================================

@programs_bp.route('/<root_id>/programs/<program_id>/blocks', methods=['POST'])
@token_required
@validate_request(ProgramBlockSchema)
def create_block(current_user, root_id, program_id, validated_data):
    """Create a new program block."""
    session = get_db_session()
    try:
        block_dict = ProgramService.create_block(session, root_id, program_id, validated_data, current_user.id)
        return jsonify(block_dict), 201
    except ProgramServiceValidationError as e:
        session.rollback()
        return _program_service_error_response(e)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error creating program block")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>', methods=['PUT'])
@token_required
@validate_request(ProgramBlockUpdateSchema)
def update_block(current_user, root_id, program_id, block_id, validated_data):
    """Update a specific program block."""
    session = get_db_session()
    try:
        block_dict = ProgramService.update_block(session, root_id, program_id, block_id, validated_data, current_user.id)
        return jsonify(block_dict)
    except ProgramServiceValidationError as e:
        session.rollback()
        return _program_service_error_response(e)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error updating program block")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>', methods=['DELETE'])
@token_required
def delete_block(current_user, root_id, program_id, block_id):
    """Delete a program block."""
    session = get_db_session()
    try:
        ProgramService.delete_block(session, root_id, program_id, block_id, current_user.id)
        return jsonify({"message": "Block deleted"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error deleting program block")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

def _program_day_write(log_message, write, respond):
    """Shared transaction boundary for program-day writes."""
    session = get_db_session()
    try:
        return respond(write(session))
    except ProgramServiceValidationError as e:
        session.rollback()
        return _program_service_error_response(e)
    except ValueError as e:
        session.rollback()
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception(log_message)
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

# Program days belong to the program; blocks only label the dates they cover.

@programs_bp.route('/<root_id>/programs/<program_id>/days', methods=['POST'])
@token_required
@validate_request(ProgramDayCreateSchema)
def create_program_day(current_user, root_id, program_id, validated_data):
    """Create a program day; its weekdays repeat across the whole program."""
    return _program_day_write(
        "Error creating program day",
        lambda session: ProgramService.create_program_day(
            session, root_id, program_id, validated_data, current_user.id,
        ),
        lambda day: (jsonify(day), 201),
    )

@programs_bp.route('/<root_id>/programs/<program_id>/days/order', methods=['PUT'])
@token_required
@validate_request(ProgramDayOrderSchema)
def reorder_program_days(current_user, root_id, program_id, validated_data):
    """Arrange the program's days: the full list of day ids in their new order."""
    return _program_day_write(
        "Error reordering program days",
        lambda session: ProgramService.reorder_program_days(
            session, root_id, program_id, validated_data['day_ids'], current_user.id,
        ),
        lambda days: jsonify({"days": days}),
    )

@programs_bp.route('/<root_id>/programs/<program_id>/days/<day_id>', methods=['PUT'])
@token_required
@validate_request(ProgramDayUpdateSchema)
def update_program_day(current_user, root_id, program_id, day_id, validated_data):
    """Update a program day."""
    return _program_day_write(
        "Error updating program day",
        lambda session: ProgramService.update_program_day(
            session, root_id, program_id, day_id, validated_data, current_user.id,
        ),
        jsonify,
    )

@programs_bp.route('/<root_id>/programs/<program_id>/days/<day_id>', methods=['DELETE'])
@token_required
def delete_program_day(current_user, root_id, program_id, day_id):
    """Delete a program day."""
    return _program_day_write(
        "Error deleting program day",
        lambda session: ProgramService.delete_program_day(
            session, root_id, program_id, day_id, current_user.id,
        ),
        lambda _result: jsonify({"message": "Day deleted"}),
    )

@programs_bp.route('/<root_id>/programs/<program_id>/days/<day_id>/duplicate', methods=['POST'])
@token_required
def duplicate_program_day(current_user, root_id, program_id, day_id):
    """Copy a program day's definition as a new, unscheduled day."""
    return _program_day_write(
        "Error duplicating program day",
        lambda session: ProgramService.duplicate_program_day(
            session, root_id, program_id, day_id, current_user.id,
        ),
        lambda day: (jsonify(day), 201),
    )

@programs_bp.route('/<root_id>/programs/<program_id>/days/<day_id>/schedule', methods=['POST'])
@token_required
@validate_request(ProgramDayScheduleSchema)
def schedule_program_day(current_user, root_id, program_id, day_id, validated_data):
    """Schedule a reusable program day as an occurrence on one calendar date."""
    return _program_day_write(
        "Error scheduling program day",
        lambda session: ProgramService.schedule_program_day(
            session, root_id, program_id, day_id, validated_data, current_user.id,
        ),
        lambda occurrence: (jsonify(occurrence), 201),
    )

@programs_bp.route('/<root_id>/programs/<program_id>/days/<day_id>/move', methods=['POST'])
@token_required
@validate_request(ProgramDayOccurrenceMoveSchema)
def move_program_day_occurrence(current_user, root_id, program_id, day_id, validated_data):
    """Atomically move a scheduled day and its plans to another date."""
    return _program_day_write(
        "Error moving program day occurrence",
        lambda session: ProgramService.move_program_day_occurrence(
            session, root_id, program_id, day_id, validated_data, current_user.id,
        ),
        jsonify,
    )


@programs_bp.route('/<root_id>/programs/<program_id>/days/<day_id>/unschedule', methods=['POST'])
@token_required
@validate_request(ProgramDayOccurrenceUnscheduleSchema)
def unschedule_program_day_occurrence(current_user, root_id, program_id, day_id, validated_data):
    """Remove a scheduled program-day occurrence from a calendar date."""
    return _program_day_write(
        "Error unscheduling program day occurrence",
        lambda session: ProgramService.unschedule_program_day_occurrence(
            session, root_id, program_id, day_id, validated_data, current_user.id,
        ),
        jsonify,
    )

@programs_bp.route('/<root_id>/programs/day-options', methods=['GET'])
@programs_bp.route('/<root_id>/programs/active-days', methods=['GET'])
@token_required
def get_active_program_days(current_user, root_id):
    """Get date-specific program session options; active-days remains a compatibility alias."""
    session = get_db_session()
    try:
        target_date = None
        raw_date = request.args.get('date')
        if raw_date:
            try:
                target_date = date.fromisoformat(raw_date)
            except ValueError:
                return jsonify({"error": "Invalid date. Use YYYY-MM-DD."}), 400
        days = ProgramService.get_active_program_days(
            session,
            root_id,
            current_user.id,
            target_date=target_date,
            timezone_name=request.args.get("timezone"),
        )
        return jsonify(days or [])
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error getting active program days")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/days/<day_id>/goals', methods=['POST'])
@token_required
@validate_request(ProgramDayGoalAttachSchema)
def attach_goal_to_day(current_user, root_id, program_id, day_id, validated_data):
    """Add a goal to a program day."""
    return _program_day_write(
        "Error attaching goal to day",
        lambda session: ProgramService.attach_goal_to_day(
            session, root_id, program_id, day_id, validated_data, current_user.id,
        ),
        lambda day_dict: (jsonify({"message": "Goal attached to day", "day": day_dict}), 201),
    )

@programs_bp.route('/<root_id>/programs/<program_id>/goal-deadlines', methods=['POST'])
@token_required
@validate_request(ProgramGoalDeadlineSchema)
def set_goal_deadline_for_program_date(current_user, root_id, program_id, validated_data):
    """Set a goal deadline through program-calendar semantics."""
    session = get_db_session()
    try:
        goal_dict = ProgramService.set_goal_deadline_for_program_date(
            session,
            root_id,
            program_id,
            validated_data,
            current_user.id,
        )
        return jsonify(goal_dict)
    except ProgramServiceValidationError as e:
        return _program_service_error_response(e)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error setting goal deadline for program date")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()
