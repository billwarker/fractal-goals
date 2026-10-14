# Offline Sessions — Audit Remediation to S+

## Context

The 2026-10-14 audit ([offline-sessions-audit-2026-10-14.md](planning/offline-sessions-audit-2026-10-14.md)) rated the offline feature **A− (88)**. The architecture is sound, but there are three classes of problem:

- **Sync can stop or mislead:**
  - **H1:** a failing change retries forever, blocking everything behind it.
  - **H2:** replaying a create returns 500/409 instead of success. The 500 was reproduced against the server.
- **Lifecycle and operations gaps:**
  - **M1:** no service-worker kill switch.
  - **M2:** updates are withheld while any change is rejected.
  - **M5:** idempotency storage grows without bound for inactive users.
- **Edge correctness and coverage:**
  - **M3:** tag edits and goal links aren't queued.
  - **M4:** phone clock skew isn't corrected.
  - **M6:** circuits added offline lack member instances.
  - **M7:** timing changes older than 24 h are rejected.
  - **L1–L6:** logout hygiene, duplicated rules, ordering ties, edit-after-delete, manual cache versioning, two flaky tests.

The goal is to fix every finding so that no single change can stall the queue, nothing saved is shown as failed, and the remaining behaviour is enforced by tests rather than convention.

## Grade of the current implementation: **A− (88/100)** (from the audit)

| Dimension | Now | Target | What moves it |
|---|---:|---:|---|
| Correctness and data integrity | 84 | 98 | H1, H2, L3, L4 |
| Resilience and operations | 82 | 97 | M1, M2, M5, M7 |
| Coverage of in-session actions | 88 | 98 | M3, M6 |
| UX and honesty of status | 93 | 97 | M2 expiry notice, M7 |
| Security and privacy | 90 | 96 | L1 |
| Verification | 95 | 99 | L2/L5 contract fixtures, L6 flake fixes |

---

## Phase 1 — Sync can never stall or lie (H1, H2, L3, L4)

**H1. Retry ceiling for server failures**, in [outbox.js](client/src/offline/outbox.js)
- **Counted:** each failure that came *with a server response* (5xx, 408, 429, `idempotency_in_flight`).
- **Not counted:** network/no-response failures. The device is just offline, and those keep retrying with backoff as now.
- **Ceiling:** after 8 counted failures, or 24 h since the first, the op is marked *rejected* with code `retry_exhausted`. It then shows in Review and is reported by the existing `offline_op_rejected` telemetry.
- **Tracking:** a separate `serverFailures` counter and `firstServerFailureAt` on the op.

**H2. Client-ID creates are idempotent: an existing row returns success.**

| Create | Where | Counts as the same request when |
|---|---|---|
| Activity instance | `add_activity_to_session` ([session_activity_service.py](services/session_activity_service.py)) | same root, session, activity definition |
| Note | [notes_api.py](blueprints/notes_api.py) create | same root and context |
| Quick session | [sessions_api.py](blueprints/sessions_api.py) quick-complete | same owner and root |
| Circuit run | `create_run` ([circuit_service.py](services/circuit_service.py)) | same session and definition |
| Circuit round | round add ([circuit_round_operations.py](services/circuit_round_operations.py)) | same run |

- On a match, return the current serialized record with **200**. Otherwise return **409**, a genuine foreign collision.
- The activity path currently returns a raw 500; it gets this check and stops reaching the primary-key collision.

**L3. Cross-tab ordering:** compute `seq` inside the Web Lock from the store's highest value. Today it uses each tab's own snapshot.

**L4. A delete supersedes queued edits.** New `supersedes: [entityId]` option on `outbox.submit`:
- Pending (not in-flight) ops touching that entity are dropped.
- If one of the dropped ops was the entity's *create*, the delete itself is dropped too: create-then-delete offline cancels out.
- Used by activity remove, note delete, circuit delete and round remove.

## Phase 2 — Lifecycle and operations (M1, M2, M5, M7)

**M1. Service-worker kill switch.**
- New feature flag `offline_service_worker_disabled` (default off), toggled from the existing admin flags UI, so no deploy is needed.
- In [OutboxContext.jsx](client/src/offline/OutboxContext.jsx), once flags load successfully:
  - **on:** unregister the worker, delete the `workbox-*`/`app-assets` caches, and reload once;
  - **off:** register as now.
- Failing to load flags offline never unregisters (same rule as before).
- Restore `unregisterAppServiceWorker` in [serviceWorker.js](client/src/offline/serviceWorker.js), plus a runbook note in ADR 0004.

**M2. Updates aren't held hostage.**
- [AppUpdatePrompt.jsx](client/src/offline/AppUpdatePrompt.jsx) blocks only on *pending* ops, not rejected ones.
- Rejected ops expire after 7 days: on hydrate the outbox discards them, emits an `expired` health event, and shows a one-time notice: "1 change that couldn't sync was discarded after 7 days."

**M5. Bounded idempotency storage**, in [idempotency.py](blueprints/idempotency.py):
- A global purge of expired records, run at most once per hour per process, piggybacked on a claim.
- Also wired into the admin prune action ([admin_api.py](blueprints/admin_api.py) `prune_admin_usage`).
- Response bodies over 64 KB are stored as status only. A replay then returns the status with `{"replayed": true}`; the client's drain refresh fetches the data.

**M7. Late timing.** Raise the `occurred_at` window in [occurred_at.py](services/occurred_at.py) from 24 h to **7 days**, matching the quick-draft lifetime. The existing floor and now-clamps already keep intervals ordered and inside the session. Beyond 7 days the message is unchanged.

## Phase 3 — Coverage and correctness (M3, M4, M6)

**M3. Tag edits and goal links are queued.**
- New op kinds `INSTANCE_TAGS`, `SET_TAGS` and `INSTANCE_GOAL_LINK` in [sessionOpHandlers.js](client/src/offline/sessionOpHandlers.js), wired in [useActivityProgressViews.js](client/src/hooks/useActivityProgressViews.js) and [useActivityInstanceGoalAssociation.js](client/src/hooks/useActivityInstanceGoalAssociation.js).
- **Tags:**
  - coalesced per instance or set, so the latest full tag list wins;
  - sent **without** `version`, which the API makes optional, giving single-user last-write-wins;
  - the ack response's `version` updates the cache for later online edits.
- **Goal links:** coalesced per instance + goal. A link then unlink queued offline cancels out.

**M4. Clock-skew correction, client-side.**
- [connectivity.js](client/src/offline/connectivity.js) records the server `Date` response header on every API response, and keeps the median offset of the last 15 samples, rejecting samples whose round trip exceeded 2 s.
- `sendOutboxOp` shifts `body.occurred_at` by that offset at send time. The server's floor/now clamps stay as the backstop.
- `Date` has 1 s resolution, which is enough for workout timing. No server plumbing is needed.

**M6. Circuits added offline include their member instances.**
- `buildPlaceholderRun` / `buildPlaceholderRound` ([circuitOps.js](client/src/offline/circuitOps.js)) also return placeholder activity instances for slots and non-set members. The IDs are already derived; the shape comes from `buildPlaceholderInstance` in [sessionOps.js](client/src/offline/sessionOps.js) and `slot.activity_schema`.
- The `CIRCUIT_CREATE` and `CIRCUIT_ROUND_ADD` patches insert them into `sessionActivities`.
- Result: member tag editors and progress hints work before sync.

## Phase 4 — Hygiene and enforced contracts (L1, L2, L5, L6)

**L1. Logout hygiene.**
- `endLocalSession` ([AuthContext.jsx](client/src/contexts/AuthContext.jsx)) also deletes that user's quick drafts. Add `idbDeletePrefix` to [idbKeyValue.js](client/src/offline/idbKeyValue.js).
- The queue still persists, by design. The sign-out warning gains a second confirm when changes are pending: "Discard them from this device?" Choosing it deletes the user's outbox database.

**L2 + L5. Contract fixtures that also version the cache.**
- A backend test writes real serializer output for an activity instance, session, circuit run, note and quick session to `tests/fixtures/offline_contract/*.json`. It fails if the committed fixtures are stale; a single command regenerates them.
- Client contract tests assert that:
  - every placeholder builder produces the fixture's key set;
  - the timer, pause/resume, round and cascade patches touch only fixture fields.
- The persisted-cache version becomes `v1:` + a hash of those fixture key sets, imported at build time. A shape change regenerates the fixtures and automatically retires old persisted caches; no manual bump.

**L6. Flaky tests.**
- `program-day-layout` (mobile): find the timing dependency (likely the sheet animation, as found in `program-blocks-sidepane`) and wait for the settled state.
- `test_history_scaling[10000]`: mark it serial-only (`@pytest.mark.serial`, excluded from parallel runs and run separately in CI) instead of relaxing its budget.

---

## Verification

- **pytest:**
  - Replaying each client-ID create returns 200 with the same body, and a foreign collision returns 409. Covers activity, note, quick session, run and round; the activity case is the old 500.
  - The global idempotency purge and the 64 KB cap, including the replay of a capped record.
  - `occurred_at` at 3 days is accepted and clamped; at 8 days it is rejected.
  - The kill-switch flag exists and defaults off.
  - Fixture freshness.
- **Vitest:**
  - **Ceiling:** retry exhaustion counts only server failures; network failures never exhaust.
  - **Expiry and updates:** rejected ops expire after 7 days with a notice; the update prompt ignores rejected ops.
  - **Supersede:** `supersedes` drops queued edits, and create + delete cancels out.
  - **Ordering:** `seq` is unique across two outboxes sharing a store.
  - **Clock skew:** the offset median ignores high-latency samples, and sends correct `occurred_at`.
  - **Queued edits:** tag and goal-link ops coalesce and send without `version`.
  - **Circuit instances:** placeholder member instances appear for offline circuits.
  - **Logout:** clears drafts, and discard-on-logout deletes the queue.
  - **Contracts:** contract tests run against the fixtures.
- **Playwright** additions to [offline-session.spec.js](client/e2e/offline-session.spec.js):
  - Offline: tag an activity, link a goal, add and then delete an activity (nothing is sent for the cancelled pair). Reconnect and verify the server state.
  - A forced 500 on one queued op (route interception) is rejected after the ceiling while later ops still sync.
  - Toggling the kill-switch flag unregisters the worker on the next load.
- **Suites:** full backend, client and browser suites (browser twice in a row), plus a real-phone check with airplane mode.
- **Docs:**
  - Append a remediation addendum and new score to the audit.
  - Update ADR 0004: retry ceiling, supersede, kill switch, clock correction, contract-driven cache versioning.
  - Save this plan to `planning/offline-sessions-s-plus-remediation-2026-10.md`.

**Expected result:** every audit finding closed, and verified by a test that would fail if it regressed. Score **S+ (≈98)**.
