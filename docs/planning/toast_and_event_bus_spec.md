# Toast Notifications & Event Bus — S-Rank Spec

> Bring toast notifications and event emission to comprehensive, consistent, production-grade quality across the full stack.

## Current State

### Frontend — Toast Notifications

**Infrastructure:** `react-hot-toast` wrapped by `client/src/utils/notify.js` (success, error, loading, dismiss, custom).

**Problem 1 — Inconsistent import style.** Four files bypass `notify` and import `toast` from `react-hot-toast` directly:
- `hooks/useProgramDetailMutations.js`
- `components/GoalCharacteristicsSettings.jsx`
- `components/modals/SettingsModal.jsx`
- `components/modals/GoalModal.jsx`

**Problem 2 — Missing success toasts.** Many write operations give no feedback on success:

| Area | Operations missing success toasts |
|------|-----------------------------------|
| Programs | saveProgram, saveBlock, deleteBlock, saveDay, deleteDay, copyDay, scheduleDay, unscheduleDay, saveAttachedGoal, setGoalDeadline |
| Goals (GoalsContext) | createGoal, updateGoal, toggleGoalCompletion |
| Activity Groups (ActivitiesContext) | createActivityGroup, updateActivityGroup, deleteActivityGroup, reorderActivityGroups, setActivityGroupGoals |
| Session Detail | removeActivity, createGoal, updateGoal (no success toast) |
| Notes | createNote, updateNote (regular notes — only nano-goal notes have toasts) |
| Auth | login, updateUsername, updatePreferences |
| Fractals | createFractal, deleteFractal |

**Problem 3 — Missing error toasts.** Some mutation error paths only `console.error` with no user-facing feedback:
- All ActivitiesContext group operations
- GoalsContext create/update/toggleCompletion
- Session detail removeActivity, createGoal, updateGoal
- Programs.jsx `copyDay`

**Problem 4 — No centralized mutation-notification pattern.** Each hook/context hand-rolls its own try/catch + toast calls, leading to drift and omissions.

### Frontend — Custom Events

**Infrastructure:** Ad-hoc `window.dispatchEvent(new CustomEvent(...))` in ActivitiesContext only.

Events emitted: `activity.created`, `activity.updated`, `activity.deleted`, `activities.changed`.
Auth events: `auth:token_refreshed`, `auth:unauthorized` (from `utils/api/core.js`).

No other domain emits frontend custom events. This is acceptable — TanStack Query invalidation handles cross-component data freshness. Frontend custom events should only exist for non-data side effects (closing modals, scroll-to, animations). The current activity events serve this purpose. **No new frontend custom events are needed.**

### Backend — Event Bus

**Infrastructure:** Well-built `EventBus` in `services/events.py` with `Events` constants, wildcard subscriptions, async emit, failure handlers, and database logging via `event_logger.py`.

**Problem 5 — Missing event emissions.** The `Events` class defines constants that are never emitted:
- `SESSION_TEMPLATE_DELETED` — constant doesn't exist, and `template_service.py` doesn't emit on delete
- `PROGRAM_BLOCK_CREATED` — no emission found in `programs.py` for block creation
- `PROGRAM_BLOCK_UPDATED` — no emission found for block update
- `PROGRAM_COMPLETED` — no emission found
- `PROGRAM_BLOCK_COMPLETED` — no emission found
- `TARGET_REVERTED` — no emission found
- `GOAL_DAY_ASSOCIATED` — only emitted from `attach_goal_to_day`, not from day-level goal operations

**Problem 6 — Missing Events constants.** Some events that should be tracked have no constant:
- `SESSION_TEMPLATE_DELETED`
- `PROGRAM_DAY_SCHEDULED` / `PROGRAM_DAY_UNSCHEDULED`
- `NOTE_CREATED` / `NOTE_UPDATED` / `NOTE_DELETED` (note_service only emits one event type)

---

## Design

### Principle: Centralized Mutation Notification

Instead of scattering `notify.success()` / `notify.error()` calls across every mutation site, introduce a **notification descriptor pattern** that mutation hooks can declare and a thin wrapper executes.

This keeps mutation logic focused on data, and notification policy in one reviewable place per domain.

### Architecture

```
client/src/utils/
├── notify.js                    # existing — low-level toast calls (keep as-is)
├── mutationNotify.js            # NEW — wraps mutations with declarative toast config
```

#### `mutationNotify.js`

```js
import notify from './notify';

/**
 * Wraps an async mutation function with standardized toast notifications.
 *
 * @param {Function} mutationFn - The async function to execute
 * @param {Object} options
 * @param {string|Function|null} options.success - Success message, or fn(result) => string, or null to skip
 * @param {string|Function} options.error - Error message prefix, or fn(error) => string
 * @returns {Function} Wrapped async function with identical signature
 */
export function withNotify(mutationFn, { success = null, error = 'Operation failed' } = {}) {
  return async (...args) => {
    try {
      const result = await mutationFn(...args);
      if (success) {
        const message = typeof success === 'function' ? success(result, ...args) : success;
        if (message) notify.success(message);
      }
      return result;
    } catch (err) {
      const message = typeof error === 'function' ? error(err) : `${error}: ${formatError(err)}`;
      notify.error(message);
      throw err;
    }
  };
}

/**
 * Extract a human-readable error message from an API error.
 * Centralizes the scattered error-formatting logic.
 */
export function formatError(err) {
  const data = err?.response?.data;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data === 'string') return data;
  if (err?.message) return err.message;
  return 'Unknown error';
}
```

#### Usage Pattern — Context Mutations

```js
// Before (ActivitiesContext)
const createActivityGroup = useCallback(async (rootId, data) => {
  try {
    const res = await fractalApi.createActivityGroup(rootId, data);
    // ... cache update ...
    return created;
  } catch (err) {
    console.error('Failed to create activity group:', err);
    throw err;
  }
}, [queryClient]);

// After
const createActivityGroup = useCallback(
  withNotify(
    async (rootId, data) => {
      const res = await fractalApi.createActivityGroup(rootId, data);
      // ... cache update ...
      return created;
    },
    { success: (result) => `Created group "${result?.name || 'Untitled'}"`, error: 'Failed to create group' }
  ),
  [queryClient]
);
```

#### Usage Pattern — TanStack Mutations

For hooks using `useMutation`, define notification config alongside the mutation:

```js
const deleteSessionMutation = useMutation({
  mutationFn: () => fractalApi.deleteSession(rootId, sessionId),
  onSuccess: () => {
    invalidateSessionListQueries();
    notify.success('Session deleted');
  },
  onError: (err) => {
    notify.error(`Failed to delete session: ${formatError(err)}`);
  },
});
```

This is already close to correct in several places — just needs the missing `onError`/`onSuccess` handlers filled in.

---

## Implementation Plan

### Phase 1 — Foundation

**1.1 Create `mutationNotify.js`**
- `withNotify` wrapper function
- `formatError` utility (consolidates `getErrorMessage` from `useProgramDetailMutations.js` and inline error formatting elsewhere)

**1.2 Migrate direct `react-hot-toast` imports to `notify`**

| File | Change |
|------|--------|
| `hooks/useProgramDetailMutations.js` | `import { toast } from 'react-hot-toast'` → `import notify from '../utils/notify'`; replace `toast.error(...)` → `notify.error(...)` |
| `components/GoalCharacteristicsSettings.jsx` | Same pattern |
| `components/modals/SettingsModal.jsx` | Same pattern |
| `components/modals/GoalModal.jsx` | Same pattern |

After this phase, the only file importing `react-hot-toast` directly is `notify.js` and `main.jsx` (for the `<Toaster>` component).

### Phase 2 — Fill Toast Gaps

**2.1 Programs — `useProgramDetailMutations.js`**

Wrap each mutation with `withNotify` or add `notify.success()` calls. Use the existing `onProgramSaved`/`onBlockSaved`/etc. callback pattern — add toast before calling the callback.

| Mutation | Success message |
|----------|----------------|
| `saveProgram` | `"Program updated"` |
| `saveBlock` | `"Training block saved"` |
| `deleteBlock` | `"Training block deleted"` |
| `saveDay` | `"Day saved"` |
| `deleteDay` | `"Day deleted"` |
| `copyDay` | `"Day copied"` — also add error toast (currently bare) |
| `scheduleDay` | `"Day scheduled"` |
| `unscheduleDay` | `"Day unscheduled"` |
| `saveAttachedGoal` | `"Goal attached"` |
| `setGoalDeadline` | `"Deadline updated"` |
| `updateGoal` | `"Goal updated"` |
| `toggleGoalCompletion` | Use same pattern as session detail — `"{GoalType} Completed/Uncompleted"` |
| `deleteGoal` | `"Goal deleted"` |
| `createGoal` | `"Goal created"` |

**2.2 Goals — `GoalsContext.jsx`**

| Mutation | Success | Error |
|----------|---------|-------|
| `createGoalMutation` | `"Goal created"` | `"Failed to create goal: {error}"` |
| `updateGoalMutation` | `null` (silent — too frequent from inline edits) | `"Failed to update goal: {error}"` |
| `toggleGoalCompletionMutation` | `"{GoalType} Completed/Uncompleted: {name}"` | `"Failed to toggle goal: {error}"` |
| `deleteGoalMutation` | already has `"Goal deleted"` | add `"Failed to delete goal: {error}"` |

**2.3 Activities — `ActivitiesContext.jsx`**

Activity CRUD already has toasts. Fill the gaps for group operations:

| Mutation | Success | Error |
|----------|---------|-------|
| `createActivityGroup` | `"Created group \"{name}\""` | `"Failed to create group: {error}"` |
| `updateActivityGroup` | `"Updated group \"{name}\""` | `"Failed to update group: {error}"` |
| `deleteActivityGroup` | `"Deleted group"` | `"Failed to delete group: {error}"` |
| `reorderActivityGroups` | `null` (silent — drag-based, toast would be noisy) | `"Failed to reorder groups: {error}"` |
| `setActivityGroupGoals` | `null` (silent — multi-select, feels transactional) | `"Failed to update group goals: {error}"` |

**2.4 Session Detail — `useSessionDetailMutations.js`**

| Mutation | Add |
|----------|-----|
| `addActivityMutation` | `onSuccess`: `"Activity added"` |
| `removeActivityMutation` | `onSuccess`: `"Activity removed"`, `onError`: `"Failed to remove activity: {error}"` |
| `updateGoalMutation` | `onError`: `"Failed to update goal: {error}"` |
| `createGoal` | `onError`: `"Failed to create goal: {error}"` |

**2.5 Auth — `SettingsModal.jsx` + `AuthModal.jsx`**

| Operation | Add |
|-----------|-----|
| Login success | `null` (silent — the redirect is the feedback) |
| Username update | `"Username updated"` + error toast (if this endpoint is called anywhere) |
| Preferences update | `null` (silent — toggle is the feedback) |

**2.6 Programs page — `Programs.jsx`**

| Operation | Add |
|-----------|-----|
| `saveProgram` (create) | `"Program created"` success toast |
| `deleteProgram` | `"Program deleted"` success toast |

**2.7 Session Templates — `CreateSessionTemplate.jsx`**

Already has success/error toasts. No changes needed.

**2.8 Fractals — wherever `createFractal` / `deleteFractal` are called**

| Operation | Add |
|-----------|-----|
| `createFractal` | `"Fractal created"` + error toast |
| `deleteFractal` | `"Fractal deleted"` + error toast |

### Phase 3 — Backend Event Bus Gaps

**3.1 Add missing `Events` constants**

```python
# In services/events.py Events class:
SESSION_TEMPLATE_DELETED = 'session_template.deleted'
PROGRAM_DAY_SCHEDULED = 'program_day.scheduled'
PROGRAM_DAY_UNSCHEDULED = 'program_day.unscheduled'
NOTE_CREATED = 'note.created'
NOTE_UPDATED = 'note.updated'
NOTE_DELETED = 'note.deleted'
```

**3.2 Add missing event emissions in services**

| Service | Method | Event to emit |
|---------|--------|---------------|
| `template_service.py` | delete_template | `SESSION_TEMPLATE_DELETED` |
| `programs.py` | create_block | `PROGRAM_BLOCK_CREATED` |
| `programs.py` | update_block | `PROGRAM_BLOCK_UPDATED` |
| `programs.py` | schedule_day | `PROGRAM_DAY_SCHEDULED` |
| `programs.py` | unschedule_day | `PROGRAM_DAY_UNSCHEDULED` |
| `note_service.py` | create_note | `NOTE_CREATED` (if not already) |
| `note_service.py` | update_note | `NOTE_UPDATED` |
| `note_service.py` | delete_note | `NOTE_DELETED` |

**3.3 Add event descriptions to `event_logger.py`**

Add description mappings for every new event constant so they render properly in the logs UI.

### Phase 4 — Cleanup

**4.1 Remove `formatStructuredError` / `getErrorMessage` from `useProgramDetailMutations.js`**

Replace with the shared `formatError` from `mutationNotify.js`.

**4.2 Verify no orphaned direct `toast` imports remain**

Grep for `from 'react-hot-toast'` — only `notify.js` and `main.jsx` should match.

**4.3 Audit `console.error` calls in mutation paths**

Keep `console.error` for debugging, but ensure every one is paired with a user-facing `notify.error`.

---

## Notification Policy

These rules should guide future development:

1. **Every destructive mutation** (delete, remove, unschedule) gets a success toast.
2. **Every creation** gets a success toast.
3. **Updates** get a success toast unless the operation is frequent/inline (e.g., drag-reorder, real-time field edits). Use judgment — if the user clicked a "Save" button, they expect confirmation.
4. **Every failed mutation** gets an error toast. No silent failures for user-initiated actions.
5. **All toasts go through `notify.*`** — never import `react-hot-toast` directly in business code.
6. **Error messages** use `formatError()` for consistency.
7. **Backend services** emit a domain event after every successful write that changes persisted state.

---

## Files Changed

### New files
- `client/src/utils/mutationNotify.js`

### Modified files
- `client/src/utils/notify.js` — no changes needed (already correct)
- `client/src/hooks/useProgramDetailMutations.js` — migrate to `notify`, add success toasts, use `formatError`
- `client/src/contexts/GoalsContext.jsx` — add success/error toasts
- `client/src/contexts/ActivitiesContext.jsx` — add group operation toasts
- `client/src/hooks/useSessionDetailMutations.js` — fill missing success/error toasts
- `client/src/components/modals/SettingsModal.jsx` — migrate to `notify`
- `client/src/components/GoalCharacteristicsSettings.jsx` — migrate to `notify`
- `client/src/components/modals/GoalModal.jsx` — migrate to `notify`
- `client/src/pages/Programs.jsx` — add success toasts for create/delete
- Wherever `createFractal`/`deleteFractal` is called — add toasts
- `services/events.py` — add missing constants
- `services/template_service.py` — emit delete event
- `services/programs.py` — emit block create/update, day schedule/unschedule events
- `services/note_service.py` — emit note CRUD events
- `services/event_logger.py` — add descriptions for new events

### Not changed
- `client/src/main.jsx` — Toaster config is fine
- `client/src/utils/api/core.js` — auth events are fine
- Frontend custom event system — no new events needed; TanStack Query handles cross-component freshness
