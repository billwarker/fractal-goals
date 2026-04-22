# Plan: Three Feature Fixes — Activity Creation, Countdown Timer, Progress Delta Toggle

## Context

Three product-quality fixes across the activity and session features:

1. **Activity creation from GoalDetailModal is broken** — The `InlineActivityBuilder` uses a simplified name+unit metric form that doesn't match the real metric selection flow (which uses fractal-level `ActivityMetricsSection` / `fractalMetric` references). UX is also inconsistent with the main activity flow.

2. **Countdown timer mode** — Activity instances only have a stopwatch (count-up). Users want a countdown mode where they set a target duration before starting, and the timer counts down from that target.

3. **Progress delta display toggle** — Instance-to-instance deltas are always shown as percentages. Users want the option to see absolute numbers instead. This should have a root-level default plus per-activity override.

---

## Database Grade

**Current grade: C+**

- No `target_duration_seconds` field on activity instances (countdown target needs to persist per-instance)
- No `delta_display_mode` in `progress_settings` (root or activity level)
- Progress comparison API response already returns both `pct_change` and `delta` fields — that part is fine
- Countdown mode is per-instance UI state (toggle shown next to Start), not a per-activity-definition schema column — no extra column needed on `activity_definitions`

**S+ target:** Add the two missing fields via migrations; expose them cleanly in the API; drive all UI from those persisted settings.

---

## Implementation Plan

### Feature 1 — Fix Activity Creation in GoalDetailModal

**Problem:** `InlineActivityBuilder` is a one-off lightweight form with simplified metric input (name + unit only). It does not use `ActivityMetricsSection` (which selects from fractal-level metrics). Creates metric UX inconsistency and bugs.

**Fix:** Replace `InlineActivityBuilder` with the existing `ActivityBuilderForm` component rendered inside the modal, matching exactly how `ActivityBuilder.jsx` wraps it.

#### Steps

**1a. Create `InlineActivityBuilderModal.jsx` in `client/src/components/goalDetail/`**

- Thin wrapper that renders `ActivityBuilderForm` (from `client/src/components/activityBuilder/ActivityBuilderForm.jsx`) inside a `<div>` styled as a panel (not a `<Modal>`, since we're already inside GoalDetailModal)
- Pass: `rootId`, `activityGroups`, `onSave` (maps to `onSuccess`), `onCancel`
- On save success, call `onSuccess(newActivity)` to trigger auto-association in GoalDetailModal

**1b. Update `GoalDetailModal.jsx`**

- Replace lazy import of `./goalDetail/InlineActivityBuilder` with `./goalDetail/InlineActivityBuilderModal`
- No changes to the `viewState` flow or `attachInlineCreatedActivity` — only the rendered component swaps

**1c. Delete `client/src/components/goalDetail/InlineActivityBuilder.jsx`** (no longer needed)

**Files touched:**
- `client/src/components/goalDetail/InlineActivityBuilder.jsx` — delete
- `client/src/components/goalDetail/InlineActivityBuilderModal.jsx` — create
- `client/src/components/GoalDetailModal.jsx` — update import (~line 27) and rendered component (~line 596-616)

**Reuse:**
- `ActivityBuilderForm` from `client/src/components/activityBuilder/ActivityBuilderForm.jsx`
- `ActivityMetricsSection` is already used by `ActivityBuilderForm` — no direct import needed

---

### Feature 2 — Countdown Timer Mode

**Design:** Per-instance toggle. Next to the Start button, a "Countdown" toggle switches the mode for that instance. When enabled, user enters a target duration (MM:SS input), hits Start, and the display counts down instead of up. At 0: auto-complete + play a completion sound. No changes to activity definitions schema — this is purely per-instance UI state + one persisted field.

#### Backend Steps

**2a. Migration: add `target_duration_seconds` to `activity_instances`**

```sql
ALTER TABLE activity_instances ADD COLUMN target_duration_seconds INTEGER;
```

- File: new Alembic migration in `migrations/versions/`

**2b. Update `ActivityInstance` model**

- `models/activity_instance.py` — add `target_duration_seconds = Column(Integer, nullable=True)`

**2c. Update activity instance serializer**

- `services/serializers.py` — include `target_duration_seconds` in activity instance serialization

**2d. Update timer API to accept `target_duration_seconds` on start**

- `blueprints/timers_api.py` — accept `target_duration_seconds` in the start-timer payload
- Store on the instance when provided

**2e. Update validators**

- `validators.py` — add `target_duration_seconds: Optional[int]` to timer start schema

#### Frontend Steps

**2f. Add countdown toggle + target duration input to `SessionActivityItem`**

- `client/src/components/sessionDetail/SessionActivityItem.jsx`
- Add local state: `countdownMode` (boolean toggle, default false) and `targetDurationInput` (string for MM:SS entry)
- When instance not yet started: show a small "⏱ Countdown" toggle next to the Start button
- When `countdownMode` is on: show a MM:SS duration input before Start
- On Start: if countdown mode, pass `target_duration_seconds` to timer action
- Display logic: when `exercise.target_duration_seconds` is set and timer is running, show countdown (`target - elapsed`) instead of elapsed
- At 0: call `onUpdate('timer_action', 'complete')` automatically + play completion audio

**2g. Completion sound**

- Use the Web Audio API (`AudioContext`) to play a short chime/beep at countdown completion
- No external audio file needed — synthesize a simple tone (e.g., 440 Hz sine wave, 0.5s)
- Encapsulate in a small utility: `client/src/utils/playCompletionSound.js`

**2h. Update `fractalApi.js` timer start call**

- `client/src/utils/fractalApi.js` — pass `target_duration_seconds` in `startActivityTimer` payload if provided

**Files touched:**
- `migrations/versions/<new>.py` — `activity_instances.target_duration_seconds`
- `models/activity_instance.py`
- `services/serializers.py`
- `validators.py`
- `blueprints/timers_api.py`
- `client/src/components/sessionDetail/SessionActivityItem.jsx`
- `client/src/utils/fractalApi.js`
- `client/src/utils/playCompletionSound.js` — new file

---

### Feature 3 — Progress Delta Display Toggle (Absolute vs Percent)

**User choice:** Root-level default + per-activity override.

**Design:** 
- Root `progress_settings` gets a `delta_display_mode` field: `"percent"` (default) or `"absolute"`
- Activity definitions get a `delta_display_mode` field: `null` (inherit from root), `"percent"`, or `"absolute"`
- Frontend reads the effective mode (activity override → root default) and passes to delta formatters

#### Backend Steps

**3a. Migration: add `delta_display_mode` to `activity_definitions`**

```sql
ALTER TABLE activity_definitions ADD COLUMN delta_display_mode VARCHAR(16);
-- null = inherit from root
```

**3b. Update `ActivityDefinition` model**

- `models/activity_definition.py` — add `delta_display_mode = Column(String(16), nullable=True)`

**3c. Update serializers and activity service**

- Include `delta_display_mode` in activity definition serialization
- Accept in create/update

**3d. Root progress_settings**

- No backend schema change needed — `progress_settings` is already a JSON column on the root goal
- Update `services/goal_service.py` or `services/goal_target_rules.py` to accept `delta_display_mode` in `progress_settings` update (currently only `enabled` is documented)

#### Frontend Steps

**3e. Add `delta_display_mode` to `ActivityBuilderForm`**

- `client/src/components/activityBuilder/ActivityBuilderForm.jsx`
- Add a select/radio in the progress tracking section: "Delta display: Inherit from root | Percent | Absolute"
- Include in payload on save

**3f. Add `delta_display_mode` to root settings in `SettingsModal`**

- `client/src/components/modals/SettingsModal.jsx`
- Under the existing "Enable progress comparisons" toggle, add a select: "Show deltas as: Percent | Absolute"
- Reads from `progressSettings.delta_display_mode`; writes via `updateProgressSettings`

**3g. Update `useRootProgressSettings`**

- `client/src/hooks/useRootProgressSettings.js`
- No structural changes — already reads/writes arbitrary fields from `progress_settings` JSON
- Just document the new `delta_display_mode` field in usage

**3h. Create `useEffectiveDeltaDisplayMode` hook**

- `client/src/hooks/useEffectiveDeltaDisplayMode.js`
- Takes `activityDefinition` and `rootProgressSettings`
- Returns `"percent"` | `"absolute"` (resolves override → root default → `"percent"`)

**3i. Update `formatInlineProgressValue` in `SessionActivityItem`**

- `client/src/components/sessionDetail/SessionActivityItem.jsx` (lines 44-60)
- Accept a `displayMode` parameter
- When `displayMode === "absolute"`: use the `delta` branch directly (skip `pct_change` check)
- When `displayMode === "percent"`: use the `pct_change` branch (existing behavior)

**3j. Update `HistoryPanel.jsx` `renderYieldDelta`**

- `client/src/components/sessionDetail/HistoryPanel.jsx` (lines 266-279)
- Accept `displayMode` prop
- When absolute: show `+N` / `-N` instead of percentage formula
- When percent: existing behavior

**3k. Thread `displayMode` through rendering in `SessionActivityItem` and `HistoryPanel`**

- Compute effective mode via `useEffectiveDeltaDisplayMode` near the top of each component
- Pass down to `formatInlineProgressValue`, `renderYieldDelta`, `SummaryDelta`

**Files touched:**
- `migrations/versions/<new>.py` — can combine with Feature 2 migration
- `models/activity_definition.py`
- `services/serializers.py`
- `services/activity_service.py`
- `validators.py`
- `client/src/components/activityBuilder/ActivityBuilderForm.jsx`
- `client/src/components/modals/SettingsModal.jsx`
- `client/src/hooks/useRootProgressSettings.js` (minor, documentation only)
- `client/src/hooks/useEffectiveDeltaDisplayMode.js` — new file
- `client/src/components/sessionDetail/SessionActivityItem.jsx`
- `client/src/components/sessionDetail/HistoryPanel.jsx`

---

## Migration Strategy

Combine Feature 2 and Feature 3 DB changes into a single Alembic migration:

```
migrations/versions/<hash>_add_countdown_and_delta_display_settings.py
```

Columns:
- `activity_definitions.delta_display_mode` — VARCHAR(16) NULLABLE
- `activity_instances.target_duration_seconds` — INTEGER NULLABLE

---

## Verification

### Feature 1 — Activity creation in GoalDetailModal
1. Open a goal's detail modal
2. Navigate to Activities → Create new activity
3. Verify the full ActivityBuilderForm renders (metric selection uses fractal metrics dropdown, not raw name+unit inputs)
4. Create an activity with a metric — confirm it's saved and auto-associated with the goal
5. Verify the existing ManageActivities flow is unchanged

### Feature 2 — Countdown timer
1. In a session, toggle "Countdown" on any activity instance
2. Verify a MM:SS duration input appears
3. Enter a duration, hit Start — verify display shows countdown (decreasing)
4. Let it reach 0 — verify auto-complete fires and a chime plays
5. Verify non-countdown instances (toggle off) still behave as stopwatch
6. Verify `target_duration_seconds` is persisted on the instance after start

### Feature 3 — Delta display toggle
1. Open Settings, set "Show deltas as: Absolute"
2. Complete an activity instance with metrics
3. Verify inline deltas show `+N` / `-N` format instead of `▲N%`
4. Open ActivityBuilder, set per-activity override to "Percent"
5. Verify that activity still shows percent even with root set to absolute
6. Verify HistoryPanel deltas also respect the mode
7. Run `./run-tests.sh frontend` to confirm no regressions
