# Offline-Resilient Sessions — Plan

## Context

At the gym, a session is usually started with good signal, then continued somewhere with poor or no wifi. Today the app degrades badly there: writes hang for the 20 s axios timeout, React Query retries once, and the change is lost with an error toast (or rolled back). The goal: **once a session is open, everything you do in it keeps working with no connection** — changes save on the device, the UI updates instantly, and everything syncs, in order and with correct timestamps, when signal returns. Reloading or reopening the tab in a dead zone should also work.

Decisions made with you:
- **Scope:** in-session write queue **plus** offline reload (service worker + persisted session cache).
- **New sessions:** must be *started* with signal; everything after start works offline.

---

## Grade of the current codebase against this goal: **D**

| Area | Grade | Why |
|---|---|---|
| Data-layer architecture | **A-** | All remote state in TanStack Query ([ADR 0002](docs/architecture/ADR_0002_REACT_QUERY_CANONICAL_DATA_LAYER.md)); writes funnel through a few API modules; optimistic helpers exist ([optimisticQuery.js](client/src/utils/optimisticQuery.js)). This makes a single choke point for queueing easy. |
| Client-generated IDs | **B** | String UUID PKs everywhere. `add_activity_to_session` already accepts `instance_id` ([session_activity_service.py:237](services/session_activity_service.py#L237)); `start_activity_timer` already creates an instance on an unknown client ID. Circuit runs/rounds and notes still mint IDs on the server. |
| Write durability | **F** | [autoSaveQueue.js](client/src/utils/autoSaveQueue.js) coalesces writes but lives in memory only; a failure resolves `{error}` and drops the write, and the instance queue rolls back the optimistic edit ([useSessionDetailMutations.js:383-399](client/src/hooks/useSessionDetailMutations.js#L383-L399)). A reload loses everything pending. |
| Timestamp correctness | **F (for replay)** | Timer start/complete/pause/resume stamp `_utc_now_naive()` at request arrival ([timer_service.py:25](services/timer_service.py#L25)). A replayed "complete" would record the moment signal returned, not when you tapped. |
| Retry safety | **F** | No idempotency keys on any session/timer/circuit write. A request that reached the server but lost its response would be duplicated on retry. |
| Flaky-network auth | **D** | **Existing bug:** if `/auth/refresh` fails with a *network* error, [core.js](client/src/utils/api/core.js) still calls `dispatchSessionExpired({reason:'refresh_failed'})`. Bad gym wifi at token-expiry time can log you out mid-session. Access token is memory-only, so an offline reload can't authenticate. |
| Offline shell / connectivity | **F** | No service worker, no manifest, no `navigator.onLine` / `onlineManager` wiring. |
| UX feedback | **D** | Per-action success/error toasts; no "saved on device / syncing / synced" state. |

---

## Target design (S+)

### Principles
1. **Device-first writes inside a session.** Every in-session action is applied to the query cache immediately and persisted to a durable IndexedDB **outbox** *before* any network call. The network only ever *confirms*.
2. **Every op is replay-safe.** Client-minted IDs, an `Idempotency-Key` per op, and the user's actual action time (`occurred_at`).
3. **Network failure is never a logout and never a rollback.** Only a definitive server rejection (4xx) rolls back, and it gets surfaced for review instead of disappearing.
4. **One sync status, not a toast storm.**

### Architecture

```
UI action ─► session mutation hook ─► optimistic cache patch (instant)
                                   └► outbox.submit(op)  ──► IndexedDB (durable)
                                                    │
                connectivity / online event ────────┤
                                                    ▼
                          flusher (1 tab via Web Locks, FIFO per session)
                                                    │  Idempotency-Key, occurred_at
                                                    ▼
                                             Flask API (idempotent)
                                                    │
                     ack ─► apply server response to cache ─► drop op
                     4xx ─► mark rejected, roll back that op, show in Review
                     network/5xx/408/429 ─► keep, exponential backoff
          queue drained for session ─► one batched invalidation of session keys
```

---

## Phase 1 — Server foundations (backward compatible, ships first)

**1a. Idempotency layer**
- New model + Alembic migration `idempotency_records`: `(user_id, key)` unique, `method`, `path`, `request_hash`, `status` (`in_progress|done`), `response_status`, `response_body` (JSON), `created_at`. Index on `created_at` for cleanup.
- `@idempotent` decorator in [blueprints/api_utils.py](blueprints/api_utils.py): reads `Idempotency-Key`. No header means current behaviour (fully backward compatible). First sight: insert `in_progress`, run the handler, store the response. Replay with the same hash returns the stored response. Same key with a different hash returns 422. Concurrent `in_progress` returns 409 `idempotency_in_flight`, which the client treats as retryable.
- Apply to every in-session write: session update / pause / resume / complete, add / remove activity, activity-instance update / metrics / start / complete, circuit run create / start / complete / timing / rounds / member metrics / tags, note create / update / delete, session goal links, activity-instance goal links.
- Cleanup: purge records older than 14 days (hook into the existing scheduled maintenance, or lazily on insert).

**1b. Client action time (`occurred_at`)**
- Add `resolve_occurred_at(data, session, floor=None)` in `services/timer_service.py` (shared with `circuit_run_timing_operations.py` and `session_lifecycle_service.py`):
  - Parse ISO UTC from the body. If missing, fall back to server now (today's behaviour).
  - Clamp to `[max(session.session_start, latest interval boundary for that session), server_now]`. Small future skew clamps to now. If the time is older than 24 h, reject 400 (stale-queue guard).
- Replace `_utc_now_naive()` in start / complete / pause / resume, circuit start / complete, and session complete with the resolved time. Monotonic clamping against `WorkIntervalService` boundaries keeps intervals valid when ops replay in order.
- The completed-while-paused rule ([index.md](index.md) "ends at the pause boundary") is unchanged and still wins.

**1c. Client-generated IDs everywhere in-session**
- Accept an optional client `id` (validated UUIDv4) on circuit run create, circuit round add, and note create, following the `instance_id` precedent. If the ID exists and is owned by the same user with the same parent, treat the request as idempotent success. Any other collision returns 409.

## Phase 2 — Connectivity + auth hardening (client)

- **Fix the logout bug** in [core.js](client/src/utils/api/core.js): if the refresh fails *without* `error.response` (network / timeout), don't `clearAccessToken`, don't dispatch `auth:session_expired`, and reject with a typed `OfflineError`. Only a real 401/403 from refresh expires the session.
- `client/src/offline/connectivity.js`: combines `navigator.onLine`, `online`/`offline` events, request outcomes (network failure means likely offline; any success means online), and a cheap `GET /api/health` probe with backoff while offline. Wire into TanStack's `onlineManager.setEventListener` so queries pause and resume correctly.
- In [main.jsx](client/src/main.jsx) QueryClient: `networkMode: 'offlineFirst'` for queries. Mutations go through the outbox, so React Query never drops them.
- Lower the effective timeout for in-session writes (≈8 s) so a dead connection is detected quickly. The op stays queued, so a short timeout is safe.

## Phase 3 — Outbox engine + session migration (client core)

**`client/src/offline/` (new module)**
- `outboxStore.js`: IndexedDB via `idb` (~1 KB). Store `ops` keyed by `opId`, indexed by `[sessionId, seq]`. Op shape: `{opId, idempotencyKey, userId, rootId, sessionId, kind, method, url, body, occurredAt, coalesceKey?, seq, attempts, nextAttemptAt, state: 'pending'|'inflight'|'rejected', error?}`.
- `outbox.js`: `submit(op)` returns a promise that settles on ack or rejection.
  - **Coalescing:** a pending (not in-flight) op with the same `coalesceKey` gets its body replaced instead of a new op appended. This is the durable successor to `autoSaveQueue`'s "latest value wins" for session-data drafts and per-instance metric/set edits.
  - **Ordering:** strict FIFO per session, which naturally satisfies dependencies (create instance before its metrics). If a create is rejected, its dependent ops (same entity ID) are rejected too.
  - **Retry:** network / 5xx / 408 / 429 / `idempotency_in_flight` retry with exponential backoff and jitter. Other 4xx mark the op `rejected`. An auth `OfflineError` pauses the queue until `auth:token_refreshed`.
  - **Single flusher across tabs:** `navigator.locks.request('fractal-outbox')`, with a `BroadcastChannel('fractal-outbox')` to share state and acks between tabs.
  - **Triggers:** connectivity → online, `visibilitychange` → visible, the `auth:token_refreshed` event, and a timer while ops are pending.
- `useOutboxStatus(sessionId)`: `{pending, syncing, rejected[], lastSyncedAt}` via `useSyncExternalStore`.
- **Cache reconciliation:** while a session has pending ops, defer that session's query invalidations (collect them in a set). On drain, run one batched invalidation. This prevents a background refetch from overwriting optimistic state mid-queue. If a refetch does land (e.g. on mount), re-apply pending ops' optimistic patches via a registered `applyOptimistic(kind, body)` per op kind.

**Migrate session writes** (pattern: mint ID / time on the client, patch the cache, `outbox.submit`):
- [useSessionDetailMutations.js](client/src/hooks/useSessionDetailMutations.js):
  - `addActivity` / `duplicateActivityInstance`: `crypto.randomUUID()` for `instance_id`. Insert a placeholder instance (built from the cached activity definition) into `sessionActivitiesKey`, and update the section draft at the same time instead of after the server responds.
  - `updateInstance`: instance queues submit with `coalesceKey: instance:<id>:<field>`. Remove rollback-on-network-error; roll back only on `rejected`.
  - `updateTimer` start / complete / reset and `pause` / `resume`: compute `occurredAt = new Date().toISOString()` and patch `time_start` / `time_stop` / `is_paused` / `last_paused_at` locally (mirroring the server's interval rules for the common cases), then submit.
  - `removeActivity`: optimistic removal plus a queued delete.
- [useSessionDraftAutosave.js](client/src/hooks/useSessionDraftAutosave.js): `save` submits `coalesceKey: session:<id>:data`.
- Circuits ([useCircuitQueries.js](client/src/hooks/useCircuitQueries.js), [circuitQueryCache.js](client/src/hooks/circuitQueryCache.js)) and session notes ([useSessionDetailNotes.js](client/src/hooks/useSessionDetailNotes.js), [useSessionNotes.js](client/src/hooks/useSessionNotes.js)) follow the same pattern.
- **Session complete** ([useSessionCompletion.js](client/src/hooks/useSessionCompletion.js)) is queued with `occurred_at`. The UI shows "Completed · syncing". Achievements and celebrations fire when it is acked, because they depend on the server's response.
- **Needs connection (gated, not queued):** creating goals, templates, or sessions, analytics, and the previous-values lookup when it isn't cached. These are disabled while offline with a "Needs connection" tooltip.

**Sync UX**
- `SessionSyncIndicator` in the session header, reusing the slot that shows `autoSaveStatus` today. It cycles through these states: `Offline · 5 changes saved on this device` → `Syncing 3…` → `All changes synced`, plus a persistent `1 change couldn't sync — Review`.
- A review sheet lists each rejected op in plain language ("Set 3 of Bench Press — session was already completed on another device"), with Discard and Retry.
- While offline, suppress per-action success toasts ("Activity added", "Session paused"); the indicator replaces them.
- Logging out with pending ops shows a confirm dialog ("5 changes haven't synced yet").

## Phase 4 — Offline reload (PWA shell + persisted cache + offline boot)

- **Service worker:** `vite-plugin-pwa` (Workbox `generateSW`) in [vite.config.js](client/vite.config.js). It precaches built JS/CSS/fonts/icons, uses a navigation fallback to `index.html` for app routes (excluding the public landing / marketing host), and is **NetworkOnly for `/api/*`**. API data is never stored in CacheStorage; persistence is handled by Query, scoped per user. `registerType: 'prompt'`, and the update prompt never appears while a session has pending ops. Add a `manifest.webmanifest` too ("Add to Home Screen" is a bonus for gym use).
- **Persisted query cache:** `@tanstack/react-query-persist-client` with an IndexedDB async persister. `shouldDehydrateQuery` is limited to the active / recently opened session keys (session, activities, circuit runs, notes, goals view) plus the activity definitions and groups needed to add activities. `maxAge` is 48 h, and `buster` is `${buildId}:${userId}`. Cleared on logout and on user switch.
- **Offline auth boot** ([AuthContext.jsx](client/src/contexts/AuthContext.jsx)): on boot, if refresh fails with an `OfflineError` and a persisted minimal user snapshot (id, name, timezone) exists for the last signed-in user, boot into **offline mode**. Cached sessions render and the outbox stays paused until refresh succeeds. If there's no snapshot, show an "You're offline — connect to sign in" screen instead of the login form.
- [lazyWithRetry.js](client/src/utils/lazyWithRetry.js) already retries chunk loads. With precaching, session routes load offline.

## Phase 5 — Verification & docs

**Automated**
- Vitest (`fake-indexeddb`): coalescing, FIFO per session, cascade rejection, backoff schedule, pause and resume on auth events, cross-tab lock (mock `navigator.locks`), the deferred-invalidation and re-apply-on-refetch logic, and `OfflineError` handling in `core.js` (refresh network failure does **not** dispatch `auth:session_expired`).
- Pytest integration:
  - `tests/integration/test_idempotency.py`: replay returns the identical response, different body returns 422, concurrent returns 409, and there is no duplicate instance, round, or note.
  - `tests/integration/test_offline_replay_timing.py`: complete with `occurred_at` 10 min ago stores the earlier time; clamping to session start, to the prior interval boundary, and to server now; older than 24 h is rejected; completing while paused still ends at the pause boundary.
  - Client-ID collision tests for circuit runs, rounds, and notes.
- Playwright `client/e2e/offline-session.spec.js`: start a session online, then `context.setOffline(true)`; add an activity, log sets, start and complete a timer, add a note, pause, then **reload while offline** and confirm the page and state render from the persisted cache. Go back online, wait for "All changes synced", and assert through the API that there are no duplicates and the timer times match the tap times within ±2 s.
- `npm run lint`, `npm run typecheck`, `npm run test:run`, `./run-tests.sh`.

**Manual**
- Chrome DevTools → Network "Offline" and "Slow 3G" during a real session. Also test on a phone with Airplane mode toggled mid-session, including backgrounding the tab.

**Docs**
- New ADR `docs/architecture/ADR_00xx_OFFLINE_SESSION_OUTBOX.md`: the outbox, idempotency, `occurred_at` trust rules, and what is gated vs queued.
- Update [index.md](index.md) (Sessions section and the data-layer rule: "in-session writes go through the outbox"), and save this plan to `planning/offline-session-resilience-2026-10.md`.

---

## Rollout order (each a mergeable PR)
1. Phase 1 server (inert until clients send headers / fields).
2. Phase 2 auth bug fix + connectivity (immediate win even before the outbox).
3. Phase 3 outbox + migration, behind feature flag `offline_session_outbox` (uses the existing [useFeatureFlags.js](client/src/hooks/useFeatureFlags.js)).
4. Phase 4 PWA + persistence + offline boot.
5. Remove the flag after a week of your own gym use and telemetry (op replay counts, rejection reasons via the existing telemetry API).

## Why this is S+
- **Correctness:** nothing is lost, duplicated, or mis-timed. These are the three failure modes of naive offline queues, each closed by the outbox, idempotency, and `occurred_at`.
- **Usability:** the app feels *faster* online too, because writes become optimistic-first. Status is one calm indicator, and failures are reviewable rather than silent.
- **Engineering:** the outbox is the only new layer, and it plugs into the existing Query-centric architecture without per-component changes. The server changes are backward compatible. Every risky path has an automated test, including a real offline reload in Playwright.

---

## Implementation notes (2026-10-13)

Shipped on for all signed-in users; the planned `offline_session_outbox` rollout flag was dropped
at review (2026-10-13). Differences from the plan above:

- **No client IDs for circuit runs and rounds.** A run created offline would also need IDs for
  every slot and member it creates, so the client could edit them before sync. Adding a circuit or
  a round therefore needs a connection; `Idempotency-Key` already prevents duplicate creates.
  Circuit start, complete, reset, delete and member results are queued.
- **Request-only schemas.** `occurred_at` and the client note `id` live on
  `SessionUpdateRequestSchema` and `NoteCreateRequestSchema`, which only the HTTP routes use, so
  the AI-agent proposal contract is unchanged.
- **Maintainability gate.** The note-ID collision check sits in `notes_api.py`, so
  `note_service.py` stays at its line cap; the idempotency decorator adds no broad `except`
  handlers.
- **Gating.** Actions that are not queued show "You're offline. This change needs a connection"
  through the shared `formatError`, instead of a per-button tooltip.
- **Flask also serves the shell files.** `/sw.js`, `/manifest.webmanifest`, `/workbox-*`,
  `/favicon.svg` and `/index.html` are served by `blueprints/pages.py` (used by browser tests).
  nginx gives `sw.js` and the manifest `no-cache`.
- **Signed out with no snapshot.** The app shows the normal login page; login then fails with
  the friendly offline message.
- **Not yet done:** outbox telemetry (replay counts, rejection reasons).

Verification: backend integration tests (`test_idempotency.py`, `test_offline_replay_timing.py`,
`test_offline_client_ids.py`), client unit tests under `src/offline/__tests__` and
`useOfflineSessionWrites`, and `client/e2e/offline-session.spec.js`. The e2e spec covers an
offline timer start and complete, an offline reload, and sync on reconnect with server
timestamps within 3 s of the taps, on desktop and mobile.
