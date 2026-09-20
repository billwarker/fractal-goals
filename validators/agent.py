"""Strict schemas for OAuth client registration and reviewed agent proposals."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from validators.activities import ActivityDefinitionCreateSchema
from validators.goals import GoalCreateSchema, GoalUpdateSchema
from validators.activities import ActivityDefinitionUpdateSchema
from validators.notes import NoteCreateSchema
from validators.programs import (
    ProgramBlockSchema,
    ProgramBlockUpdateSchema,
    ProgramDayTemplateConfigSchema,
    ProgramCreateSchema,
    ProgramUpdateSchema,
    ProgramDayCreateSchema,
    ProgramDayUpdateSchema,
    ProgramDayScheduleSchema,
)
from validators.templates import SessionTemplateCreateSchema


OperationId = Annotated[str, StringConstraints(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9._:-]+$")]


class AgentOAuthClientRegistrationSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    client_name: str = Field(min_length=1, max_length=120)
    redirect_uris: list[str] = Field(min_length=1, max_length=5)
    token_endpoint_auth_method: Literal["none"] = "none"
    grant_types: list[Literal["authorization_code", "refresh_token"]] = Field(
        default_factory=lambda: ["authorization_code", "refresh_token"],
        min_length=1,
        max_length=2,
    )
    response_types: list[Literal["code"]] = Field(default_factory=lambda: ["code"], min_length=1, max_length=1)
    application_type: Literal["web", "native"] = "web"

    @model_validator(mode="after")
    def validate_grant_metadata(self):
        if len(set(self.grant_types)) != len(self.grant_types):
            raise ValueError("grant_types cannot contain duplicates")
        if "authorization_code" not in self.grant_types:
            raise ValueError("authorization_code is required")
        return self


class AgentTaskLimitsSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_operations: int = Field(default=50, ge=1, le=50)


class AgentTaskBriefSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    root_id: str = Field(min_length=1, max_length=80)
    request_text: str = Field(min_length=1, max_length=2000)
    timezone: str = Field(min_length=1, max_length=64)
    context: dict = Field(default_factory=dict)
    limits: AgentTaskLimitsSchema = Field(default_factory=AgentTaskLimitsSchema)
    grant_id: str | None = Field(default=None, max_length=80)


class CreateGoalOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_goal"]
    data: "StrictGoalCreateSchema"


class StrictGoalCreateSchema(GoalCreateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class StrictGoalUpdateSchema(GoalUpdateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    @model_validator(mode="after")
    def only_supported_goal_fields(self):
        unsupported = self.model_fields_set - {
            "name", "description", "deadline", "parent_id", "targets",
            "completed_via_children", "relevance_statement",
            "inherit_parent_activities", "allow_manual_completion",
            "track_activities", "progress_settings",
        }
        if unsupported:
            raise ValueError("These goal fields are not supported by reviewed updates: " + ", ".join(sorted(unsupported)))
        return self


class UpdateGoalOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["update_goal"]
    goal_id: str = Field(min_length=1, max_length=80)
    data: StrictGoalUpdateSchema


class CreateActivityOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_activity"]
    data: "StrictActivityCreateSchema"


class StrictActivityCreateSchema(ActivityDefinitionCreateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class StrictActivityUpdateSchema(ActivityDefinitionUpdateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class UpdateActivityOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["update_activity"]
    activity_id: str = Field(min_length=1, max_length=80)
    data: StrictActivityUpdateSchema


class AssociateActivityGoalsOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["associate_activity_goals"]
    activity_id: str = Field(min_length=1, max_length=80)
    goal_ids: list[str] = Field(max_length=200)


class CreateNoteOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_note"]
    data: NoteCreateSchema


class CreateTemplateOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_template"]
    data: "StrictTemplateCreateSchema"


class StrictTemplateCreateSchema(SessionTemplateCreateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class CreateProgramOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_program"]
    data: "StrictProgramCreateSchema"


class StrictProgramCreateSchema(ProgramCreateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class StrictProgramUpdateSchema(ProgramUpdateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    @model_validator(mode="after")
    def only_supported_program_fields(self):
        if "weeklySchedule" in self.model_fields_set:
            raise ValueError("weeklySchedule updates are not supported by reviewed operations")
        return self


class UpdateProgramOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["update_program"]
    program_id: str = Field(min_length=1, max_length=80)
    data: StrictProgramUpdateSchema


class StrictBlockUpdateSchema(ProgramBlockUpdateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class UpdateBlockOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["update_block"]
    program_id: str = Field(min_length=1, max_length=80)
    block_id: str = Field(min_length=1, max_length=80)
    data: StrictBlockUpdateSchema


class StrictProgramDayUpdateSchema(ProgramDayUpdateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class UpdateProgramDayOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["update_program_day"]
    program_id: str = Field(min_length=1, max_length=80)
    block_id: str = Field(min_length=1, max_length=80)
    day_id: str = Field(min_length=1, max_length=80)
    data: StrictProgramDayUpdateSchema

    @model_validator(mode="after")
    def disallow_cascade_updates(self):
        if self.data.cascade:
            raise ValueError("Program day proposals cannot cascade updates to existing days")
        return self


class CreateBlockOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_block"]
    program_id: str = Field(min_length=1, max_length=80)
    data: "StrictProgramBlockCreateSchema"


class StrictProgramBlockCreateSchema(ProgramBlockSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class CreateProgramDayOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_program_day"]
    program_id: str = Field(min_length=1, max_length=80)
    block_id: str = Field(min_length=1, max_length=80)
    data: "StrictProgramDayCreateSchema"

    @model_validator(mode="after")
    def disallow_cascade_updates(self):
        if self.data.cascade:
            raise ValueError("Program day proposals cannot cascade updates to existing days")
        return self


class StrictProgramDayTemplateConfigSchema(ProgramDayTemplateConfigSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class StrictProgramDayCreateSchema(ProgramDayCreateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    template_configs: list[StrictProgramDayTemplateConfigSchema] | None = None


class ScheduleProgramDayOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["schedule_program_day"]
    program_id: str = Field(min_length=1, max_length=80)
    block_id: str = Field(min_length=1, max_length=80)
    day_id: str = Field(min_length=1, max_length=80)
    data: "StrictProgramDayScheduleSchema"


class StrictProgramDayScheduleSchema(ProgramDayScheduleSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


AgentProposalOperation = Annotated[
    Union[
        CreateGoalOperation,
        UpdateGoalOperation,
        CreateActivityOperation,
        UpdateActivityOperation,
        AssociateActivityGoalsOperation,
        CreateNoteOperation,
        CreateTemplateOperation,
        CreateProgramOperation,
        UpdateProgramOperation,
        UpdateBlockOperation,
        UpdateProgramDayOperation,
        CreateBlockOperation,
        CreateProgramDayOperation,
        ScheduleProgramDayOperation,
    ],
    Field(discriminator="type"),
]


class AgentProposalSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operations: list[AgentProposalOperation] = Field(min_length=1, max_length=50)


class AgentApprovalSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["approve", "reject"]
    proposal_hash: str = Field(min_length=64, max_length=64)
