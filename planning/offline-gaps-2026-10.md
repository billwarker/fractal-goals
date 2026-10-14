# Offline Sessions — Closing the Remaining Gaps

## Context

Offline mode shipped to production on 2026-10-13 and works on a real device. Every in-session action now saves on the phone and syncs later, except a few things that still need signal or behave poorly offline:

1. **Circuits:** adding a circuit or a round needs a connection, and so do removing a round, copying a value to later rounds, and tagging.
2. **Quick sessions:** the draft lives only in React state, so a reload loses the workout even online. Completing one offline fails.
3. **Signed out and offline:** you get the normal login page, and logging in fails with a generic error.
4. **No visibility:** nothing records how often changes are queued, retried, rejected, or how long they waited.
5. **Sign-out warnings:** only the Selection page warns about unsynced changes. The legal-acceptance and password-change dialogs, and "Sign out everywhere", don't.
6. **Download size:** the service worker downloads the admin and landing code that a gym user never needs offline.

You chose full circuit support: adding circuits and rounds both work offline.

---

## Grade of the current codebase against this goal: **B+**

| Area | Grade | Why |
|---|---|---|
| Offline foundation | **A** | Outbox, idempotency, `occurred_at`, persisted cache, service worker and offline boot are all live and covered by tests ([ADR 0004](docs/architecture/ADR_0004_OFFLINE_SESSION_OUTBOX.md)). New gaps plug into existing extension points (`SESSION_OP` kinds, `applyOptimistic`, `@idempotent`). |
| Circuit offline coverage | **D** | Only start, complete, reset, delete and member results are queued. One "add circuit" creates a run, slots, rounds, members, and sets or instances server-side ([circuit_service.py:262](services/circuit_service.py#L262), [`_create_round_occurrences`](services/circuit_service.py#L184)), all with random server IDs, so the phone can't reference them before sync. |
| Quick-session durability | **F** | The draft is component state in [CreateSession.jsx:73](client/src/pages/CreateSession.jsx#L73); a reload loses it. `completeQuickSession` is a direct awaited POST ([CreateSession.jsx:282](client/src/pages/CreateSession.jsx#L282)). |
| Signed-out offline UX | **D** | [AuthContext.jsx](client/src/contexts/AuthContext.jsx) falls back to the device snapshot, but with no snapshot you get the login page and a failed login. |
| Observability | **F** | No outbox telemetry. The pipeline is ready: [telemetry.js](client/src/utils/telemetry.js) `trackEvent`, a server allowlist ([telemetry_service.py:22](services/telemetry_service.py#L22)), and admin usage, which already groups any event name ([admin_usage_service.py:304](services/admin_usage_service.py#L304)). |
| Sign-out safety | **C** | `useGuardedLogout` ([OutboxContext.jsx](client/src/offline/OutboxContext.jsx)) exists but is used on one page only. |
| Precache budget | **B** | About 3.5 MB uncompressed (~1 MB gzipped) in 254 entries, including Admin, Landing and Legal. |

---

## Target design (S+)

### A. Circuits fully offline, using deterministic IDs

**Core idea:** the phone mints only the run ID (or the round ID). The server derives every child ID from it with **UUIDv5**, and the phone derives the same IDs locally. Queued edits can target any slot, member, set or instance before sync, with no request carrying dozens of IDs and no ID-mapping layer.

Derivation (one shared spec, mirrored on both sides):

| Record | ID |
|---|---|
| Run slot | `uuid5(run_id, "slot:" + source_slot_id)` |
| Slot instance (set-based activity) | `uuid5(run_id, "slot-instance:" + source_slot_id)` |
| Initial round *n* | `uuid5(run_id, "round:" + n)` |
| Added round | client `round_id` |
| Round member | `uuid5(round_id, "member:" + run_slot_id)` |
| Member set | `uuid5(round_id, "set:" + run_slot_id)` |
| Member instance | `uuid5(round_id, "instance:" + run_slot_id)` |

**Server**
- New `services/circuit_ids.py`: the derivation functions, used by `create_run` and `_create_round_occurrences` whenever a client ID is supplied. Without one, behaviour is unchanged (random IDs).
- `CircuitRunCreateSchema` gains optional `id` and `add_round` gains optional `round_id` (UUID-validated, HTTP-only request schemas as before). An existing ID returns 409; a replay is answered by `@idempotent`.

**Client**
- `offline/uuidv5.js`, using `crypto.subtle` SHA-1. **Parity test vectors are shared** between Vitest and pytest, so both sides provably produce the same IDs.
- `offline/circuitOps.js` (pure):
  - `buildPlaceholderRun(definition, activities, runId)` builds the same shape as `serialize_circuit_run`, including `activity_schema` from the cached activity definition.
  - `buildPlaceholderRound(run, roundId, roundNumber)`.
  - Patches for remove-round, cascade a metric to later rounds, and run/round tag add/remove.
- New op kinds in [sessionOpHandlers.js](client/src/offline/sessionOpHandlers.js): `CIRCUIT_CREATE`, `CIRCUIT_ROUND_ADD`, `CIRCUIT_ROUND_REMOVE`, `CIRCUIT_CASCADE`, `CIRCUIT_TAG`.
  - Creates carry `creates: [runId, ...derivedIds]`, so a rejected create cascades to its dependents.
  - The session draft gains a `{type: 'circuit', circuit_run_id}` item, the same way activity adds work.
- [useCircuitQueries.js](client/src/hooks/useCircuitQueries.js):
  - `useOfflineCircuitActions` queues every action. The "needs a connection" fallback goes away for circuits.
  - `useCreateCircuitRun` gains the same offline path.
- Persist the `circuits` query (definitions) in [queryPersistence.js](client/src/offline/queryPersistence.js), so circuits can be added offline after a reload.

### B. Quick sessions survive reloads and complete offline

- **Durable draft:** `offline/quickSessionDraft.js` saves the draft to IndexedDB per user and fractal (via [idbKeyValue.js](client/src/offline/idbKeyValue.js)), debounced on every change. [CreateSession.jsx](client/src/pages/CreateSession.jsx) restores it on mount and offers "Resume your quick session (started 7:42)". It is cleared on completion or discard.
- **Offline completion:**
  - `completeQueuedQuickSession` submits a `QUICK_SESSION_COMPLETE` outbox op with a client session `id`. The server accepts an optional `id` on `quick-complete`, following the note pattern.
  - The completed session is inserted optimistically into the session-list caches, and the modal closes with "Saved on this device. It will sync when you're back online."
- Persist `session-templates` too, so a quick session can be started from a template offline.

### C. App-wide sync status (needed by B, useful everywhere)

- A small `GlobalSyncChip` in the nav header shows "N changes waiting to sync" or "Offline" whenever ops are pending and you're **not** on the session page (which has its own indicator). Tapping it opens the same review list used on the session page.
- `SessionSyncIndicator`'s review list becomes a shared component.

### D. Signed out and offline

- In [AppRouter.jsx](client/src/AppRouter.jsx): when unauthenticated, loading has finished, and connectivity reports offline, render `OfflineSignInScreen` instead of the landing/login page. It says "You're offline. Connect to sign in," then retries automatically and returns to normal once online.
- The login form disables submit while offline and shows the same message, instead of failing.

### E. Outbox telemetry

- Allowlist three events in [telemetry_service.py](services/telemetry_service.py):
  - `offline_sync_drained`: ops count, max queued age in seconds, retry count.
  - `offline_op_rejected`: kind, HTTP status, error code. No content.
  - `offline_boot`: whether opened from the device snapshot.
- Emit them from the outbox through `trackEvent` ([telemetry.js](client/src/utils/telemetry.js)), which already batches, honours Do Not Track and never throws. The admin usage page shows them automatically.

### F. Every sign-out path warns

- Use `useGuardedLogout` in [LegalAcceptanceModal.jsx](client/src/components/modals/LegalAcceptanceModal.jsx) and [ForcePasswordChangeModal.jsx](client/src/components/modals/ForcePasswordChangeModal.jsx).
- Add the same guard to "Sign out everywhere" in [useAccountSettings.js](client/src/hooks/useAccountSettings.js).

### G. Leaner precache

- In [vite.config.js](client/vite.config.js), set `globIgnores` for Admin, Landing*, Legal and ResetPassword chunks.
- Add a Workbox `CacheFirst` runtime route for `/assets/*` (hashed, immutable), so any chunk you've opened is also available offline.

### Deliberately not doing
- **Two devices editing the same session while one is offline:** the server stays authoritative, and anything it refuses is shown for review. Merging would need server-side versioning across every record, which is out of proportion for a single-user gym scenario. Documented in ADR 0004.
- **Automatic persisted-cache versioning:** tying it to the build would wipe a session's offline data on every deploy. It stays a manual constant next to the persisted query list.
- **Your local database's missing `users` primary key:** this is local drift, not product work. I can give you a one-off SQL fix separately.

---

## Phases (each a mergeable PR)
1. **F + E + G:** small and low-risk; ships immediate visibility into how offline sync behaves.
2. **B + C:** quick sessions and the app-wide sync chip.
3. **A:** deterministic circuit IDs (server first, harmless until used), then the client ops.
4. **D:** the signed-out offline screen.

## Verification
- **pytest:**
  - `test_circuit_ids.py`: derivation is stable; client-supplied IDs give the expected child IDs; a collision returns 409; omitting the ID keeps random IDs.
  - Quick-complete with a client `id`, plus its idempotent replay.
  - The new telemetry event names are accepted.
- **Vitest:**
  - `uuidv5` matches the shared vectors.
  - Circuit placeholder shapes match a recorded `serialize_circuit_run` fixture.
  - Each new op kind patches, re-applies after a refetch, and reconciles on ack.
  - The quick draft round-trips through IndexedDB.
  - `GlobalSyncChip` and `OfflineSignInScreen` states.
  - Every logout path warns when ops are pending.
- **Playwright**, extending [offline-session.spec.js](client/e2e/offline-session.spec.js):
  - Offline: add a circuit, add a round, log member results, reload offline, reconnect. The server's run/round/member IDs equal the phone's.
  - Start and complete a quick session offline; it appears in Sessions after reconnect.
  - Signed out and offline shows the offline screen and recovers on reconnect.
- **Suites:** the full backend, client and browser suites (currently 30/30 green), plus a real-phone check with airplane mode.
- **Docs:** update ADR 0004 and [index.md](index.md), and save this plan to `planning/offline-gaps-2026-10.md`.

---

## Implementation notes (2026-10-14)

All four phases shipped as planned, with these refinements found during testing:

- **"Shown means saved."** Optimistic patches now run only after the op is durably in IndexedDB
  (`outbox.submit({ onPersisted })`). A browser test caught a reload landing between the visible
  change and the IndexedDB commit, which lost the change.
- **Quick-session toast wording follows the outcome.** Completion waits up to 2.5 s for the sync:
  "completed" if the server confirmed, "saved on this device" if it's still queued. Wording based
  on the connection state at the moment of the tap was unreliable.
- **One indicator component.** The app-wide indicator is the session indicator with no scope. On
  other pages its idle offline label is just "Offline", since edits outside sessions don't queue.
- **Closing a quick session with values entered keeps it.** Create Session offers Resume/Discard.
  Empty drafts are never saved.
- **Circuit definitions themselves still need a connection** (catalogue editing). Every action on a
  circuit in a session is queued.
- **Telemetry flushes wait for a connection** instead of dropping a batch while offline.
  `offline_boot` is recorded on reconnect.

Verification: backend 1459 passed (plus a load-sensitive 10k-row perf test that passes alone);
client 1759 unit tests; browser suite 36/36. New coverage:
- `test_circuit_ids.py` and shared UUIDv5 vectors (server + client);
- quick-complete client id and replay;
- telemetry allowlist;
- outbox health events and the offline telemetry queue;
- sign-out guards, the quick draft hook, circuit placeholders and patches;
- the login form and offline screen states;
- three new offline browser specs: circuit + round, quick session, signed out.
