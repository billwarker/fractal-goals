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
    ProgramDayCreateBaseSchema,
    ProgramDayUpdateBaseSchema,
    ProgramDayScheduleSchema,
)
from validators.templates import SessionTemplateCreateSchema
from validators.sessions import SessionCreateSchema, SessionUpdateSchema


OperationId = Annotated[
    str,
    StringConstraints(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9._:-]+$"),
    Field(description="Stable unique ID for this operation within the proposal; later operations may refer to its result as $ref:<operation_id>."),
]


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
    data: "StrictGoalCreateSchema" = Field(description="Goal fields to create. parent_id may refer to a goal created earlier in this proposal using $ref:<operation_id>. Allowed goal types are UltimateGoal, LongTermGoal, MidTermGoal, ShortTermGoal, and ImmediateGoal.")


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
    goal_id: str = Field(min_length=1, max_length=80, description="Opaque ID of an existing goal in the task's fractal.")
    data: StrictGoalUpdateSchema = Field(description="Supported reviewed fields: name, description, deadline, parent_id, targets, child completion, activity inheritance, manual completion, activity tracking, and progress settings.")


class CreateActivityOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_activity"]
    data: "StrictActivityCreateSchema" = Field(description="Activity definition fields validated by the Fractal activity schema.")


class StrictActivityCreateSchema(ActivityDefinitionCreateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class StrictActivityUpdateSchema(ActivityDefinitionUpdateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class UpdateActivityOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["update_activity"]
    activity_id: str = Field(min_length=1, max_length=80, description="Opaque ID of an existing activity in the task's fractal.")
    data: StrictActivityUpdateSchema = Field(description="Supported editable activity definition fields.")


class AssociateActivityGoalsOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["associate_activity_goals"]
    activity_id: str = Field(min_length=1, max_length=80, description="Opaque ID of an existing activity in the task's fractal.")
    goal_ids: list[str] = Field(max_length=200, description="Goal IDs in this fractal, or $ref:<operation_id> references to goals created earlier in this proposal. Maximum 200.")


class CreateNoteOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_note"]
    data: NoteCreateSchema = Field(description="Note content and an in-fractal context reference.")


class StrictSessionCreateSchema(SessionCreateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class StrictSessionUpdateSchema(SessionUpdateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class CreateSessionOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_session"]
    data: StrictSessionCreateSchema = Field(description="Session fields. A session must reference a goal, template, or program context.")


class UpdateSessionOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["update_session"]
    session_id: str = Field(min_length=1, max_length=80, description="Opaque ID of an existing session in the task's fractal.")
    data: StrictSessionUpdateSchema = Field(description="Supported session fields such as name, description, duration, dates, completion, and session data.")


class StrictMetricCreateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    unit: str = Field(min_length=1, max_length=80)
    input_type: Literal["number", "integer", "duration"] = "number"
    precision: int | None = Field(default=None, ge=0, le=6)
    default_value: float | None = None
    higher_is_better: bool | None = None
    predefined_values: list[float] | None = Field(default=None, max_length=100)
    min_value: float | None = None
    max_value: float | None = None
    description: str | None = Field(default=None, max_length=500)
    is_multiplicative: bool = True
    is_additive: bool = True
    default_progress_aggregation: Literal["last", "sum", "max", "yield"] | None = None
    sort_order: int | None = Field(default=None, ge=0)


class StrictMetricUpdateSchema(BaseModel):
    """Patch schema: omitted fields must preserve the existing definition."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    unit: str | None = Field(default=None, min_length=1, max_length=80)
    input_type: Literal["number", "integer", "duration"] | None = None
    precision: int | None = Field(default=None, ge=0, le=6)
    default_value: float | None = None
    higher_is_better: bool | None = None
    predefined_values: list[float] | None = Field(default=None, max_length=100)
    min_value: float | None = None
    max_value: float | None = None
    description: str | None = Field(default=None, max_length=500)
    is_multiplicative: bool | None = None
    is_additive: bool | None = None
    default_progress_aggregation: Literal["last", "sum", "max", "yield"] | None = None
    sort_order: int | None = Field(default=None, ge=0)


class CreateMetricOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_metric"]
    data: StrictMetricCreateSchema


class UpdateMetricOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["update_metric"]
    metric_id: str = Field(min_length=1, max_length=80)
    data: StrictMetricUpdateSchema


class CreateTemplateOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_template"]
    data: "StrictTemplateCreateSchema" = Field(description="Reusable session template fields validated by the Fractal template schema.")


class StrictTemplateCreateSchema(SessionTemplateCreateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class CreateProgramOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_program"]
    data: "StrictProgramCreateSchema" = Field(description="Program name, date range, and selected goal IDs. Goal references may use $ref:<operation_id> for goals created earlier in this proposal.")


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
    program_id: str = Field(min_length=1, max_length=80, description="Opaque ID of an existing program in the task's fractal.")
    data: StrictProgramUpdateSchema = Field(description="Supported program fields; schedule replacement is not supported by reviewed updates.")


class StrictBlockUpdateSchema(ProgramBlockUpdateSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class UpdateBlockOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["update_block"]
    program_id: str = Field(min_length=1, max_length=80, description="Opaque ID of the containing program.")
    block_id: str = Field(min_length=1, max_length=80, description="Opaque ID of an existing block in the program.")
    data: StrictBlockUpdateSchema = Field(description="Supported block name, date range, color, and goal IDs.")


class StrictProgramDayUpdateSchema(ProgramDayUpdateBaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class UpdateProgramDayOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["update_program_day"]
    program_id: str = Field(min_length=1, max_length=80, description="Opaque ID of the containing program.")
    block_id: str = Field(min_length=1, max_length=80, description="Opaque ID of the containing block.")
    day_id: str = Field(min_length=1, max_length=80, description="Opaque ID of an existing day in the block.")
    data: StrictProgramDayUpdateSchema = Field(description="Supported program-day fields. Cascading updates are rejected.")

    @model_validator(mode="after")
    def disallow_cascade_updates(self):
        if self.data.cascade:
            raise ValueError("Program day proposals cannot cascade updates to existing days")
        return self


class CreateBlockOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_block"]
    program_id: str = Field(min_length=1, max_length=80, description="Opaque ID of the containing program, or $ref:<operation_id> for a program created earlier in this proposal.")
    data: "StrictProgramBlockCreateSchema" = Field(description="Block name, dates, color, and optional goal IDs.")


class StrictProgramBlockCreateSchema(ProgramBlockSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class CreateProgramDayOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["create_program_day"]
    program_id: str = Field(min_length=1, max_length=80, description="Opaque ID of the containing program, or $ref:<operation_id> for a program created earlier in this proposal.")
    block_id: str = Field(min_length=1, max_length=80, description="Opaque ID of the containing block, or $ref:<operation_id> for a block created earlier in this proposal.")
    data: "StrictProgramDayCreateSchema" = Field(description="Program day fields, including optional template_configs and template IDs.")

    @model_validator(mode="after")
    def disallow_cascade_updates(self):
        if self.data.cascade:
            raise ValueError("Program day proposals cannot cascade updates to existing days")
        return self


class StrictProgramDayTemplateConfigSchema(ProgramDayTemplateConfigSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class StrictProgramDayCreateSchema(ProgramDayCreateBaseSchema):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    template_configs: list[StrictProgramDayTemplateConfigSchema] | None = None


class ScheduleProgramDayOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation_id: OperationId
    type: Literal["schedule_program_day"]
    program_id: str = Field(min_length=1, max_length=80, description="Opaque ID of the containing program.")
    block_id: str = Field(min_length=1, max_length=80, description="Opaque ID of the containing block.")
    day_id: str = Field(min_length=1, max_length=80, description="Opaque ID of an existing day in the block.")
    data: "StrictProgramDayScheduleSchema" = Field(description="The calendar date (ISO YYYY-MM-DD) to add this reusable day on, within the block's dates. session_start is accepted for compatibility; only its date is used.")


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
        CreateSessionOperation,
        UpdateSessionOperation,
        CreateMetricOperation,
        UpdateMetricOperation,
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

    operations: list[AgentProposalOperation] = Field(
        min_length=1,
        max_length=50,
        description="Ordered, reviewed changes. Use $ref:<operation_id> only for IDs returned by an earlier create operation. Every operation is scoped to the task's fractal and is validated before user approval.",
    )


class AgentApprovalSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["approve", "reject"]
    proposal_hash: str = Field(min_length=64, max_length=64)
