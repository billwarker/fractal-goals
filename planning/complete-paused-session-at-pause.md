# Complete a paused session at its pause time

## Context

If someone pauses a session and never comes back to resume it, hitting **Complete** later (hours or days on) stamps `session_end` with the click time. The session then shows a huge wall-clock span, and every paused activity or circuit gets a stop time far in the future. What we want:

- **Complete while paused**: the session ends at the moment it was paused (`last_paused_at`). Everything still open (paused activity timer, paused circuit run) is closed at that same moment.
- **Resume, then Complete**: no change. The session ends at the click time.

## Grade of the current implementation: **B-**

| Area | Grade | Notes |
|---|---|---|
| Data model | A | `sessions.is_paused / last_paused_at / total_paused_seconds` already record the pause boundary. No migration needed. |
| Duration math | B+ | `_finalize_paused_session_duration` ([services/_session_updates.py:23](services/_session_updates.py#L23)) correctly folds the open pause into `total_paused_seconds`, so the active duration is right even today. |
| Boundary semantics | D | `session_end`, activity `time_stop` and circuit `time_stop` all use "now" (or the time the client sent), so a session that was abandoned while paused appears to have run until the click. |
| Authority | C | The client chooses `session_end` ([client/src/hooks/useSessionCompletion.js:23](client/src/hooks/useSessionCompletion.js#L23)), so the server can't enforce the rule, and clock skew leaks into the data. |
| UX | C | Nothing tells the user what end time Complete will record while paused. |
| Tests | B | Paused completion is covered ([tests/unit/services/test_session_service.py:330](tests/unit/services/test_session_service.py#L330)), but only for the current "now" semantics. |

## S+ plan

### 1. Server: one completion boundary, owned by the server
In `update_session` ([services/_session_updates.py:129](services/_session_updates.py#L129)), when `data['completed']` is true:

- Add `_completion_boundary(session, now)`, a small static helper next to `_finalize_paused_session_duration`:
  - If the session is not quick, `is_paused` is true and `last_paused_at` is set, return `max(last_paused_at, session_start)` as tz-aware UTC (via `_as_utc_datetime`). The clamp stops a later-edited start from producing a negative span.
  - Otherwise return `now`.
- Use that boundary (call it `completion_time`) everywhere the block currently uses `now`:
  - `finalize_circuit_run(..., circuit_completion_time)`: a paused run's `finish_circuit_clock` then adds 0 extra paused seconds and stops at the pause.
  - `WorkIntervalService.close_open(ended_at=...)`: this is a no-op while paused, but stays consistent.
  - The activity-instance loop: a paused instance gets `time_stop = boundary`, so its extra paused duration is 0.
- **Session end**: when completing a paused session, set `session.session_end = boundary` and **ignore any client-supplied `session_end`** in that same request. The pause boundary is authoritative. A paused session can't also be "ended later", and this also protects old cached clients that still send "now". Implementation: compute a `paused_completion` flag before the `'session_end' in data` block and skip that block when it's set.
- **`completed_at` stays as the real click time.** It's the audit record of when the user acted, and `session_end` is the user-facing end time. (If you'd rather `completed_at` equal the pause time too, change this line before approving.)
- `_finalize_paused_session_duration` needs no logic change. With `completion_time == last_paused_at` it adds 0 paused seconds, clears the pause flags and computes `total_duration_seconds = (pause − start) − prior pauses`.

The "resume, then complete" path doesn't change: `is_paused` is false, so the boundary is `now`.

### 2. Client: stop sending `session_end` on completion
- [client/src/hooks/useSessionCompletion.js:23](client/src/hooks/useSessionCompletion.js#L23): remove `updatePayload.session_end = new Date().toISOString()`. The server already defaults `session_end` to the completion time when it's absent, so the server owns the boundary in both cases and there's no client clock skew.
- The success toast reads the end time from the response. If the session was paused, show `Session completed — ended at {h:mm A} when paused` (format with the existing date utils and the root's timezone). Otherwise keep `Session completed!`.

### 3. UX: say what will happen before the click
- [client/src/hooks/useSessionSidePaneViewModel.js](client/src/hooks/useSessionSidePaneViewModel.js): expose `isPaused` and `pausedAt` (using `getSessionPauseState` from `useSessionDuration.js`).
- [client/src/components/sessionDetail/SessionSidePane.jsx:63](client/src/components/sessionDetail/SessionSidePane.jsx#L63): pass them to `SessionCompletionButton`. While paused (and not completed), set its `title` to "Ends the session at {time}, when it was paused. Resume first to keep timing." Add a small muted caption under the actions row with the same message, "Will end at 4:53 PM (paused)", styled with existing tokens in the side-pane CSS module.
- The quick-session workspace is untouched, because quick sessions can't be paused.

### 4. Tests
**Backend** ([tests/unit/services/test_session_service.py](tests/unit/services/test_session_service.py), [tests/integration/test_sessions_api.py](tests/integration/test_sessions_api.py)):
- Update `test_update_session_completion_excludes_paused_time`. Expect `session_end == last_paused_at` (20 min after start, even though the client sent 30), `total_paused_seconds == 5 min` and `total_duration_seconds == 15 min`.
- New test: a paused session completed with no `session_end` gives `session_end == last_paused_at` and `completed_at ≈ now`.
- New test: the pause → resume → complete flow gives `session_end ≈ now`, so behaviour is unchanged.
- New integration test: start an activity, pause the session, complete it. The activity's `time_stop == pause time` and its `duration_seconds` leaves out the post-pause gap. Do the same for a paused circuit run (`time_stop` and `duration_seconds`).
- Edge test: `last_paused_at < session_start` gives `session_end == session_start` and duration 0, with no negatives.

**Frontend** ([client/src/hooks/__tests__/useSessionCompletion.test.jsx](client/src/hooks/__tests__/useSessionCompletion.test.jsx)):
- The payload is `{ completed: true }` with no `session_end`.
- A paused session shows the "ended at … when paused" toast.

### 5. Docs
Add one sentence to the Sessions section of `index.md`: "Completing a paused session ends it at the pause boundary (`last_paused_at`); open activity timers and circuit runs close there too."

## Out of scope (noted)
- Reopening a session that was completed while paused counts the gap between `session_end` and reopening as active time once the live timer resumes. This already happens for every reopened session and isn't made worse here.

## Critical files
- `services/_session_updates.py`: boundary helper and its use in `update_session`
- `client/src/hooks/useSessionCompletion.js`: drop `session_end` and add the paused toast
- `client/src/hooks/useSessionSidePaneViewModel.js`, `client/src/components/sessionDetail/SessionSidePane.jsx` (+ CSS module): paused hint
- Tests listed above, plus `index.md`

## Verification
1. `./run-tests.sh`, or `pytest tests/unit/services/test_session_service.py tests/integration/test_sessions_api.py tests/integration/test_timers_api.py tests/integration/test_circuits_api.py`
2. `cd client && npx vitest run src/hooks/__tests__/useSessionCompletion.test.jsx`
3. Manual check in the app. Start a session, run a circuit, pause, wait a couple of minutes, then click Complete. The side pane shows the end time as the pause time, the duration doesn't include the wait, and the toast says "ended at … when paused". Repeat with pause → resume → complete and check the end time is the click time.
4. After approval, save this plan to `planning/complete-paused-session-at-pause.md`.
