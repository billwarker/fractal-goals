"""Eager-loading contracts for timer mutation responses."""

from sqlalchemy.orm import joinedload, selectinload
from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivitySet,
    CircuitRun,
    CircuitRound,
    MetricValue,
    ProgramBlock,
    ProgramDay,
    Session,
)


def activity_instance_query_options():
    return (
        joinedload(ActivityInstance.definition).joinedload(ActivityDefinition.group),
        joinedload(ActivityInstance.metric_values).joinedload(MetricValue.definition),
        joinedload(ActivityInstance.metric_values).joinedload(MetricValue.split),
        selectinload(ActivityInstance.sets)
        .joinedload(ActivitySet.metric_values)
        .joinedload(MetricValue.definition),
        selectinload(ActivityInstance.sets)
        .joinedload(ActivitySet.metric_values)
        .joinedload(MetricValue.split),
    )


def session_query_options():
    return (
        selectinload(Session.goals),
        selectinload(Session.template),
        selectinload(Session.notes_list),
        selectinload(Session.activity_instances)
        .selectinload(ActivityInstance.definition)
        .selectinload(ActivityDefinition.group),
        selectinload(Session.activity_instances)
        .selectinload(ActivityInstance.metric_values)
        .selectinload(MetricValue.definition),
        selectinload(Session.activity_instances)
        .selectinload(ActivityInstance.metric_values)
        .selectinload(MetricValue.split),
        selectinload(Session.activity_instances)
        .selectinload(ActivityInstance.sets)
        .joinedload(ActivitySet.metric_values)
        .joinedload(MetricValue.definition),
        selectinload(Session.activity_instances)
        .selectinload(ActivityInstance.sets)
        .joinedload(ActivitySet.metric_values)
        .joinedload(MetricValue.split),
        selectinload(Session.circuit_runs).selectinload(CircuitRun.slots),
        selectinload(Session.circuit_runs)
        .selectinload(CircuitRun.rounds)
        .selectinload(CircuitRound.members),
        selectinload(Session.program_day)
        .selectinload(ProgramDay.block)
        .selectinload(ProgramBlock.program),
    )
