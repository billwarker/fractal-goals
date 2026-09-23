import pytest
from pydantic import ValidationError
import json
from pathlib import Path

from validators.agent import AgentProposalSchema
from services.agent_operation_registry import (
    AGENT_PROPOSAL_SCHEMA_VERSION,
    OPERATION_REGISTRY,
    proposal_json_schema,
)
from services.agent_embedded_service import AgentEmbeddedService
from agent_adapter.proposal_schema import AgentProposalSchema as AdapterAgentProposalSchema


@pytest.mark.parametrize("operation", [
    {
        "operation_id": "activity-1",
        "type": "create_activity",
        "data": {"name": "Practice", "unexpected": True},
    },
    {
        "operation_id": "template-1",
        "type": "create_template",
        "data": {
            "name": "Practice template",
            "template_data": {"session_type": "normal", "sections": []},
            "unexpected": True,
        },
    },
    {
        "operation_id": "program-1",
        "type": "create_program",
        "data": {
            "name": "Practice program",
            "start_date": "2026-10-01",
            "end_date": "2026-10-31",
            "unexpected": True,
        },
    },
    {
        "operation_id": "block-1",
        "type": "create_block",
        "program_id": "program-id",
        "data": {"name": "Block", "unexpected": True},
    },
    {
        "operation_id": "day-1",
        "type": "create_program_day",
        "program_id": "program-id",
        "block_id": "block-id",
        "data": {"name": "Day", "unexpected": True},
    },
    {
        "operation_id": "day-2",
        "type": "create_program_day",
        "program_id": "program-id",
        "block_id": "block-id",
        "data": {
            "name": "Day",
            "template_configs": [{"template_id": "template-id", "unexpected": True}],
        },
    },
    {
        "operation_id": "schedule-1",
        "type": "schedule_program_day",
        "program_id": "program-id",
        "block_id": "block-id",
        "day_id": "day-id",
        "data": {"session_start": "2026-10-01T09:00:00Z", "unexpected": True},
    },
])
def test_agent_create_payloads_reject_fields_outside_the_reviewed_contract(operation):
    with pytest.raises(ValidationError) as captured:
        AgentProposalSchema.model_validate({"operations": [operation]})

    assert any(error["type"] == "extra_forbidden" for error in captured.value.errors())


@pytest.mark.unit
def test_registry_embedded_tools_and_adapter_artifact_share_the_canonical_schema():
    schema = proposal_json_schema()
    item_schema = schema["properties"]["operations"]["items"]
    operation_types = {
        schema["$defs"][variant["$ref"].rsplit("/", 1)[-1]]["properties"]["type"]["const"]
        for variant in item_schema["oneOf"]
    }
    assert operation_types == set(OPERATION_REGISTRY)
    assert schema["schema_version"] == AGENT_PROPOSAL_SCHEMA_VERSION

    adapter_artifact = Path(__file__).resolve().parents[2] / "agent_adapter" / "agent_proposal_schema_v1.json"
    assert json.loads(adapter_artifact.read_text()) == schema

    for provider, argument_key in (("openai", "parameters"), ("anthropic", "input_schema")):
        proposal_tool = AgentEmbeddedService._tool_definitions(provider)[1]
        provider_schema = proposal_tool.get(argument_key, proposal_tool.get("input_schema"))
        definitions = provider_schema.get("$defs", {})
        provider_types = {
            definitions[variant["$ref"].rsplit("/", 1)[-1]]["properties"]["type"]["const"]
            for variant in provider_schema["properties"]["operations"]["items"]["oneOf"]
        }
        assert provider_types == operation_types


@pytest.mark.unit
def test_adapter_preserves_explicit_null_for_nullable_update_fields():
    payload = {"operations": [{
        "operation_id": "goal-1",
        "type": "update_goal",
        "goal_id": "goal-id",
        "data": {"description": None},
    }]}
    backend = AgentProposalSchema.model_validate(payload)
    adapter = AdapterAgentProposalSchema.model_validate(payload)
    assert backend.operations[0].data.description is None
    assert adapter.operations[0].data.description is None
    assert adapter.model_dump(exclude_unset=True)["operations"][0]["data"] == {"description": None}
