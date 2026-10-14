# ADR 0004: Device-First Writes For Open Sessions

## Status

Accepted

## Date

October 13, 2026

## Context

Sessions are logged in gyms, where signal often drops partway through. Before this change a
write made without signal hung for the 20 s request timeout, then failed and either rolled back
or was lost; a reload with no signal could not open the app at all. A network failure during
token refresh also signed the user out.

## Decision

Once a session is open, in-session writes are **device-first**:

1. The mutation hook patches the TanStack Query cache immediately.
2. It persists an op to a per-user IndexedDB **outbox** (`client/src/offline/outbox.js`) before
   any network call.
3. One tab at a time (Web Locks) sends ops strictly in submission order, each with an
   `Idempotency-Key` and, for timing actions, the user's action time as `occurred_at`.

Supporting rules:

- **Idempotency.** `@idempotent` (`blueprints/idempotency.py`) claims a key per user and stores
  the first 2xx response, which later retries receive as-is. A non-2xx response frees the key.
  A key reused with a different body returns 422; a concurrent duplicate returns 409
  `idempotency_in_flight`, which the client retries.
- **Action time.** `services/occurred_at.py` accepts `occurred_at` on timer, pause/resume,
  circuit start/complete, and session completion. The value is clamped to no earlier than the
  session's latest timing boundary and no later than server time. Values older than 24 h are
  rejected. Without `occurred_at`, server time is used as before. The rule that completing a
  paused session ends it at the pause still applies.
- **Client IDs.** Activity instances, session notes and quick sessions created offline use
  client-generated UUIDs, so later queued writes can reference them. A rejected create also
  rejects every queued op that touches the same record.
- **Deterministic circuit IDs.** One "add circuit" expands into slots, rounds, members and their
  sets or instances. The client mints only the run (or added round) ID; `services/circuit_ids.py`
  derives every child ID from it with UUIDv5, and `client/src/offline/circuitIds.js` derives the
  same IDs, so members created offline can be edited before sync. Shared vectors in
  `tests/fixtures/circuit_id_vectors.json` keep the two implementations identical.
- **Failures.** Network errors, 5xx, 408 and 429 keep the op and retry with backoff. Other 4xx
  responses mark it *rejected* and roll back only that op; the sync indicator lists it for Retry
  or Discard.
  - **Retry ceiling:** a failure the server *answered* counts toward a ceiling (8 attempts or
    24 h), after which the op is rejected with `retry_exhausted`. Offline (no response) never
    exhausts.
  - **Expiry:** rejected ops expire after 7 days.
  - **Auth:** a network failure never signs the user out.
- **Replays.** Creates with client IDs are idempotent beyond the idempotency record: a matching
  existing row returns 200.
- **Supersede.** Deletes supersede queued edits to the same record, and a create followed by a
  delete offline sends nothing.
- **Ordering.** `seq` is assigned inside the cross-tab lock.
- **Reconciliation.** Each op kind registers its optimistic patch with the outbox
  (`offline/sessionOpHandlers.js`).
  - **When it applies:** only after the op is durable ("shown means saved"), and again whenever
    server data lands while the op is still queued.
  - **On confirmation:** the server's copy replaces the patch only if nothing newer is queued
    for that record. The session's query keys are invalidated once, when its queue drains.
- **Loading.** The engine (`offline/engine.js`) loads on demand. Hooks import only
  `offline/opKinds.js`, so no route's initial bundle carries it.
- **Server contract.** `offline/serverContract.json` is recorded from real responses by
  `tests/integration/test_offline_contract.py`.
  - Placeholders must match it exactly, and patches write only its fields.
  - Its hash, computed at build time, versions the persisted query cache.
- **What is queued and what is not.**
  - Queued: activity add/remove/values, timers, pause/resume, session layout and completion,
    session notes, every circuit action (add, rounds, timing, results, cascade, tags), and
    quick-session completion.
  - Not queued: everything else (goals, templates, circuit definitions, analytics). These wait for
    the queue to drain and need a connection; offline errors say so.
- **Quick sessions.** A draft with entered values is kept in IndexedDB per user and fractal, so a
  reload or an accidental close can resume it from Create Session.
- **Clock skew.** The client keeps a median offset from response `Date` headers and corrects
  `occurred_at` when sending. The server accepts action times up to 7 days old.
- **Kill switch.** The admin flag `offline_service_worker_disabled` unregisters the service
  worker and clears its caches on every device at next load. A failed flag load never triggers it.
- **Opening the app offline.** `vite-plugin-pwa` precaches the app shell; `/api/*` is never
  cached by the service worker. Queries the open session needs are persisted per user in
  IndexedDB for up to 48 h (`offline/queryPersistence.js`). With no signal, the app opens from an
  on-device user snapshot; nothing is authorized until the cookie refresh succeeds online.
  Updates wait for a user-initiated reload and are offered only when nothing is waiting to sync.
  Signed out with no signal, an offline screen replaces sign-in and gives way automatically once
  the connection returns.
- **Status.** The session page shows its own sync indicator; every other page shows an app-wide
  one for all queued changes, with the same review list.
- **Health telemetry.** `offline_sync_drained` (op count, maximum queued age, retries),
  `offline_op_rejected` (kind, status, code) and `offline_boot` (seconds offline, recorded on
  reconnect) carry counts and codes only, never content.

## Consequences

- In-session interactions are instant even online; the server stays authoritative.
- Clients may retry any decorated write safely.
- Logout clears the on-device user snapshot and persisted session cache; queued changes stay in
  the user's outbox and sync at their next sign-in on that device.
- New in-session write paths must go through `useOfflineSessionWrites` (or register an op kind)
  rather than calling the API directly.
- Sessions must still be started with signal. Quick sessions are the exception, since they live
  on the device until completion.
- Two devices editing the same session while one is offline are not merged: the server stays
  authoritative, and anything it refuses is listed for review on the device that queued it.
