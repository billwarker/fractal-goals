# Session Template Refresh And Quick Sessions Spec

Created: 2026-03-14
Updated: 2026-03-14

References:
- [CreateSessionTemplate.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSessionTemplate.jsx)
- [TemplateCard.jsx](/Users/will/Projects/fractal-goals/client/src/components/TemplateCard.jsx)
- [TemplateBuilderModal.jsx](/Users/will/Projects/fractal-goals/client/src/components/modals/TemplateBuilderModal.jsx)
- [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx)
- [TemplatePicker.jsx](/Users/will/Projects/fractal-goals/client/src/components/createSession/TemplatePicker.jsx)
- [SessionDetail.jsx](/Users/will/Projects/fractal-goals/client/src/pages/SessionDetail.jsx)
- [SessionSection.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/SessionSection.jsx)
- [SessionActivityItem.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/SessionActivityItem.jsx)
- [SessionSidePane.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/SessionSidePane.jsx)
- [useSessionDetailData.js](/Users/will/Projects/fractal-goals/client/src/hooks/useSessionDetailData.js)
- [useSessionDetailMutations.js](/Users/will/Projects/fractal-goals/client/src/hooks/useSessionDetailMutations.js)
- [models/session.py](/Users/will/Projects/fractal-goals/models/session.py)
- [validators.py](/Users/will/Projects/fractal-goals/validators.py)
- [templates_api.py](/Users/will/Projects/fractal-goals/blueprints/templates_api.py)
- [sessions_api.py](/Users/will/Projects/fractal-goals/blueprints/sessions_api.py)
- [template_service.py](/Users/will/Projects/fractal-goals/services/template_service.py)
- [session_service.py](/Users/will/Projects/fractal-goals/services/session_service.py)
- [serializers.py](/Users/will/Projects/fractal-goals/services/serializers.py)
- [note_service.py](/Users/will/Projects/fractal-goals/services/note_service.py)
- [timer_service.py](/Users/will/Projects/fractal-goals/services/timer_service.py)

## User's Original Context

OK now we should do a long overdue refresh to the manage session templates page:
- the edit button on the session template card is redundant; the user can edit a session template by just clicking on it, which opens the template editor
- if the user presses duplicate, it automatically creates a new session template; lets have the duplicate button bring up the template editor for the new session template duplicate; this allows the user to actually modify the new session template before saving it

For the template editor:
- allow the user to pick a template colour for the session template; this will be used as a background colour for the session template name so that the user can better distinguish templates at a glance. see screenshot for how the templates are used with the current default blue backgrounds
- the pencil button to actually edit the session section does not seem to work

We also introduce a new feature into the app: quick sessions
- allow the user to pick a session type in the template: normal or quick session
- normal sessions are the default, same behaviour as current state
- quick sessions are new and behave differently. a quick session, when selected from the create session screen, does not redirect the user to the sessions page. it simply loads in the contents of the quick session onto the bottom of the create session flow
- this type of session is meant to just record very quick measurements. for example, a user could create a quick session for recording their weight every day. this does not need them to have notes, timers, etc.
- quick sessions also have the following properties (since they just extend the create session page):
- cannot have notes
- cannot have activity duration timers
- does not show any goal association, etc. any detail that is in the session detail sidepane
- quick sessions do not have sections
- quick sessions are limited to a max of 5 activities
- quick sessions must have activities associated to them to be created (i.e. cannot be empty, there are no sections)


## Problem

The current session-template flow has three UX gaps and one missing product capability:

1. The manage-template cards have redundant edit affordances.
2. Duplicating a template immediately persists a copy instead of letting the user modify it first.
3. The template editor is missing template-level metadata the rest of the app now needs, and the section edit affordance needs investigation for reliability.
4. The app only supports one session runtime: the full session-detail experience. That is too heavy for measurement-only logging flows such as daily weight, body metrics, or other quick check-ins.

The current implementation is also strongly section-centric:

- template bodies assume `template_data.sections`
- session detail normalizes only `session_data.sections`
- the side pane always exposes notes, goals, history, timers, and session controls
- session creation always redirects to `/${rootId}/session/${createdSessionId}`

That shape is correct for normal sessions but not for quick sessions.

## Goals

1. Refresh the manage session templates page so the card itself is the edit affordance.
2. Change duplicate to open a pre-filled unsaved draft in the template editor.
3. Add template color selection and investigate/fix section edit reliability in the template builder.
4. Add a template-level session type: `normal` or `quick`.
5. Make quick sessions launch inline from the create-session page instead of redirecting away.
6. Enforce quick-session restrictions in both UI and backend validation.
7. Reuse as much of the existing query/data architecture as possible without forcing quick sessions through the section-based session-detail shell.

## Non-Goals

- Rebuilding the full sessions list page.
- Changing existing normal-session behavior beyond template metadata display.
- Adding template-type filtering or analytics in this phase.
- Backfilling historic sessions with inferred quick-session metadata.

## Current State Summary

### Template management

- [CreateSessionTemplate.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSessionTemplate.jsx) owns the template list and opens [TemplateBuilderModal.jsx](/Users/will/Projects/fractal-goals/client/src/components/modals/TemplateBuilderModal.jsx).
- [TemplateCard.jsx](/Users/will/Projects/fractal-goals/client/src/components/TemplateCard.jsx) already opens edit on card click, so the explicit `Edit` button is redundant.
- Duplicate is currently a mutation in the page component that immediately posts a new template to `POST /api/<root_id>/session-templates`.

### Template data model

- [SessionTemplate](/Users/will/Projects/fractal-goals/models/session.py) only stores `name`, `description`, and `template_data`.
- [serialize_session_template](/Users/will/Projects/fractal-goals/services/serializers.py) returns `id`, `name`, `template_data`, `created_at`, and `goals`, but omits `description`, `updated_at`, `root_id`, and any normalized template metadata.
- Template schemas already exist in [validators.py](/Users/will/Projects/fractal-goals/validators.py), but they only validate high-level field presence and do not enforce normal-vs-quick template invariants.

### Session creation and runtime

- [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx) always converts template sections into session sections and always navigates to the session detail route after creation.
- [session_service.py](/Users/will/Projects/fractal-goals/services/session_service.py) hydrates `session_data.sections`, creates activity instances from sections, and inherits goal associations from those activities.
- [SessionDetail.jsx](/Users/will/Projects/fractal-goals/client/src/pages/SessionDetail.jsx) assumes the full detail workspace: sections on the left, side pane on the right.
- [SessionActivityItem.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/SessionActivityItem.jsx) exposes timer controls, note entry, nano-goal capture, and other affordances that quick sessions explicitly should not show.

## Proposed UX

### 1. Manage Session Templates Page

Card behavior:

- Remove the explicit `Edit` button from [TemplateCard.jsx](/Users/will/Projects/fractal-goals/client/src/components/TemplateCard.jsx).
- Keep the entire card clickable to open the editor.
- Keep `Duplicate` and `Delete` as explicit secondary actions.

Duplicate behavior:

- Clicking `Duplicate` should not create anything immediately.
- Instead it should open [TemplateBuilderModal.jsx](/Users/will/Projects/fractal-goals/client/src/components/modals/TemplateBuilderModal.jsx) with:
  - `name = "{original name} (Copy)"`
  - copied description
  - copied `template_data`
  - no persisted `id`
- Saving from that modal should call the create mutation, not update.
- Cancelling should leave no new template behind.

Recommended page-state change in [CreateSessionTemplate.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSessionTemplate.jsx):

- Either:
  - replace `editingTemplate`-only modal state with a builder draft shape such as `builderMode` plus `builderTemplate`, or
  - keep the existing `editingTemplate` state and add a smaller `isDuplicate` flag
- The important contract is that duplicate opens a pre-filled unsaved draft and still saves via `POST`.

### 2. Template Builder

Add two new top-level fields above the structure editor:

1. `Session Type`
   - segmented control or select with `Normal` and `Quick`
   - default `Normal`
2. `Template Color`
   - hex color input, seeded to the current blue
   - live preview chip showing the template name in the selected color

Behavior by template type:

- `Normal`
  - preserves the current sections-based builder
  - requires at least one section
- `Quick`
  - hides the sections UI entirely
  - replaces it with a flat activities picker/list
  - requires 1 to 5 activities
  - does not expose section add/edit/reorder controls
  - does not expose duration planning controls tied to sections

Section edit investigation:

- Treat this as a reliability investigation, not a presumed handler rewrite.
- The section pencil must reliably open the edit modal with the section’s current values.
- Saving must update the correct section in the in-memory draft.
- The implementation may end up in event handling, layering, focus management, or modal UI wiring rather than the `handleEditSection` / `handleUpdateSection` logic itself.

### 3. Template Color Usage

Template color should be used as the background for the template-name badge anywhere the app presents template identity at a glance.

Phase-1 required surfaces:

- [TemplatePicker.jsx](/Users/will/Projects/fractal-goals/client/src/components/createSession/TemplatePicker.jsx)
- [SessionCardExpanded.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessions/SessionCardExpanded.jsx)
- [SessionCard.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessions/SessionCard.jsx)
- [ProgramBlockView.jsx](/Users/will/Projects/fractal-goals/client/src/components/programs/ProgramBlockView.jsx) template chips

Rules:

- Use the template color for the badge background, not the whole card.
- Compute readable foreground text color from the hex value.
- If no color is present, fall back to the current blue.

### 4. Quick Session Create Flow

Quick sessions should still be chosen from the existing create-session source selection flow.

When the selected template has `session_type = quick`:

1. Clicking create still creates a persisted session immediately.
2. The page does not navigate to `/${rootId}/session/${sessionId}`.
3. Instead, the newly created quick session loads inline beneath the create flow.
4. The inline runtime is the primary interaction surface for recording metrics.

Recommended create-page behavior:

- When a quick template is selected, step 3 label changes from `Create Session` to `Start Quick Session`.
- After creation:
  - retain the selection summary at the top
  - mount an embedded quick-session workspace below it
  - keep the user on [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx)

Completion behavior:

- Completing a quick session should not push the user to the sessions page.
- Preferred outcome: mark complete inline, show success feedback, and leave the user on the create page with an option to:
  - start another quick session from the same template
  - open the created session in the full page if needed

### 5. Quick Session Completion Contract

Quick-session completion should reuse the existing session completion mutation semantics where practical, but the spec needs an explicit contract:

- `session_start` is the creation timestamp assigned when the quick session is created.
- `session_end` is set to the completion timestamp when the inline quick session is completed.
- `total_duration_seconds` is derived from `session_end - session_start`.
- activity instances are cascade-completed through the existing session completion path, rather than introducing a separate completion mutation just for quick sessions.
- after inline completion, the workspace becomes read-only and shows a `Start Another` action.
- the user may still open the completed session later via the sessions page route.

### 6. Quick Session Runtime

Quick sessions are capability-restricted sessions, not just templates with fewer fields.

UI rules:

- no sections
- no session notes
- no activity notes
- no activity duration timers
- no goals panel
- no history panel
- no side pane detail surface
- no goal-association affordances
- flat list of activities only

Recommended architecture:

- Keep the existing full session-detail layout for `normal` sessions.
- Introduce a dedicated reusable quick-session workspace component for `quick` sessions.
- Use that same workspace in:
  - embedded mode inside [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx)
  - full-page mode inside [SessionDetail.jsx](/Users/will/Projects/fractal-goals/client/src/pages/SessionDetail.jsx) when a quick session is opened later from the sessions list

This avoids trying to hollow out the entire [SessionSidePane.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/SessionSidePane.jsx) and section stack for a flow that has different structure and constraints.

### 7. Quick Sessions In The Sessions List

Quick sessions still need a usable card representation on the sessions page.

Required differences from the normal session card:

- do not render section grids for quick sessions
- do not render section-count-driven empty states
- keep the template name badge with template color
- show the ordered activity names instead
- keep completion state and timestamps
- if a metric summary is cheap to derive from loaded activity instances, show a compact summary row; otherwise defer that to a follow-up and keep the quick card intentionally simple

The existing [SessionCardExpanded.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessions/SessionCardExpanded.jsx) should branch on session runtime type rather than treating missing sections as generic empty session data.

### 8. Program Scope

Quick templates should not be assignable to program days in this phase.

Reasons:

- the current program-day flow in [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx) assumes section-oriented templates
- allowing quick templates in programs would expand scope into program authoring, program-day rendering, and scheduled-session semantics

Phase-1 rule:

- [ProgramDayModal.jsx](/Users/will/Projects/fractal-goals/client/src/components/modals/ProgramDayModal.jsx) should filter out or disable quick templates
- quick templates remain selectable only from the direct template path in create-session

## Canonical Data Contract

### Template shape

Keep template metadata in `session_templates.template_data` for this phase. No new template table columns are required.

Normal template:

```json
{
  "session_type": "normal",
  "template_color": "#4A90E2",
  "total_duration_minutes": 15,
  "sections": [
    {
      "name": "Stretches",
      "duration_minutes": 15,
      "activities": [
        { "activity_id": "activity-1", "name": "Hamstring Stretch", "type": "mobility" }
      ]
    }
  ]
}
```

Quick template:

```json
{
  "session_type": "quick",
  "template_color": "#4A90E2",
  "activities": [
    { "activity_id": "activity-1", "name": "Body Weight", "type": "measurement" },
    { "activity_id": "activity-2", "name": "Waist", "type": "measurement" }
  ]
}
```

Rules:

- `session_type` defaults to `normal` when missing.
- `template_color` is optional but should be normalized to a valid `#RRGGBB` hex string when present.
- `normal` templates use `sections`; `quick` templates use top-level `activities`.
- A template must not store both populated `sections` and populated quick-session `activities`.

### Session snapshot shape

When a session is created from a template, snapshot template identity into `session.attributes.session_data` so existing sessions remain stable even if the template changes later.

Normal session snapshot:

```json
{
  "template_id": "template-1",
  "template_name": "Daily Stretching",
  "template_color": "#4A90E2",
  "session_type": "normal",
  "program_context": null,
  "sections": [...],
  "total_duration_minutes": 15
}
```

Quick session snapshot:

```json
{
  "template_id": "template-2",
  "template_name": "Daily Weight",
  "template_color": "#4A90E2",
  "session_type": "quick",
  "program_context": null,
  "activity_ids": ["instance-1", "instance-2"]
}
```

Notes:

- `activity_ids` on quick sessions preserves template order without inventing fake sections.
- The serializer should expose `session_type` and `template_color` consistently via `attributes.session_data`, and optionally as top-level convenience fields if that simplifies branching.
- Editing a template later only affects future sessions. Existing quick sessions remain stable because they snapshot template identity into `session_data`.

## Backend Changes

### 1. Template validation and normalization

Strengthen the existing [SessionTemplateCreateSchema](/Users/will/Projects/fractal-goals/validators.py) and [SessionTemplateUpdateSchema](/Users/will/Projects/fractal-goals/validators.py) with a shared template-body validator, backed by service-level ownership checks in [template_service.py](/Users/will/Projects/fractal-goals/services/template_service.py).

Validation rules:

- `session_type in {'normal', 'quick'}`
- `template_color` is absent or a valid hex color
- `normal`
  - `sections.length >= 1`
  - every section has a non-empty name
  - activities are nested within sections
- `quick`
  - `activities.length` is between 1 and 5
  - `sections` must be empty or omitted
  - activities must all belong to the same root

Recommendation:

- keep schema-level validation for basic field shape
- keep service-level validation for activity ownership and cross-entity checks

### 2. Template serialization

Update [serialize_session_template](/Users/will/Projects/fractal-goals/services/serializers.py) to include:

- `description`
- `updated_at`
- `root_id`
- normalized `template_data`
- optionally convenience mirrors:
  - `session_type`
  - `template_color`

This avoids every frontend caller having to re-derive them manually.

### 3. Session creation

Branch session creation in [session_service.py](/Users/will/Projects/fractal-goals/services/session_service.py) by template/session type.

Normal session path:

- preserve current section hydration and activity-instance creation
- preserve current goal inheritance behavior

Quick session path:

- read activities from template-level `template_data.activities`
- create activity instances in that order
- store ordered instance ids in `session_data.activity_ids`
- snapshot `session_type` and `template_color`
- do not synthesize sections
- do not inherit goals from activity definitions
- do not attach manual goal links from create-session flow

Validation rules on create:

- quick sessions must resolve to 1 to 5 valid activity definitions
- quick sessions cannot be created with zero activities
- if a malformed quick template is referenced, return `400`
- `SessionCreateSchema.check_parent_linkage` must be updated so template-backed creation is valid when `template_id` is present
- do not rely on `program_context: null` as an implicit validator bypass

Recommended validator change:

- treat `template_id` as sufficient linkage for template-backed session creation
- keep program-day linkage valid through non-null program context
- do not force quick sessions to attach manual goal links just to satisfy validation

### 4. Session serialization and detail loading

Update [serialize_session](/Users/will/Projects/fractal-goals/services/serializers.py) and [useSessionDetailData.js](/Users/will/Projects/fractal-goals/client/src/hooks/useSessionDetailData.js) to support two runtime shapes:

- `normal`: existing `sections` normalization
- `quick`: normalize ordered top-level `activity_ids` instead of section activity ids

Recommended frontend helper split:

- keep `normalizeSectionActivityIds` for normal sessions
- add `normalizeQuickSessionActivityIds`
- expose a small `sessionRuntimeType` helper based on `session.attributes.session_data.session_type`

### 5. Quick-session guardrails in mutating services

Quick-session restrictions must be enforced server-side, not only hidden in the UI.

Required guards:

- [note_service.py](/Users/will/Projects/fractal-goals/services/note_service.py)
  - reject creating session notes or activity-instance notes for quick sessions
- [timer_service.py](/Users/will/Projects/fractal-goals/services/timer_service.py)
  - reject start/complete timer actions for quick-session activity instances
  - reject pause/resume at the session level for quick sessions
- [session_service.py](/Users/will/Projects/fractal-goals/services/session_service.py)
  - reject add/remove/reorder activity or section mutations for quick sessions
  - keep the 1-to-5 activity rule enforced at template save time and quick-session creation time, not through post-creation mutation affordances

Recommended stance for this phase:

- quick-session structure is fixed by the template after creation
- do not expose add/remove/reorder activity UI for quick sessions
- treat quick-session structure mutation endpoints as unsupported and return `400`

### 6. Shared backend helper

Multiple backend services need a single source of truth for quick-session detection.

Recommendation:

- add a shared helper such as `is_quick_session(session)` in the service layer
- use it from:
  - [session_service.py](/Users/will/Projects/fractal-goals/services/session_service.py)
  - [note_service.py](/Users/will/Projects/fractal-goals/services/note_service.py)
  - [timer_service.py](/Users/will/Projects/fractal-goals/services/timer_service.py)

Expected behavior:

```python
def is_quick_session(session) -> bool:
    attrs = models._safe_load_json(getattr(session, "attributes", None), {})
    session_data = attrs.get("session_data", attrs) if isinstance(attrs, dict) else {}
    return session_data.get("session_type") == "quick"
```

## Frontend Changes

### 1. Template management page

In [CreateSessionTemplate.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSessionTemplate.jsx):

- remove the duplicate mutation that persists immediately
- open the builder in duplicate mode instead
- keep save mutation logic centralized in the builder save path

In [TemplateCard.jsx](/Users/will/Projects/fractal-goals/client/src/components/TemplateCard.jsx):

- remove `Edit` button
- migrate the heavy inline styles into a CSS module while touching the component
- add type/color indicators
- for quick templates:
  - show `Quick Session`
  - show activity count
  - suppress section count

### 2. Template builder modal

In [TemplateBuilderModal.jsx](/Users/will/Projects/fractal-goals/client/src/components/modals/TemplateBuilderModal.jsx):

- add top-level draft fields:
  - `sessionType`
  - `templateColor`
  - `quickActivities`
- seed those fields from `editingTemplate.template_data`
- conditionally render:
  - sections editor for normal
  - flat activity list builder for quick
- persist the new metadata on save
- add clear validation messages for quick-session constraints

Implementation detail:

- reuse [ActivitySearchWidget](/Users/will/Projects/fractal-goals/client/src/components/common/ActivitySearchWidget.jsx) for quick-activity selection to avoid inventing another picker

### 3. Create-session page

In [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx):

- detect `selectedTemplate.template_data.session_type`
- split create behavior:
  - `normal` -> existing navigate-to-detail flow
  - `quick` -> create session, update caches, remain on page, mount embedded quick-session workspace

Recommended local state additions:

- `activeQuickSessionId`
- `activeQuickTemplateId`
- `isInlineQuickSessionOpen`

Also update:

- [TemplatePicker.jsx](/Users/will/Projects/fractal-goals/client/src/components/createSession/TemplatePicker.jsx)
- [ProgramDayPicker.jsx](/Users/will/Projects/fractal-goals/client/src/components/createSession/ProgramDayPicker.jsx)
- [CreateSessionActions.jsx](/Users/will/Projects/fractal-goals/client/src/components/createSession/CreateSessionActions.jsx)

These components should surface:

- template color
- quick-session type badge
- quick-session-specific button text

### 4. Quick-session workspace

Introduce a focused quick-session surface rather than repurposing the full section layout.

Recommended new pieces:

- `client/src/components/sessionDetail/QuickSessionWorkspace.jsx`
- `client/src/components/sessionDetail/QuickSessionActivityList.jsx`
- `client/src/components/sessionDetail/QuickSessionHeader.jsx`

Responsibilities:

- render flat ordered activities
- reuse existing activity-instance query/mutation data
- support metric/set input and completion toggles only
- provide compact save/complete/delete controls

### 5. Session detail branching

In [SessionDetail.jsx](/Users/will/Projects/fractal-goals/client/src/pages/SessionDetail.jsx):

- detect quick sessions after data load
- render:
  - `SessionDetailPaneLayout + SessionSection` for normal sessions
  - `QuickSessionWorkspace` for quick sessions

This should be a route-level branch, not a deep conditional scattered across the entire side-pane stack.

### 6. Shared capability flags

Even with a dedicated quick workspace, some shared components will still need capability flags.

Likely updates:

- [SessionActivityItem.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/SessionActivityItem.jsx)
  - add a compact/quick mode that hides timer and note affordances
- [useSessionDetailMutations.js](/Users/will/Projects/fractal-goals/client/src/hooks/useSessionDetailMutations.js)
  - expose or guard actions based on session runtime type

Avoid spreading raw `session_type === 'quick'` checks everywhere. Use a helper such as:

```javascript
export function isQuickSession(session) {
  return session?.attributes?.session_data?.session_type === 'quick';
}
```

## API Contract Changes

No new endpoints are required for template CRUD or session creation in phase 1.

Existing endpoints to extend:

- `POST /api/<root_id>/session-templates`
- `PUT /api/<root_id>/session-templates/<template_id>`
- `GET /api/<root_id>/session-templates`
- `GET /api/<root_id>/session-templates/<template_id>`
- `POST /api/<root_id>/sessions`
- `GET /api/<root_id>/sessions/<session_id>`

Behavioral changes:

- template responses include the new metadata
- session create accepts quick-template payloads
- quick-session note/timer mutations return `400` with explicit error messages

## Query Cache Impact

The current query-key structure can remain.

Required cache updates:

- `queryKeys.sessionTemplates(rootId)` invalidation remains the source of truth after create/update/delete
- after quick-session create, update the same list caches used by the current [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx) flow:
  - `queryKeys.sessions(rootId)`
  - `queryKeys.sessionsAll(rootId)`
  - `queryKeys.sessionsPaginated(rootId)`
  - `queryKeys.session(rootId, createdSessionId)` if the inline workspace mounts immediately
  - `queryKeys.sessionActivities(rootId, createdSessionId)` once loaded
- if the filtered sessions architecture is active on the branch, also invalidate by prefix for:
  - `queryKeys.sessionsSearch(rootId, filters)`
  - `queryKeys.sessionsHeatmap(rootId, filters)`

No new top-level query families are needed unless the quick-session workspace gains its own derived hook.

## Compatibility And Migration

Recommended compatibility approach:

- existing templates with no `session_type` are treated as `normal`
- existing templates with no `template_color` use the blue fallback
- existing sessions with no `session_type` are treated as `normal`

Because the metadata can live inside JSON payloads, this feature does not require a DB migration unless we later decide to query templates or sessions by type/color at the SQL layer.

## Testing Plan

### Frontend

Add or update tests for:

- [CreateSessionTemplate.test.jsx](/Users/will/Projects/fractal-goals/client/src/pages/__tests__/CreateSessionTemplate.test.jsx)
  - duplicate opens builder instead of posting immediately
  - no edit button is rendered on template cards
- new tests for [TemplateBuilderModal.jsx](/Users/will/Projects/fractal-goals/client/src/components/modals/TemplateBuilderModal.jsx)
  - quick template validation requires 1 to 5 activities
  - quick template save payload includes `session_type` and `template_color`
  - section edit button reliably opens the modal with current section values
- tests for [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx)
  - normal template create navigates
  - quick template create does not navigate and mounts inline workspace
- tests for quick-session detail rendering
  - side pane hidden
  - timers hidden
  - notes hidden

### Backend

Add or update tests for:

- [test_templates_api.py](/Users/will/Projects/fractal-goals/tests/integration/test_templates_api.py)
  - create/update quick templates
  - default `normal` behavior when metadata is omitted
- [test_sessions_api.py](/Users/will/Projects/fractal-goals/tests/integration/test_sessions_api.py)
  - create quick session from template
  - reject malformed quick templates
  - quick sessions do not inherit goals
  - quick sessions serialize `session_type` and `template_color`
- note/timer integration tests
  - notes rejected for quick sessions
  - timer endpoints rejected for quick sessions

## Acceptance Criteria

1. Clicking a template card opens the editor and there is no redundant card-level edit button.
2. Clicking duplicate opens an unsaved copy in the editor; cancelling creates nothing.
3. Template editor supports `Normal` and `Quick` session types.
4. Template editor supports selecting a template color and shows a readable live preview.
5. Section edit via the pencil button is reliable, regardless of whether the fix lands in handlers, event wiring, or modal UI behavior.
6. Template badges across create-session and sessions surfaces use the selected template color.
7. Quick templates can only be saved with 1 to 5 activities and no sections.
8. Creating a quick session keeps the user on the create-session page and opens an inline quick-session workspace.
9. Completing a quick session stamps `session_end`, computes `total_duration_seconds`, cascade-completes activity instances, and leaves the inline workspace read-only with a `Start Another` action.
10. Quick sessions show no notes, no timers, no goal-association surfaces, and no section UI.
11. Quick sessions render a dedicated sessions-list card preview instead of the section-grid preview.
12. Backend rejects quick-session note/timer mutations, malformed quick-session creation payloads, and post-creation structure mutation attempts.
13. Quick templates are not assignable to program days in this phase.

## Recommended Delivery Order

1. Strengthen template validation and serializer output.
2. Refresh manage-template card UX, duplicate flow, and [TemplateCard.jsx](/Users/will/Projects/fractal-goals/client/src/components/TemplateCard.jsx) styling extraction.
3. Update the template builder for session type, color, and section edit reliability.
4. Add server-side quick-session guardrails and the shared `is_quick_session()` helper.
5. Update session creation validation and branching in [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx) and [session_service.py](/Users/will/Projects/fractal-goals/services/session_service.py).
6. Build the reusable quick-session workspace.
7. Add route-level quick-session branching in [SessionDetail.jsx](/Users/will/Projects/fractal-goals/client/src/pages/SessionDetail.jsx) and sessions-list quick-card rendering.
8. Apply template color badges across remaining surfaces.
9. Write tests alongside each step rather than deferring them all to the end.
