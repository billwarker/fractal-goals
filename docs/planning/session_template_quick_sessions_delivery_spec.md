# Session Templates And Quick Sessions Delivery Spec

Created: 2026-03-16

## Purpose

This document consolidates the full scope of the session-template refresh and quick-session work that has been iterated on across the template builder, create-session flow, session detail runtime, and sessions/programs list UI.

It is intended to describe the delivered product shape, the current architecture, the key file touchpoints, and the follow-up constraints that future work should preserve.

## Primary Outcomes

The workstream delivered five major outcomes:

1. Session-template management was simplified and visually upgraded.
2. Session templates now support color and runtime type metadata.
3. Quick sessions were introduced as a first-class session type.
4. The create-session flow now supports embedded quick-session capture instead of forced redirect.
5. The sessions and programs list surfaces were updated to reflect template identity, faster destructive actions, and route-backed quick-session modal viewing.

## Scope Summary

### 1. Session Template Management Refresh

On the manage session templates page:

- the redundant explicit `Edit` button was removed from the template card
- clicking the card itself remains the primary edit affordance
- `Duplicate` no longer immediately persists a new template
- duplicating opens the template builder with a copied draft that is only saved if the user confirms
- template cards now use CSS modules instead of heavy inline styles

Primary files:

- [CreateSessionTemplate.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSessionTemplate.jsx)
- [TemplateCard.jsx](/Users/will/Projects/fractal-goals/client/src/components/TemplateCard.jsx)
- [TemplateCard.module.css](/Users/will/Projects/fractal-goals/client/src/components/TemplateCard.module.css)

### 2. Template Builder Upgrade

The template builder now supports template-level metadata and distinct builder modes for normal versus quick sessions.

Delivered behavior:

- template name and description remain editable
- a new session type field supports `normal` and `quick`
- a new template color field supports hex color selection
- a live preview chip shows the selected template color
- normal templates remain section-based
- quick templates hide sections and use a flat activity list
- quick templates require between 1 and 5 activities
- section edit reliability was restored
- activity adding in the template builder now uses the same inline selector model as session detail

Primary files:

- [TemplateBuilderModal.jsx](/Users/will/Projects/fractal-goals/client/src/components/modals/TemplateBuilderModal.jsx)
- [TemplateBuilderModal.module.css](/Users/will/Projects/fractal-goals/client/src/components/modals/TemplateBuilderModal.module.css)
- [ActivitySelectorPanel.jsx](/Users/will/Projects/fractal-goals/client/src/components/common/ActivitySelectorPanel.jsx)
- [ActivitySelectorPanel.module.css](/Users/will/Projects/fractal-goals/client/src/components/common/ActivitySelectorPanel.module.css)
- [SessionSection.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/SessionSection.jsx)

## Template Metadata Contract

Session templates now carry two runtime-facing metadata fields inside `template_data`:

- `session_type`
- `template_color`

Allowed values:

- `session_type = "normal" | "quick"`
- `template_color = "#RRGGBB"`

Rules:

- omitted or invalid `session_type` normalizes to `normal`
- omitted or invalid `template_color` falls back to the default blue
- normal templates serialize `sections` plus `total_duration_minutes`
- quick templates serialize `activities`

Primary backend files:

- [validators.py](/Users/will/Projects/fractal-goals/validators.py)
- [services/serializers.py](/Users/will/Projects/fractal-goals/services/serializers.py)
- [services/session_runtime.py](/Users/will/Projects/fractal-goals/services/session_runtime.py)

## Quick Sessions

### Product Definition

Quick sessions are a lightweight runtime intended for fast metric capture, such as daily weight or similar measurement-only logging.

Quick sessions differ from normal sessions in four ways:

1. They are flat activity lists rather than section-based sessions.
2. They do not expose the full session-detail sidepane workflow.
3. They are embedded into the create-session experience for capture.
4. Their mutation surface is intentionally restricted.

### Quick Session Restrictions

Quick sessions must preserve these rules:

- no sections
- no session notes
- no activity notes
- no timers or duration controls on activity instances
- no goal-association sidepane affordances
- no add/remove/reorder activity structure after creation
- minimum 1 activity
- maximum 5 activities
- program-day-backed quick template launches are rejected

Primary backend enforcement:

- [services/session_service.py](/Users/will/Projects/fractal-goals/services/session_service.py)
- [services/note_service.py](/Users/will/Projects/fractal-goals/services/note_service.py)
- [services/timer_service.py](/Users/will/Projects/fractal-goals/services/timer_service.py)

### Quick Session Creation Contract

When a quick session is created:

- `session_start` is set at creation time
- `session_end` remains unset until completion
- `total_duration_seconds` is computed on completion
- activity instances are created immediately from the template activity list
- `session_data.activity_ids` preserves the intended activity order
- template identity is snapshotted into the session so future template edits do not retroactively change historic sessions

## Create Session Flow

### Normal Templates

Normal templates preserve the existing create-session behavior:

- select template or program-backed session
- create persisted session
- redirect to the full session detail route

### Quick Templates

Quick-template behavior was refined beyond the original plan.

Current flow:

1. The user selects a quick template in [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx).
2. The app immediately creates the quick session.
3. The quick-session workspace is loaded inline before the final step area.
4. The next step becomes `Complete Quick Session`.
5. Completion happens inline instead of redirecting away.

Additional behavior:

- a loading state is shown while the quick session is being created
- embedded quick sessions support `Start Another`
- deleting the embedded quick session clears the active quick selection
- the embedded quick-session workspace hides its internal completion button when the dedicated completion step is present

Primary files:

- [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx)
- [CreateSessionActions.jsx](/Users/will/Projects/fractal-goals/client/src/components/createSession/CreateSessionActions.jsx)
- [QuickSessionCompleteStep.jsx](/Users/will/Projects/fractal-goals/client/src/components/createSession/QuickSessionCompleteStep.jsx)
- [TemplatePicker.jsx](/Users/will/Projects/fractal-goals/client/src/components/createSession/TemplatePicker.jsx)

## Quick Session Runtime UI

Quick sessions have their own dedicated workspace rather than reusing the full detail-pane shell.

Delivered characteristics:

- flat activity list
- template badge as the primary title treatment
- quick-session type pill shown beneath the template badge
- session header metadata for `Session Start` and `Last Modified`
- inline completion flow
- editable after completion
- session completion can be toggled back to incomplete
- `Start Another` support after completion in embedded mode
- delete support
- full-page route support remains available
- the quick-session modal uses a slimmer session-detail-style surface when launched from the sessions page
- quick-session activities now use a lighter dedicated card component instead of the full session-detail activity component
- activity cards support nested activity-group breadcrumbs beneath the activity name

Primary files:

- [QuickSessionWorkspace.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/QuickSessionWorkspace.jsx)
- [QuickSessionWorkspace.module.css](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/QuickSessionWorkspace.module.css)
- [QuickSessionActivityCard.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/QuickSessionActivityCard.jsx)
- [QuickSessionActivityCard.module.css](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/QuickSessionActivityCard.module.css)
- [SessionDetail.jsx](/Users/will/Projects/fractal-goals/client/src/pages/SessionDetail.jsx)
- [SessionActivityItem.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/SessionActivityItem.jsx)
- [SessionActivityItem.module.css](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/SessionActivityItem.module.css)

## Template Identity And Styling

Template identity is now visually carried through the product by template-colored badges.

Delivered behavior:

- template cards use a single large color badge for the template name
- the `normal` / `quick` badge appears beneath the template name on template cards
- the sessions page applies template color styling directly to the session-name link on the row
- the old separate template field in the session row was removed
- older sessions fall back to the linked template metadata when the serialized snapshot is incomplete

Primary files:

- [TemplateCard.jsx](/Users/will/Projects/fractal-goals/client/src/components/TemplateCard.jsx)
- [TemplateCard.module.css](/Users/will/Projects/fractal-goals/client/src/components/TemplateCard.module.css)
- [SessionCardExpanded.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessions/SessionCardExpanded.jsx)
- [SessionCardExpanded.module.css](/Users/will/Projects/fractal-goals/client/src/components/sessions/SessionCardExpanded.module.css)
- [services/serializers.py](/Users/will/Projects/fractal-goals/services/serializers.py)
- [services/session_service.py](/Users/will/Projects/fractal-goals/services/session_service.py)

## Sessions Page Changes

The sessions page received several follow-on refinements during this workstream.

### Quick Session Rows

Quick-session rows now:

- no longer render a simple activity-name pill list
- render the same read-only activity cards used by normal session displays
- show recorded metrics directly inside those cards

### Quick Session Modal On Sessions Page

Quick sessions no longer have to be opened as a largely empty standalone detail page from the sessions list.

Delivered behavior:

- clicking a quick session from the sessions page opens a route-backed modal overlay
- the modal is driven by `quickSessionId` in the sessions-page URL
- direct route support for the standalone quick-session page still exists
- the modal uses the same `QuickSessionWorkspace` runtime component as other quick-session surfaces
- the quick-session workspace inside the modal is fully editable rather than read-only
- header metadata on the modal mirrors the sessions-page top-line style with label/value columns
- the modal title uses only the colored template badge, without a redundant plain-text title

Primary files:

- [Sessions.jsx](/Users/will/Projects/fractal-goals/client/src/pages/Sessions.jsx)
- [Sessions.module.css](/Users/will/Projects/fractal-goals/client/src/pages/Sessions.module.css)
- [SessionCardExpanded.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessions/SessionCardExpanded.jsx)
- [QuickSessionWorkspace.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/QuickSessionWorkspace.jsx)

Primary files:

- [SessionCardExpanded.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessions/SessionCardExpanded.jsx)
- [ExerciseCard.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessions/ExerciseCard.jsx)

### Session Row Delete Action

Each expanded session row now includes a top-right delete `×` affordance.

Behavior:

- clicking the `×` opens the shared confirmation modal
- confirming delete removes the session through the API
- the deleted session is hidden immediately from the list
- relevant session queries are invalidated

Primary files:

- [Sessions.jsx](/Users/will/Projects/fractal-goals/client/src/pages/Sessions.jsx)
- [SessionCardExpanded.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessions/SessionCardExpanded.jsx)
- [DeleteConfirmModal.jsx](/Users/will/Projects/fractal-goals/client/src/components/modals/DeleteConfirmModal.jsx)

### Session Row Layout Refinements

The session row header was iterated to improve scanability:

- template styling moved onto the primary session-name link
- the completed state uses a more visible circular check treatment
- top-line column spacing and alignment were tightened
- the delete `×` is now always visible rather than hover-only

## Programs Page Alignment

To keep destructive card affordances consistent, the same top-right `×` pattern is now used on program cards.

Delivered behavior:

- the delete `×` on program cards is always visible
- it uses the same shared corner-action component as session rows
- hover only changes the `×` color to red, without a circular hover background

Primary files:

- [Programs.jsx](/Users/will/Projects/fractal-goals/client/src/pages/Programs.jsx)
- [Programs.module.css](/Users/will/Projects/fractal-goals/client/src/pages/Programs.module.css)
- [CardCornerActionButton.jsx](/Users/will/Projects/fractal-goals/client/src/components/common/CardCornerActionButton.jsx)
- [CardCornerActionButton.module.css](/Users/will/Projects/fractal-goals/client/src/components/common/CardCornerActionButton.module.css)

## Shared Components Introduced

This workstream introduced three notable shared UI/runtime pieces:

### 1. Activity Selector Panel

A reusable inline activity selector shared by session detail and the template builder.

Files:

- [ActivitySelectorPanel.jsx](/Users/will/Projects/fractal-goals/client/src/components/common/ActivitySelectorPanel.jsx)
- [ActivitySelectorPanel.module.css](/Users/will/Projects/fractal-goals/client/src/components/common/ActivitySelectorPanel.module.css)

### 2. Quick Session Completion Step

A dedicated create-session step for inline quick-session completion.

File:

- [QuickSessionCompleteStep.jsx](/Users/will/Projects/fractal-goals/client/src/components/createSession/QuickSessionCompleteStep.jsx)

### 3. Card Corner Action Button

A shared always-visible top-right card action for delete affordances.

Files:

- [CardCornerActionButton.jsx](/Users/will/Projects/fractal-goals/client/src/components/common/CardCornerActionButton.jsx)
- [CardCornerActionButton.module.css](/Users/will/Projects/fractal-goals/client/src/components/common/CardCornerActionButton.module.css)

### 4. Quick Session Activity Card

A lighter editable activity-instance card for quick-session runtime that reuses the session-detail styling language without the full timer/notes/reorder surface.

Files:

- [QuickSessionActivityCard.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/QuickSessionActivityCard.jsx)
- [QuickSessionActivityCard.module.css](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/QuickSessionActivityCard.module.css)

## Backend Guardrails And Serialization

The backend now explicitly understands quick-session runtime constraints.

Delivered backend behavior:

- template validation distinguishes normal versus quick template structure
- session creation validates quick-session restrictions
- quick sessions reject notes and timers
- quick sessions reject structural activity mutation flows that only make sense for normal sessions
- session/template serializers expose runtime metadata needed by the frontend
- session serializers can fall back to linked template metadata when older sessions lack full snapshot fields

Primary files:

- [validators.py](/Users/will/Projects/fractal-goals/validators.py)
- [services/session_runtime.py](/Users/will/Projects/fractal-goals/services/session_runtime.py)
- [services/session_service.py](/Users/will/Projects/fractal-goals/services/session_service.py)
- [services/serializers.py](/Users/will/Projects/fractal-goals/services/serializers.py)
- [services/note_service.py](/Users/will/Projects/fractal-goals/services/note_service.py)
- [services/timer_service.py](/Users/will/Projects/fractal-goals/services/timer_service.py)

## Testing Surface

The work touched both backend integration coverage and frontend component coverage.

Relevant automated coverage includes:

- [tests/integration/test_templates_api.py](/Users/will/Projects/fractal-goals/tests/integration/test_templates_api.py)
- [tests/integration/test_sessions_api.py](/Users/will/Projects/fractal-goals/tests/integration/test_sessions_api.py)
- [tests/integration/test_notes_api.py](/Users/will/Projects/fractal-goals/tests/integration/test_notes_api.py)
- [tests/integration/test_timers_api.py](/Users/will/Projects/fractal-goals/tests/integration/test_timers_api.py)
- [TemplateBuilderModal.test.jsx](/Users/will/Projects/fractal-goals/client/src/components/modals/__tests__/TemplateBuilderModal.test.jsx)
- [SessionCardExpanded.test.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessions/__tests__/SessionCardExpanded.test.jsx)
- [Sessions.test.jsx](/Users/will/Projects/fractal-goals/client/src/pages/__tests__/Sessions.test.jsx)
- [QuickSessionActivityCard.test.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessionDetail/__tests__/QuickSessionActivityCard.test.jsx)

## Follow-Up Constraints

Future work should preserve these product decisions unless there is an explicit change in requirements:

1. Quick sessions are not a slimmer normal session; they are a different runtime contract.
2. Quick templates remain flat activity lists with a 1 to 5 activity limit.
3. Quick sessions should stay inline-first from the create-session page.
4. When quick sessions are opened from the sessions page, modal presentation is preferred over forcing a full detail page.
5. Template color is part of template identity and should continue to be shown where template recognition matters.
6. The template builder and session detail should continue sharing the same activity selector pattern.
7. Destructive top-right `×` controls on cards should keep using the shared corner-action component.

## Recommended Next Follow-Ups

The main remaining follow-ups are not product-definition work; they are cleanup and hardening work:

1. Browser QA across template management, quick-session creation, session detail, sessions list, and programs list.
2. Cleanup of existing React hook/lint warnings in high-churn files such as [SessionCardExpanded.jsx](/Users/will/Projects/fractal-goals/client/src/components/sessions/SessionCardExpanded.jsx) and [Sessions.jsx](/Users/will/Projects/fractal-goals/client/src/pages/Sessions.jsx).
3. Additional page-level tests for the quick-session create flow in [CreateSession.jsx](/Users/will/Projects/fractal-goals/client/src/pages/CreateSession.jsx).
