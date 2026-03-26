# Activity Modes — Implementation Spec

**Date:** 2026-03-26
**Status:** Draft

---

## Overview

Activity Modes are user-defined contextual labels scoped to a fractal (root goal). They allow users to tag activity instances with a "how" — e.g., Strength vs. Hypertrophy for pull-ups, or Standing vs. Sitting for piano practice. Modes are purely organizational: they carry no targets or goal implications of their own, but they become first-class filter dimensions in analytics.

An activity instance can have **zero or more modes** simultaneously. Modes are optional and additive — a single instance can be tagged with both "Strength" and "Standing" if the user desires.

---

## Table of Contents

1. Data Model
2. Alembic Migration
3. Backend — Service Layer
4. Backend — Validators
5. Backend — API Endpoints
6. Backend — Serializers
7. Frontend — Query Keys
8. Frontend — API Module
9. Frontend — Query Hooks
10. Frontend — Mode Management UI (ManageActivities)
11. Frontend — Mode Selector Component
12. Frontend — Template Builder Integration
13. Frontend — Analytics Integration
14. Implementation Phases
15. Key Design Constraints

---

## 1. Data Model

### 1.1 New Table: `activity_modes`

Add a new SQLAlchemy model in `models/activity.py`.

```python
class ActivityMode(Base):
    __tablename__ = 'activity_modes'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    color = Column(String, nullable=True)   # Optional hex color hint, e.g. "#A78BFA"
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
```

Field notes:
- `root_id`: modes are scoped to a fractal. Deleting the root cascades.
- `description`: optional free-text description of the mode (e.g., "Low rep ranges targeting maximal strength output").
- `color`: optional UI hint stored as a hex string (`#RRGGBB`) or `NULL`. No enforcement beyond format validation.
- `sort_order`: allows user-defined ordering of mode badges.
- `deleted_at`: soft-delete, consistent with all other major models.

No unique constraint on `name` — the service layer enforces uniqueness within an active (non-deleted) set for a given `root_id`.

### 1.2 New Junction Table: `activity_instance_modes`

Activity instances support multiple modes via a junction table. No `mode_id` column is added to `ActivityInstance` directly.

```python
class ActivityInstanceMode(Base):
    __tablename__ = 'activity_instance_modes'

    activity_instance_id = Column(
        String, ForeignKey('activity_instances.id', ondelete='CASCADE'),
        primary_key=True, nullable=False
    )
    activity_mode_id = Column(
        String, ForeignKey('activity_modes.id', ondelete='CASCADE'),
        primary_key=True, nullable=False
    )
    created_at = Column(DateTime, default=utc_now)
```

Field notes:
- Composite primary key on `(activity_instance_id, activity_mode_id)` — no duplicates.
- `ondelete='CASCADE'` on both FKs: removing an instance or soft-deleting a mode (if ever hard-deleted) cleans up the link automatically.
- No `deleted_at` — this is a link table; membership is managed by insert/delete, not soft-delete.

Add the relationship to `ActivityInstance`:

```python
modes = relationship(
    "ActivityMode",
    secondary="activity_instance_modes",
    lazy="selectin",
)
```

### 1.3 Template JSONB Changes

No schema change to the `session_templates` table. Each activity object in template data gains an optional `mode_ids` field (an array to match the many-to-many shape):

```jsonc
// Normal template section exercise object
{
  "activity_id": "<uuid>",
  "mode_ids": ["<uuid>", ...]   // NEW optional field, empty array or omitted = no modes
}

// Quick template activity object
{
  "activity_id": "<uuid>",
  "mode_ids": ["<uuid>", ...]   // NEW optional field
}
```

The existing `validate_session_template_data` function in `validators.py` already passes through extra fields in activity objects — no validator changes required.

### 1.4 `models/__init__.py`

Export both `ActivityMode` and `ActivityInstanceMode` from the models package, following the existing pattern.

---

## 2. Alembic Migration

**File:** `migrations/versions/<rev>_add_activity_modes.py`

```python
"""add activity modes

Revision ID: <new_rev>
Revises: <current_head>
Create Date: <date>
"""
from alembic import op
import sqlalchemy as sa

revision = '<new_rev>'
down_revision = '<current_head>'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create activity_modes table
    op.create_table(
        'activity_modes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('color', sa.String(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_activity_modes_root_id', 'activity_modes', ['root_id'])

    # Create junction table
    op.create_table(
        'activity_instance_modes',
        sa.Column('activity_instance_id', sa.String(),
                  sa.ForeignKey('activity_instances.id', ondelete='CASCADE'), nullable=False),
        sa.Column('activity_mode_id', sa.String(),
                  sa.ForeignKey('activity_modes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('activity_instance_id', 'activity_mode_id'),
    )
    op.create_index('ix_activity_instance_modes_instance_id',
                    'activity_instance_modes', ['activity_instance_id'])
    op.create_index('ix_activity_instance_modes_mode_id',
                    'activity_instance_modes', ['activity_mode_id'])


def downgrade() -> None:
    op.drop_index('ix_activity_instance_modes_mode_id',
                  table_name='activity_instance_modes')
    op.drop_index('ix_activity_instance_modes_instance_id',
                  table_name='activity_instance_modes')
    op.drop_table('activity_instance_modes')
    op.drop_index('ix_activity_modes_root_id', table_name='activity_modes')
    op.drop_table('activity_modes')
```

---

## 3. Backend — Service Layer

### 3.1 New methods in `ActivityService`

**File:** `services/activity_service.py`

Add the following methods to the existing `ActivityService` class, following the established `ServiceResult` return convention.

#### `list_modes_for_root`

```python
def list_modes_for_root(self, root_id, current_user_id):
    _, error = self._validate_owned_root(root_id, current_user_id)
    if error:
        return None, *error

    modes = self.db_session.query(ActivityMode).filter(
        ActivityMode.root_id == root_id,
        ActivityMode.deleted_at.is_(None),
    ).order_by(ActivityMode.sort_order, ActivityMode.created_at).all()
    return modes, None, 200
```

#### `create_mode`

```python
def create_mode(self, root_id, current_user_id, data):
    _, error = self._validate_owned_root(root_id, current_user_id)
    if error:
        return None, *error

    name = (data.get('name') or '').strip()
    if not name:
        return None, "Name is required", 400

    existing = self.db_session.query(ActivityMode).filter(
        ActivityMode.root_id == root_id,
        ActivityMode.name == name,
        ActivityMode.deleted_at.is_(None),
    ).first()
    if existing:
        return None, "A mode with this name already exists in this fractal", 409

    color = (data.get('color') or '').strip() or None
    description = (data.get('description') or '').strip() or None
    max_order = self.db_session.query(func.max(ActivityMode.sort_order)).filter(
        ActivityMode.root_id == root_id,
        ActivityMode.deleted_at.is_(None),
    ).scalar()
    new_order = (max_order or 0) + 1

    mode = ActivityMode(
        root_id=root_id,
        name=name,
        description=description,
        color=color,
        sort_order=new_order,
    )
    self.db_session.add(mode)
    self.db_session.commit()
    self.db_session.refresh(mode)

    event_bus.emit(Event(Events.ACTIVITY_MODE_CREATED, {
        'mode_id': mode.id, 'name': mode.name, 'root_id': root_id,
    }, source='activity_service.create_mode'))

    return mode, None, 201
```

#### `update_mode`

```python
def update_mode(self, root_id, mode_id, current_user_id, data):
    _, error = self._validate_owned_root(root_id, current_user_id)
    if error:
        return None, *error

    mode = self.db_session.query(ActivityMode).filter(
        ActivityMode.id == mode_id,
        ActivityMode.root_id == root_id,
        ActivityMode.deleted_at.is_(None),
    ).first()
    if not mode:
        return None, "Mode not found", 404

    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return None, "Name is required", 400
        conflict = self.db_session.query(ActivityMode).filter(
            ActivityMode.root_id == root_id,
            ActivityMode.name == name,
            ActivityMode.id != mode_id,
            ActivityMode.deleted_at.is_(None),
        ).first()
        if conflict:
            return None, "A mode with this name already exists in this fractal", 409
        mode.name = name

    if 'description' in data:
        mode.description = (data['description'] or '').strip() or None

    if 'color' in data:
        mode.color = (data['color'] or '').strip() or None

    if 'sort_order' in data and data['sort_order'] is not None:
        mode.sort_order = data['sort_order']

    self.db_session.commit()
    self.db_session.refresh(mode)

    event_bus.emit(Event(Events.ACTIVITY_MODE_UPDATED, {
        'mode_id': mode.id, 'name': mode.name, 'root_id': root_id,
        'updated_fields': list(data.keys()),
    }, source='activity_service.update_mode'))

    return mode, None, 200
```

#### `delete_mode`

Soft-deletes the mode. Existing `activity_instance_modes` rows are left in place — historical data is preserved; the mode simply no longer appears in the active list. The frontend renders orphaned mode badges gracefully (omit or show as stale).

```python
def delete_mode(self, root_id, mode_id, current_user_id):
    _, error = self._validate_owned_root(root_id, current_user_id)
    if error:
        return None, *error

    mode = self.db_session.query(ActivityMode).filter(
        ActivityMode.id == mode_id,
        ActivityMode.root_id == root_id,
        ActivityMode.deleted_at.is_(None),
    ).first()
    if not mode:
        return None, "Mode not found", 404

    mode.deleted_at = utc_now()
    self.db_session.commit()

    event_bus.emit(Event(Events.ACTIVITY_MODE_DELETED, {
        'mode_id': mode_id, 'name': mode.name, 'root_id': root_id,
    }, source='activity_service.delete_mode'))

    return {"message": "Mode deleted"}, None, 200
```

### 3.2 Changes to `SessionService`

**File:** `services/session_service.py`

#### `add_activity_to_session`

Accept an optional `mode_ids` list in the data dict. After creating the instance, insert `ActivityInstanceMode` rows for each valid mode ID:

```python
mode_ids = data.get('mode_ids') or []
if mode_ids:
    valid_modes = self.db_session.query(ActivityMode).filter(
        ActivityMode.id.in_(mode_ids),
        ActivityMode.root_id == root_id,
        ActivityMode.deleted_at.is_(None),
    ).all()
    valid_mode_ids = {m.id for m in valid_modes}
    invalid = set(mode_ids) - valid_mode_ids
    if invalid:
        return None, f"Mode(s) not found in this fractal: {', '.join(invalid)}", 404
    for mid in valid_mode_ids:
        self.db_session.add(ActivityInstanceMode(
            activity_instance_id=instance.id,
            activity_mode_id=mid,
        ))
```

#### `update_activity_instance`

Accept `mode_ids` as a full-replace field. When present, delete all existing `ActivityInstanceMode` rows for the instance and insert the new set:

```python
if 'mode_ids' in data:
    new_mode_ids = data.get('mode_ids') or []
    # Delete existing links
    self.db_session.query(ActivityInstanceMode).filter(
        ActivityInstanceMode.activity_instance_id == instance.id,
    ).delete()
    # Insert new links
    if new_mode_ids:
        valid_modes = self.db_session.query(ActivityMode).filter(
            ActivityMode.id.in_(new_mode_ids),
            ActivityMode.root_id == root_id,
            ActivityMode.deleted_at.is_(None),
        ).all()
        valid_mode_ids = {m.id for m in valid_modes}
        for mid in valid_mode_ids:
            self.db_session.add(ActivityInstanceMode(
                activity_instance_id=instance.id,
                activity_mode_id=mid,
            ))
```

#### Template-to-instance creation (both quick and normal paths)

When creating `ActivityInstance` records from a template, carry over `mode_ids` from the raw template item if present. Validate each ID belongs to the fractal; silently drop any that no longer exist (soft-deleted):

```python
template_mode_ids = raw_dict.get('mode_ids') or []
if template_mode_ids:
    valid_modes = self.db_session.query(ActivityMode).filter(
        ActivityMode.id.in_(template_mode_ids),
        ActivityMode.root_id == root_id,
        ActivityMode.deleted_at.is_(None),
    ).all()
    for mode in valid_modes:
        self.db_session.add(ActivityInstanceMode(
            activity_instance_id=instance.id,
            activity_mode_id=mode.id,
        ))
```

Apply to both the quick-template path (~line 1051) and the normal-template section-exercise path (~line 1082).

#### `_session_read_options`

The `modes` relationship on `ActivityInstance` is declared with `lazy="selectin"`, so it loads automatically. No explicit `selectinload` addition is required in read options.

### 3.3 New Events

**File:** `services/events.py`

```python
ACTIVITY_MODE_CREATED = 'activity_mode.created'
ACTIVITY_MODE_UPDATED = 'activity_mode.updated'
ACTIVITY_MODE_DELETED = 'activity_mode.deleted'
```

---

## 4. Backend — Validators

**File:** `validators.py`

Add these schemas following the existing `ActivityGroupCreateSchema` pattern:

```python
class ActivityModeCreateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    color: Optional[str] = Field(None, max_length=7)
    sort_order: Optional[int] = Field(None, ge=0)

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)

    @field_validator('color')
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ''):
            return None
        if not re.match(r'^#[0-9A-Fa-f]{6}$', v.strip()):
            raise ValueError('color must be a valid #RRGGBB hex color or null')
        return v.strip()


class ActivityModeUpdateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    color: Optional[str] = Field(None, max_length=7)
    sort_order: Optional[int] = Field(None, ge=0)

    @field_validator('color')
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ''):
            return None
        if not re.match(r'^#[0-9A-Fa-f]{6}$', v.strip()):
            raise ValueError('color must be a valid #RRGGBB hex color or null')
        return v.strip()
```

Also update `ActivityInstanceCreateSchema` and the instance update schema to accept `mode_ids` as an optional list of strings:

```python
mode_ids: Optional[list[str]] = Field(default_factory=list)
```

---

## 5. Backend — API Endpoints

**File:** `blueprints/activities_api.py`

Add under the existing `activities_bp` blueprint. Follow the exact same structure as the activity-group endpoints.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/<root_id>/activity-modes` | List all active modes for a fractal |
| POST | `/<root_id>/activity-modes` | Create a new mode |
| PUT | `/<root_id>/activity-modes/<mode_id>` | Update name, description, color, or sort_order |
| DELETE | `/<root_id>/activity-modes/<mode_id>` | Soft-delete a mode |

```python
@activities_bp.route('/<root_id>/activity-modes', methods=['GET'])
@token_required
def get_activity_modes(current_user, root_id):
    session = get_db_session()
    try:
        service = ActivityService(session)
        modes, error, status = service.list_modes_for_root(root_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify([serialize_activity_mode(m) for m in modes])
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-modes', methods=['POST'])
@token_required
@validate_request(ActivityModeCreateSchema)
def create_activity_mode(current_user, root_id, validated_data):
    session = get_db_session()
    try:
        service = ActivityService(session)
        mode, error, status = service.create_mode(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_activity_mode(mode)), 201
    except SQLAlchemyError:
        session.rollback()
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-modes/<mode_id>', methods=['PUT'])
@token_required
@validate_request(ActivityModeUpdateSchema)
def update_activity_mode(current_user, root_id, mode_id, validated_data):
    session = get_db_session()
    try:
        service = ActivityService(session)
        mode, error, status = service.update_mode(root_id, mode_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_activity_mode(mode)), status
    except SQLAlchemyError:
        session.rollback()
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-modes/<mode_id>', methods=['DELETE'])
@token_required
def delete_activity_mode(current_user, root_id, mode_id):
    session = get_db_session()
    try:
        service = ActivityService(session)
        payload, error, status = service.delete_mode(root_id, mode_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        session.rollback()
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()
```

The existing activity-instance update endpoint in `sessions_api.py` requires no route-level changes — `mode_ids` is passed through the existing `data` dict into the service.

---

## 6. Backend — Serializers

**File:** `services/serializers.py`

### New: `serialize_activity_mode`

```python
def serialize_activity_mode(mode):
    return {
        "id": mode.id,
        "root_id": mode.root_id,
        "name": mode.name,
        "description": mode.description,
        "color": mode.color,
        "sort_order": mode.sort_order,
        "created_at": format_utc(mode.created_at),
        "updated_at": format_utc(mode.updated_at),
    }
```

### Changes to `serialize_activity_instance`

Replace any previous `mode_id` / `mode` fields with the many-to-many shape:

```python
"modes": [
    serialize_activity_mode(m)
    for m in (instance.modes or [])
    if not m.deleted_at
],
```

The `deleted_at` guard ensures soft-deleted modes are not surfaced to the frontend.

---

## 7. Frontend — Query Keys

**File:** `client/src/hooks/queryKeys.js`

```js
activityModes: (rootId) => ['activity-modes', rootId],
```

---

## 8. Frontend — API Module

**File:** `client/src/utils/api/fractalActivitiesApi.js`

```js
// Activity Modes
getActivityModes: (rootId) =>
    axios.get(`${API_BASE}/${rootId}/activity-modes`),
createActivityMode: (rootId, data) =>
    axios.post(`${API_BASE}/${rootId}/activity-modes`, data),
updateActivityMode: (rootId, modeId, data) =>
    axios.put(`${API_BASE}/${rootId}/activity-modes/${modeId}`, data),
deleteActivityMode: (rootId, modeId) =>
    axios.delete(`${API_BASE}/${rootId}/activity-modes/${modeId}`),
```

The existing `updateActivityInstance` method already accepts a generic `data` object; `mode_ids` (array) is passed through it without a new API method.

---

## 9. Frontend — Query Hooks

**File:** `client/src/hooks/useActivityQueries.js`

Extend the existing file following the `useActivityGroups` / `useCreateActivity` patterns exactly:

```js
export function useActivityModes(rootId) {
    const { data: activityModes = [], isLoading, error } = useQuery({
        queryKey: queryKeys.activityModes(rootId),
        queryFn: async () => {
            const res = await fractalApi.getActivityModes(rootId);
            return res.data || [];
        },
        enabled: Boolean(rootId),
        staleTime: 5 * 60 * 1000,
    });
    return { activityModes, isLoading, error };
}

export function useCreateActivityMode(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload) => fractalApi.createActivityMode(rootId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activityModes(rootId) });
        },
    });
}

export function useUpdateActivityMode(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ modeId, ...payload }) =>
            fractalApi.updateActivityMode(rootId, modeId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activityModes(rootId) });
        },
    });
}

export function useDeleteActivityMode(rootId) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (modeId) => fractalApi.deleteActivityMode(rootId, modeId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.activityModes(rootId) });
            // Invalidate session data since instance serializations include mode info
            queryClient.invalidateQueries({ queryKey: ['session-activities', rootId] });
        },
    });
}
```

---

## 10. Frontend — Mode Management UI

**File:** `client/src/pages/ManageActivities.jsx`

Add a **"Manage Modes"** button in the top action bar, positioned alongside the existing "Create Activity" and "Create Group" buttons. Clicking it opens `ActivityModesModal` — a dedicated modal that shows all modes for the fractal and allows CRUD operations inline.

### New state

```js
const [showModesModal, setShowModesModal] = useState(false);
```

### Hook usage

```js
const { activityModes = [] } = useActivityModes(rootId);
const createModeMutation = useCreateActivityMode(rootId);
const updateModeMutation = useUpdateActivityMode(rootId);
const deleteModeMutation = useDeleteActivityMode(rootId);
```

### New component: `ActivityModesModal`

**File:** `client/src/components/modals/ActivityModesModal.jsx`

A modal that serves as the primary modes management surface. Contains:

**Mode list** — renders each active mode as a row showing:
- Color swatch (if set)
- Mode name (bold)
- Mode description (muted, below name)
- Edit and delete icon buttons

**Inline create/edit form** — appears at the bottom of the modal (or as a nested panel) with:
- Text input for `name` (required)
- Textarea for `description` (optional)
- Hex color input with live swatch preview for `color` (optional)
- Save / Cancel

Use the existing `DeleteConfirmModal` for delete confirmation.

---

## 11. Frontend — Mode Selector Component

**File:** `client/src/components/common/ActivityModeSelector.jsx`

A tag/badge-style multi-picker. Renders available modes as clickable pill badges. Clicking a selected badge deselects (removes) it. Clicking an unselected badge adds it to the selection. Multiple badges can be selected simultaneously.

### Props

```js
ActivityModeSelector.propTypes = {
    rootId: PropTypes.string.isRequired,
    selectedModeIds: PropTypes.arrayOf(PropTypes.string),  // [] = no modes
    onChange: PropTypes.func.isRequired,                   // (modeIds: string[]) => void
    disabled: PropTypes.bool,
};
```

### Behavior

- Fetches modes via `useActivityModes(rootId)`.
- If `activityModes` is empty, renders nothing.
- Badge background: `mode.color` if set, otherwise a neutral token.
- Selected badge: filled/outlined state differentiation via CSS.
- `onChange` receives the full updated array of selected mode IDs after each toggle.

### Integration points

1. **`SessionActivityItem`** (`client/src/components/sessionDetail/SessionActivityItem.jsx`) — add `ActivityModeSelector` below the activity title. On change, call `updateActivityInstance` with `{ mode_ids }` and invalidate the session query.

2. **Add-activity-to-session form** — wherever the activity creation modal/inline form lives, add `ActivityModeSelector` so modes can be set at creation time.

---

## 12. Frontend — Template Builder Integration

**File:** `client/src/pages/CreateSessionTemplate.jsx`

### Changes

1. Load modes via `useActivityModes(rootId)` at the page level.
2. Each activity item in template form state gains an optional `mode_ids` field:
   ```js
   // Before: { activity_id: '<uuid>' }
   // After:  { activity_id: '<uuid>', mode_ids: ['<uuid>', ...] }
   ```
3. Render `ActivityModeSelector` inline on each activity row in the template editor.
4. On save, include `mode_ids` (or `[]`) in the serialized activity objects written into `template_data`.

No backend validator changes required — `validate_session_template_data` in `validators.py` already passes through extra fields in activity objects.

---

## 13. Frontend — Analytics Integration

**Files:** `client/src/pages/Analytics.jsx`, `client/src/components/analytics/ProfileWindow.jsx`

### Window state

Extend `getDefaultWindowState()`:

```js
const getDefaultWindowState = () => ({
    // ...existing fields...
    selectedModeIds: [],   // string[] — filter activity instances by mode(s)
});
```

### Mode filter UI in `ProfileWindow`

When `selectedCategory === 'activities'` and an activity is selected, render `ActivityModeSelector` in filter mode (using the same component, driven by `selectedModeIds`). Add an "All" badge as the unfiltered option (clears `selectedModeIds`). Selecting one or more modes updates `windowState.selectedModeIds`.

### Client-side filtering

Filter `activityInstances` before passing to chart components. An instance matches if it has **any** of the selected mode IDs (OR logic — union of modes):

```js
const filteredInstances = useMemo(() => {
    if (!windowState.selectedModeIds.length) return activityInstances;
    return activityInstances.filter((inst) =>
        inst.modes.some((m) => windowState.selectedModeIds.includes(m.id))
    );
}, [activityInstances, windowState.selectedModeIds]);
```

No backend query changes needed for Phase 4. If performance becomes a concern for large histories, a server-side `mode_ids` filter can be added to the activity-instances list endpoint as a follow-up.

### Chart labels

Append mode names in tooltips and legends where available:

```js
const modeLabel = inst.modes.length
    ? ` (${inst.modes.map((m) => m.name).join(', ')})`
    : '';
const label = `${inst.definition_name}${modeLabel}`;
```

---

## 14. Implementation Phases

### Phase 1 — Data Model and Backend CRUD

1. Add `ActivityMode` and `ActivityInstanceMode` models to `models/activity.py`
2. Add `modes` relationship to `ActivityInstance`
3. Export both from `models/__init__.py`
4. Write and run Alembic migration
5. Add `ActivityModeCreateSchema` and `ActivityModeUpdateSchema` to `validators.py`
6. Update `ActivityInstanceCreateSchema` and update schema to include `mode_ids`
7. Add `serialize_activity_mode` to `services/serializers.py`
8. Update `serialize_activity_instance` to include `modes` array
9. Add mode service methods to `ActivityService` in `services/activity_service.py`
10. Add new event constants to `services/events.py`
11. Add the four mode API endpoints to `blueprints/activities_api.py`

**Deliverable:** All mode CRUD endpoints work. Existing activity instance serialization includes `modes: []` for all existing instances.

### Phase 2 — Instance Integration

1. Update `SessionService.add_activity_to_session` to accept and validate `mode_ids`
2. Update `SessionService.update_activity_instance` to full-replace modes via `mode_ids`
3. Add mode API methods to `client/src/utils/api/fractalActivitiesApi.js`
4. Add `activityModes` query key to `client/src/hooks/queryKeys.js`
5. Add mode hooks to `client/src/hooks/useActivityQueries.js`
6. Build `ActivityModeSelector` in `client/src/components/common/ActivityModeSelector.jsx`
7. Integrate `ActivityModeSelector` into `SessionActivityItem` with live update

**Deliverable:** Users can add/remove modes on an activity instance during a live session.

### Phase 3 — Mode Management UI and Template Support

1. Build `ActivityModesModal` in `client/src/components/modals/ActivityModesModal.jsx`
2. Add "Manage Modes" button to the top action bar in `client/src/pages/ManageActivities.jsx`
3. Update both template-to-instance creation paths in `SessionService` to carry over `mode_ids`
4. Add `ActivityModeSelector` to template activity rows in `client/src/pages/CreateSessionTemplate.jsx`

**Deliverable:** Users can create/rename/delete modes on ManageActivities. Templates can pre-assign modes that carry through to session creation.

### Phase 4 — Analytics

1. Extend `getDefaultWindowState` in `client/src/pages/Analytics.jsx` with `selectedModeIds`
2. Add mode filter UI to the activities category in `ProfileWindow.jsx`
3. Apply client-side mode filtering (OR logic) to `activityInstances` before passing to chart components
4. Update chart labels/tooltips to include mode names where available

**Deliverable:** Users can filter activity analytics by one or more modes.

---

## 15. Key Design Constraints

| Constraint | Rationale |
|---|---|
| Modes scoped to `root_id`, not global or per-activity | Keeps mode list manageable and fractal-contextual; avoids cross-fractal pollution |
| Zero or more modes per instance via junction table | Supports multi-mode tagging without JSONB; enables clean SQL joins for analytics |
| No `deleted_at` on junction table | Link membership managed by insert/delete; soft-delete lives on `ActivityMode` only |
| Soft-delete on `ActivityMode` | Preserves historical instance associations; consistent with all other domain objects |
| `activity_instance_modes` is first-class DB table | Enables direct SQL analytics queries and joins without JSONB traversal |
| Mode in template data stored as `mode_ids` array in JSONB | Acceptable since templates are not queried by mode; no junction table needed |
| No separate goals/targets per mode | Modes are purely contextual; out of scope for this feature |
| Analytics filtering is client-side in Phase 4 | Avoids backend query changes for initial delivery; can be promoted to server-side if needed |
| Color and description are optional | Not required to create a mode; stored as-is or null |
| Analytics OR logic for multi-mode filter | Matches the additive nature of modes — show instances that used any selected mode |
