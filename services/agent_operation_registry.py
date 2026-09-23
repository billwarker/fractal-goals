"""Canonical metadata shared by proposal validation, model tools, and execution."""

from validators.agent import AgentProposalSchema


AGENT_PROPOSAL_SCHEMA_VERSION = "1.0.0"

# Keep scope and user-facing operation metadata beside the canonical Pydantic
# union. Runtime tests assert exact operation coverage so additions cannot drift.
OPERATION_REGISTRY = {
    "create_goal": {"scope": "goals:write", "label": "Create goal", "reversible": False},
    "update_goal": {"scope": "goals:write", "label": "Update goal", "reversible": True},
    "create_activity": {"scope": "activities:write", "label": "Create activity", "reversible": False},
    "update_activity": {"scope": "activities:write", "label": "Update activity", "reversible": True},
    "associate_activity_goals": {"scope": "activities:write", "label": "Change activity goal links", "reversible": False},
    "create_note": {"scope": "notes:write", "label": "Create note", "reversible": False},
    "create_session": {"scope": "sessions:write", "label": "Create session", "reversible": False},
    "update_session": {"scope": "sessions:write", "label": "Update session", "reversible": True},
    "create_metric": {"scope": "metrics:write", "label": "Create metric", "reversible": False},
    "update_metric": {"scope": "metrics:write", "label": "Update metric", "reversible": True},
    "create_template": {"scope": "programs:write", "label": "Create template", "reversible": False},
    "create_program": {"scope": "programs:write", "label": "Create program", "reversible": False},
    "update_program": {"scope": "programs:write", "label": "Update program", "reversible": True},
    "create_block": {"scope": "programs:write", "label": "Create program block", "reversible": False},
    "update_block": {"scope": "programs:write", "label": "Update program block", "reversible": True},
    "create_program_day": {"scope": "programs:write", "label": "Create program day", "reversible": False},
    "update_program_day": {"scope": "programs:write", "label": "Update program day", "reversible": True},
    "schedule_program_day": {"scope": "programs:write", "label": "Schedule program day", "reversible": False},
}


def proposal_json_schema():
    schema = AgentProposalSchema.model_json_schema(mode="validation")
    schema["$id"] = f"https://fractal-goals.invalid/schemas/agent-proposal-v{AGENT_PROPOSAL_SCHEMA_VERSION}.json"
    schema["schema_version"] = AGENT_PROPOSAL_SCHEMA_VERSION
    return schema
