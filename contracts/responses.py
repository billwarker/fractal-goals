"""Which model each endpoint answers with. The apps' endpoints first; the rest are published untyped."""
from functools import lru_cache
from typing import Annotated, Any, Literal, Optional, Union

import pydantic
import sqlalchemy as sa
from pydantic import Field

from contracts.entities import (
    Activity, ActivityGroup, ActivityInstance, Goal, Json, Note, NoteDisplay, Payload, Program, ProgramDay,
    SavedGoal, Session, SessionTemplate, User,
)
from models import Base
from models.sync import SYNC_ENTITIES


class Device(Payload):
    id: str
    platform: str
    name: str
    created_at: Optional[str]
    last_seen_at: Optional[str]


class DeviceSession(Payload):
    access_token: str
    expires_in: int
    refresh_token: str
    device: Device
    user: User


class DeviceList(Payload):
    devices: list[Device]


class MediaToken(Payload):
    media_token: str
    expires_in: int


class Message(Payload):
    message: str


class SyncCursor(Payload):
    protocol: int
    cursor: str


class ChangedId(Payload):
    type: str
    id: str
    root_id: Optional[str]
    origin: Optional[str]


class SyncConflict(Payload):
    id: str
    root_id: str
    type: str
    entity_id: str
    entity_name: Optional[str]
    field: str
    kept_value: Optional[str]
    lost_value: Optional[str]
    created_at: Optional[str]


class SyncConflicts(Payload):
    conflicts: list[SyncConflict]


class ResolvedConflict(Payload):
    id: str


# Field definitions built at run time are beyond its static signature.
create_model: Any = pydantic.create_model

# Synced entities whose payload is a serializer's; the others go out as their own columns.
SERIALIZED = {
    'goal': Goal, 'session': Session, 'note': Note, 'program': Program, 'template': SessionTemplate,
    'activity': Activity, 'activity_group': ActivityGroup,
}


def _column_type(column):
    kind: Any = Any if isinstance(column.type, sa.JSON) else {
        sa.Boolean: bool, sa.Integer: int, sa.BigInteger: int, sa.SmallInteger: int, sa.Float: Union[float, int],
    }.get(type(column.type), str)
    return (Optional[kind] if column.nullable or kind is Any else kind, ...)


def _columns_model(entity_type):
    table = Base.metadata.tables[SYNC_ENTITIES[entity_type]]
    name = ''.join(part.capitalize() for part in entity_type.split('_')) + 'Record'
    return create_model(name, __base__=Payload, **{column.name: _column_type(column) for column in table.columns})


@lru_cache(maxsize=1)
def sync_models():
    """The snapshot and feed pages, with each entity type's own payload."""
    changes = []
    for entity_type in sorted(SYNC_ENTITIES):
        data = SERIALIZED.get(entity_type) or _columns_model(entity_type)
        name = ''.join(part.capitalize() for part in entity_type.split('_')) + 'Change'
        changes.append(create_model(
            name, __base__=Payload, type=(Literal[entity_type], ...), id=(str, ...), root_id=(Optional[str], ...),
            deleted=(bool, ...), data=(Optional[data], ...),
        ))
    change = Annotated[Union[tuple(changes)], Field(discriminator='type')]
    snapshot = create_model(
        'SyncSnapshotPage', __base__=Payload, protocol=(int, ...), changes=(list[change], ...),
        next_page=(Optional[str], ...), cursor=(Optional[str], ...),
    )
    feed = create_model(
        'SyncChangesPage', __base__=Payload, protocol=(int, ...),
        changes=(Union[list[change], list[ChangedId]], ...), cursor=(str, ...), has_more=(bool, ...),
    )
    return snapshot, feed


class GoalChanges(Payload):
    completed: list[Json]
    uncompleted: list[Json]


# Any write that completes or reopens a goal says so (blueprints/goal_changes.py).
WRITE_EXTRAS = {'goal_changes': GoalChanges}


@lru_cache(maxsize=1)
def response_models():
    snapshot, feed = sync_models()
    return {
        'device_auth.sign_in': DeviceSession,
        'device_auth.refresh': DeviceSession,
        'device_auth.sign_out': Message,
        'device_auth.list_devices': DeviceList,
        'device_auth.revoke_device': Message,
        'device_auth.media_token': MediaToken,
        'auth.get_me': User,
        'sync.snapshot': snapshot,
        'sync.changes': feed,
        'sync.cursor': SyncCursor,
        'sync.conflicts': SyncConflicts,
        'sync.resolve_conflict': ResolvedConflict,
        'activities.create_activity': Activity,
        'activities.update_activity': Activity,
        'activities.create_activity_group': ActivityGroup,
        'activities.update_activity_group': ActivityGroup,
        'templates.create_session_template': SessionTemplate,
        'templates.update_session_template': SessionTemplate,
        'programs.create_program': Program,
        'programs.update_program': Program,
        'programs.create_program_day': ProgramDay,
        'notes.create_note': NoteDisplay,
        'notes.update_note': NoteDisplay,
        'sessions.create_fractal_session': Session,
        'sessions.update_session': Session,
        'sessions.complete_quick_session': Session,
        'sessions.add_activity_to_session': ActivityInstance,
        'timers.update_activity_instance': ActivityInstance,
        'goals.create_fractal_goal': SavedGoal,
        'goals.update_fractal_goal': SavedGoal,
        'goals.get_fractal_goal': Goal,
    }
