import pytest
from pydantic import ValidationError

from validators.agent import AgentProposalSchema


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
