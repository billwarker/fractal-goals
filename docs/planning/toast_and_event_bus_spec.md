# Toast Notifications And Event Bus

> Final implementation record for the toast-notification and backend event-bus hardening work completed on March 18, 2026.

## Status

This work is implemented and verified.

The feature now meets the intended hardening goals:

1. User-initiated write paths in scope have a consistent notification policy.
2. Business code no longer imports `react-hot-toast` directly outside `client/src/utils/notify.js` and `client/src/main.jsx`.
3. Backend event coverage includes template deletion, program day schedule/unschedule, note CRUD, and nano-goal note creation.
4. The shared notification helper is resilient when an `onError` callback throws.
5. Event-log descriptions exist for the newly added backend events.
6. Focused frontend and backend tests directly prove the new behavior.

## Final Frontend Design

### Notification infrastructure

- `client/src/utils/notify.js` remains the only business-facing toast wrapper.
- `client/src/utils/mutationNotify.js` now owns shared mutation error formatting and async mutation wrapping.

### `mutationNotify.js` contract

Implemented API:

- `formatError(error, fallbackMessage?)`
- `withNotify(mutationFn, options?)`

Implemented hardening:

- `withNotify(...)` wraps `onError` in its own `try/catch`
- if `onError` throws, it logs:
  - `console.error('withNotify onError handler failed', handlerError)`
- the user still gets the main error toast
- the original mutation error is still rethrown

### Notification policy applied

Implemented policy:

- destructive and save-style mutations surface error toasts
- create/delete flows surface success toasts unless intentionally delegated elsewhere
- high-frequency inline edits remain success-silent where that is the better UX
- all business-code toast calls go through `notify`
- shared error formatting uses `formatError(...)`

### Intentionally silent paths kept silent

These were explicitly preserved:

- `GoalsContext.updateGoal`
- `ActivitiesContext.reorderActivityGroups`
- `ActivitiesContext.setActivityGroupGoals`

## Final Backend Design

### Stable event names in scope

The following event names are now implemented and treated as stable for this feature:

- `SESSION_TEMPLATE_DELETED`
- `PROGRAM_DAY_SCHEDULED`
- `PROGRAM_DAY_UNSCHEDULED`
- `NOTE_CREATED`
- `NOTE_UPDATED`
- `NOTE_DELETED`

### Nano-goal note event contract

`NoteService.create_nano_goal_note(...)` now emits both persisted-domain events in this order:

1. `NOTE_CREATED`
2. `GOAL_CREATED`

This preserves complete audit coverage for the combined note-plus-goal write path.

### Payload expectations now covered by tests

- `NOTE_CREATED`
  - `note_id`
  - `note_content`
  - `context_type`
  - `context_id`
  - `root_id`
  - `session_id`
  - `activity_instance_id`
  - `nano_goal_id`
- `NOTE_UPDATED`
  - note identity/context fields
  - `updated_fields`
- `NOTE_DELETED`
  - note identity/context fields
- `PROGRAM_DAY_SCHEDULED`
  - `day_id`
  - `day_name`
  - `block_id`
  - `program_id`
  - `root_id`
  - `scheduled_date`
  - `session_id`
  - `session_name`
- `PROGRAM_DAY_UNSCHEDULED`
  - `day_id`
  - `day_name`
  - `block_id`
  - `program_id`
  - `root_id`
  - `date`
  - `removed_session_ids`
  - `removed_count`
- `SESSION_TEMPLATE_DELETED`
  - `template_id`
  - `name`
  - `root_id`

## Implemented File Scope

### Frontend

- `client/src/utils/mutationNotify.js`
- `client/src/hooks/useProgramDetailMutations.js`
- `client/src/hooks/useSessionNotes.js`
- `client/src/hooks/useSessionDetailMutations.js`
- `client/src/contexts/GoalsContext.jsx`
- `client/src/contexts/ActivitiesContext.jsx`
- `client/src/pages/Programs.jsx`
- `client/src/pages/Selection.jsx`
- `client/src/components/GoalCharacteristicsSettings.jsx`
- `client/src/components/modals/GoalModal.jsx`
- `client/src/components/modals/SettingsModal.jsx`

### Backend

- `services/events.py`
- `services/event_logger.py`
- `services/note_service.py`
- `services/programs.py`
- `services/template_service.py`

## Verification

### Frontend tests added or expanded

- `client/src/utils/__tests__/mutationNotify.test.js`
  - `formatError(...)` coverage for plain strings, nested validation objects, arrays, generic errors, and fallback behavior
  - `withNotify(...)` coverage for success, functional success, silence via `success: null`, error, functional error, and `onError` throwing
- `client/src/contexts/__tests__/GoalsContext.test.jsx`
  - create success/error toasts
  - update success silence plus error coverage
  - toggle completion success/error toasts
- `client/src/contexts/__tests__/ActivitiesContext.test.jsx`
  - create/update/delete group success/error toasts
  - reorder and set-goals success silence plus error coverage
- `client/src/pages/__tests__/Selection.test.jsx`
  - fractal create/delete failures use `notify.error(...)` rather than `alert(...)`
- existing focused hook tests remain in coverage:
  - `client/src/hooks/__tests__/useSessionNotes.test.jsx`
  - `client/src/hooks/__tests__/useSessionDetailNotes.test.jsx`
  - `client/src/hooks/__tests__/useProgramDetailMutations.test.js`

### Backend tests added or expanded

- `tests/unit/services/test_note_service.py`
  - note create/update/delete emissions
  - nano-goal note emits `NOTE_CREATED` then `GOAL_CREATED`
- `tests/unit/services/test_template_service.py`
  - template delete emits `SESSION_TEMPLATE_DELETED`
- `tests/unit/services/test_programs.py`
  - unschedule emits `PROGRAM_DAY_UNSCHEDULED` when sessions are removed
  - unschedule does not emit the event when nothing matched
- `tests/unit/services/test_backend_utilities.py`
  - logger descriptions for `NOTE_UPDATED`, `NOTE_DELETED`, and `PROGRAM_DAY_UNSCHEDULED`
- `tests/integration/test_notes_api.py`
  - note CRUD persistence plus note-event coverage
  - nano-goal note emits both note and goal events
- `tests/integration/test_templates_api.py`
  - template delete continues to persist correctly and emits the delete event
- `tests/integration/test_programs_api.py`
  - unschedule continues to persist correctly and emits the unscheduled event

### Direct verification completed

- `rg -n "react-hot-toast" client/src -g '!client/src/utils/notify.js' -g '!client/src/main.jsx'`
  - no remaining business-code direct imports found
- frontend tests:
  - `npm test -- --run src/utils/__tests__/mutationNotify.test.js src/contexts/__tests__/GoalsContext.test.jsx src/contexts/__tests__/ActivitiesContext.test.jsx src/pages/__tests__/Selection.test.jsx src/hooks/__tests__/useSessionNotes.test.jsx src/hooks/__tests__/useSessionDetailNotes.test.jsx src/hooks/__tests__/useProgramDetailMutations.test.js`
- backend tests:
  - `fractal-goals-venv/bin/pytest --no-cov tests/unit/services/test_note_service.py tests/unit/services/test_template_service.py tests/unit/services/test_programs.py tests/unit/services/test_backend_utilities.py tests/integration/test_notes_api.py tests/integration/test_templates_api.py tests/integration/test_programs_api.py`
- frontend lint:
  - `./node_modules/.bin/eslint src/utils/mutationNotify.js src/utils/__tests__/mutationNotify.test.js src/contexts/__tests__/GoalsContext.test.jsx src/contexts/__tests__/ActivitiesContext.test.jsx src/pages/__tests__/Selection.test.jsx`
  - `./node_modules/.bin/eslint src/contexts/GoalsContext.jsx src/contexts/ActivitiesContext.jsx src/hooks/useProgramDetailMutations.js src/hooks/useSessionNotes.js src/pages/Selection.jsx src/pages/Programs.jsx src/components/GoalCharacteristicsSettings.jsx src/components/modals/GoalModal.jsx src/components/modals/SettingsModal.jsx src/hooks/useSessionDetailMutations.js`

## Non-Goals

This work did not change:

- frontend custom-event strategy
- `client/src/main.jsx`
- `client/src/utils/notify.js`
- already-correct completion-event flows outside this feature scope
