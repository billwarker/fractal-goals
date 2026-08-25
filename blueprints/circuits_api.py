import logging

from flask import Blueprint, jsonify, request
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from services.circuit_service import CircuitService
from validators import (
    CircuitDefinitionCreateSchema,
    CircuitDefinitionUpdateSchema,
    CircuitMemberMetricCascadeSchema,
    CircuitMemberMetricsUpdateSchema,
    CircuitRunCreateSchema,
    CircuitRunTimingUpdateSchema,
    CircuitScopeTagMutationSchema,
)


circuits_bp = Blueprint("circuits", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)


def _validated(schema):
    try:
        return schema(**(request.get_json(silent=True) or {})).model_dump(exclude_unset=True), None
    except ValidationError as error:
        details = [
            {
                "field": ".".join(str(part) for part in item["loc"]),
                "message": item["msg"],
                "type": item["type"],
            }
            for item in error.errors()
        ]
        return None, (jsonify({"error": "Validation failed", "details": details}), 400)


def _respond(result):
    payload, error, status = result
    if error:
        body = error if isinstance(error, dict) else {"error": error}
        return jsonify(body), status
    return jsonify(payload), status


def _execute(action, message):
    db_session = get_db_session()
    try:
        return _respond(action(CircuitService(db_session)))
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception(message)
        return internal_error(logger, message)
    finally:
        db_session.close()


@circuits_bp.route("/<root_id>/circuits", methods=["GET"])
@token_required
def list_circuits(current_user, root_id):
    include_archived = request.args.get("include_archived", "false").lower() == "true"
    return _execute(
        lambda service: service.list_definitions(root_id, current_user.id, include_archived=include_archived),
        "Error listing circuits",
    )


@circuits_bp.route("/<root_id>/circuits", methods=["POST"])
@token_required
def create_circuit(current_user, root_id):
    data, error = _validated(CircuitDefinitionCreateSchema)
    if error:
        return error
    return _execute(
        lambda service: service.create_definition(root_id, current_user.id, data),
        "Error creating circuit",
    )


@circuits_bp.route("/<root_id>/circuits/<circuit_id>", methods=["GET"])
@token_required
def get_circuit(current_user, root_id, circuit_id):
    include_archived = request.args.get("include_archived", "false").lower() == "true"
    return _execute(
        lambda service: service.get_definition(
            root_id,
            circuit_id,
            current_user.id,
            include_archived=include_archived,
        ),
        "Error fetching circuit",
    )


@circuits_bp.route("/<root_id>/circuits/<circuit_id>", methods=["PATCH"])
@token_required
def update_circuit(current_user, root_id, circuit_id):
    data, error = _validated(CircuitDefinitionUpdateSchema)
    if error:
        return error
    return _execute(
        lambda service: service.update_definition(root_id, circuit_id, current_user.id, data),
        "Error updating circuit",
    )


@circuits_bp.route("/<root_id>/circuits/<circuit_id>", methods=["DELETE"])
@token_required
def archive_circuit(current_user, root_id, circuit_id):
    return _execute(
        lambda service: service.archive_definition(root_id, circuit_id, current_user.id),
        "Error archiving circuit",
    )


@circuits_bp.route("/<root_id>/circuits/<circuit_id>/restore", methods=["POST"])
@token_required
def restore_circuit(current_user, root_id, circuit_id):
    return _execute(
        lambda service: service.restore_definition(root_id, circuit_id, current_user.id),
        "Error restoring circuit",
    )


@circuits_bp.route("/<root_id>/sessions/<session_id>/circuit-runs", methods=["GET"])
@token_required
def list_circuit_runs(current_user, root_id, session_id):
    return _execute(
        lambda service: service.list_session_runs(root_id, session_id, current_user.id),
        "Error listing circuit runs",
    )


@circuits_bp.route("/<root_id>/sessions/<session_id>/circuit-runs", methods=["POST"])
@token_required
def create_circuit_run(current_user, root_id, session_id):
    data, error = _validated(CircuitRunCreateSchema)
    if error:
        return error
    return _execute(
        lambda service: service.create_run(root_id, session_id, current_user.id, data),
        "Error creating circuit run",
    )


@circuits_bp.route("/<root_id>/circuit-runs/<run_id>", methods=["GET"])
@token_required
def get_circuit_run(current_user, root_id, run_id):
    return _execute(
        lambda service: service.get_run(root_id, run_id, current_user.id),
        "Error fetching circuit run",
    )


@circuits_bp.route("/<root_id>/circuit-runs/<run_id>", methods=["DELETE"])
@token_required
def delete_circuit_run(current_user, root_id, run_id):
    return _execute(
        lambda service: service.delete_run(root_id, run_id, current_user.id),
        "Error deleting circuit run",
    )


def _run_action(current_user, root_id, run_id, action_name):
    return _execute(
        lambda service: getattr(service, action_name)(root_id, run_id, current_user.id),
        f"Error performing circuit action {action_name}",
    )


@circuits_bp.route("/<root_id>/circuit-runs/<run_id>/start", methods=["POST"])
@token_required
def start_circuit_run(current_user, root_id, run_id):
    return _run_action(current_user, root_id, run_id, "start_run")


@circuits_bp.route("/<root_id>/circuit-runs/<run_id>/complete", methods=["POST"])
@token_required
def complete_circuit_run(current_user, root_id, run_id):
    return _run_action(current_user, root_id, run_id, "complete_run")


@circuits_bp.route("/<root_id>/circuit-runs/<run_id>/timing", methods=["PATCH"])
@token_required
def update_circuit_run_timing(current_user, root_id, run_id):
    data, error = _validated(CircuitRunTimingUpdateSchema)
    if error:
        return error
    return _execute(
        lambda service: service.update_run_timing(root_id, run_id, current_user.id, data),
        "Error updating circuit timing",
    )


@circuits_bp.route("/<root_id>/circuit-runs/<run_id>/rounds/<round_id>", methods=["DELETE"])
@token_required
def delete_circuit_round(current_user, root_id, run_id, round_id):
    return _execute(
        lambda service: service.delete_round(root_id, run_id, round_id, current_user.id),
        "Error deleting circuit round",
    )


@circuits_bp.route("/<root_id>/circuit-runs/<run_id>/rounds", methods=["POST"])
@token_required
def add_circuit_round(current_user, root_id, run_id):
    return _execute(
        lambda service: service.add_round(root_id, run_id, current_user.id),
        "Error adding circuit round",
    )


@circuits_bp.route("/<root_id>/circuit-runs/<run_id>/members/<member_id>/metrics", methods=["PATCH"])
@token_required
def update_circuit_member_metrics(current_user, root_id, run_id, member_id):
    data, error = _validated(CircuitMemberMetricsUpdateSchema)
    if error:
        return error
    return _execute(
        lambda service: service.update_member_metrics(
            root_id,
            run_id,
            member_id,
            current_user.id,
            data["metrics"],
        ),
        "Error updating circuit member metrics",
    )


@circuits_bp.route("/<root_id>/circuit-runs/<run_id>/members/<member_id>/metrics/cascade", methods=["POST"])
@token_required
def cascade_circuit_member_metric(current_user, root_id, run_id, member_id):
    data, error = _validated(CircuitMemberMetricCascadeSchema)
    if error:
        return error
    return _execute(
        lambda service: service.cascade_member_metric(
            root_id,
            run_id,
            member_id,
            current_user.id,
            data["metric_id"],
            data.get("split_id"),
        ),
        "Error cascading circuit member metric",
    )


@circuits_bp.route("/<root_id>/circuit-runs/<run_id>/tags", methods=["PATCH"])
@token_required
def mutate_circuit_run_tag(current_user, root_id, run_id):
    data, error = _validated(CircuitScopeTagMutationSchema)
    if error:
        return error
    return _execute(
        lambda service: service.mutate_run_tag(root_id, run_id, current_user.id, data),
        "Error updating circuit tags",
    )


@circuits_bp.route("/<root_id>/circuit-runs/<run_id>/rounds/<round_id>/tags", methods=["PATCH"])
@token_required
def mutate_circuit_round_tag(current_user, root_id, run_id, round_id):
    data, error = _validated(CircuitScopeTagMutationSchema)
    if error:
        return error
    return _execute(
        lambda service: service.mutate_round_tag(root_id, run_id, round_id, current_user.id, data),
        "Error updating circuit round tags",
    )
