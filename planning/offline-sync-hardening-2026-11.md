# Offline session sync: audit and S+ hardening plan

## Context

Device-first session writes (ADR 0004, `client/src/offline/`) sometimes fail, and the
"Syncing N changes…" pill sometimes never goes away. This audit traced the pipeline end to end
(hook → `outbox.submit` → IndexedDB → drain lock → axios/auth interceptors → `@idempotent` →
service → ack handlers → indicator) and checked it against what a critical-infrastructure
queue must guarantee. Each finding marked **(confirmed)** was reproduced with a throwaway
vitest test, deleted afterwards.

The design is strong: write-ahead persistence, per-op idempotency keys, fixed retry bodies,
`occurred_at` with clock-skew correction, client IDs with deterministic circuit children,
dependency cascades, a retained "rejected" queue that works as a dead-letter queue, a kill
switch and a recorded server contract. The failures are in **liveness**: several single faults
leave ops pending with nothing scheduled to send them, and the UI can't tell those apart from
normal syncing.

## How the "stuck" pill happens

The pill reads "Syncing N…" whenever ops are pending, the app thinks it's online, the queue
isn't paused and nothing is rejected (`SessionSyncIndicator.jsx:88`). It sticks when ops are
pending and no send is coming:

| # | Root cause | Evidence | Symptom |
|---|---|---|---|
| 1 | **One storage error mid-drain kills the drain.** `runDrain` rethrows, `flush()` is called as `void flush()` (an unhandled rejection), and no retry timer is set. | **confirmed**: pending=1 and no further sends 3 s later | "Syncing N…" until the tab is hidden and shown again, the connection drops and returns, or a new change is made |
| 2 | **One storage error at startup wedges the outbox.** `hydrated = expireRejected().then(refresh)` rejects for good, and every `submit`/`flush` awaits it. | **confirmed**: both submits threw | *every* change fails until reload |
| 3 | **A dropped IndexedDB connection is never reopened.** `indexedDbStore.js` caches `dbPromise` for good and falls back to memory only when *open* fails. iOS Safari regularly drops connections after backgrounding ("Connection to Indexed Database server lost"), so `db.transaction()` throws on every later call. | code | causes 1 and 2 on iPhones: the likeliest cause of "often" |
| 4 | **The token refresh retry sends the expired token.** In `core.js:222-237` the first request through refresh is replayed with its original `Authorization: Bearer <stale>` header, because the request interceptor only sets the header when none is there. The outbox sees 401 → `pausedForAuth`, and `auth:token_refreshed` has *already fired*, so nothing resumes it. | **confirmed**: the calls were pause(stale) → refresh → pause(stale) → 401 | "Sign in again to sync" when nothing is wrong. Also breaks the first ordinary request after every token expiry |
| 5 | **Global FIFO blocks everything behind one op.** `nextPending()` takes the lowest `seq` across *all* sessions. A deterministic 500 holds the whole queue for ≥30 min (8 failures *and* 30 min). A 409 in-flight, 429 or 502/503/504 holds it for up to 24 h. | code + `outbox.resilience.test.js:72` | "Syncing N…" for 30 min to 24 h with no reason shown (`lastError` is stored but never displayed) |
| 6 | **A frozen tab's drain lock is only reclaimed on a visibility change, and only if it froze mid-send.** A visible tab that is already in front keeps waiting on `navigator.locks`. A tab frozen *between* ops (no `sendingUntil`) can never be reclaimed. | code | "Syncing N…" with two tabs open, typical on desktop and iPad |

## Why changes "fail"

- Causes 2 and 3: `submit` throws, the optimistic patch never runs ("shown means saved"), and
  `removeActivity` calls `void enqueue(...)`, so the error is swallowed with no message.
- **The idempotency claim and the business write commit in different transactions**
  (`blueprints/idempotency.py`). If the handler commits but `_finish` fails, or the instance
  dies or the handler raises after its commit, the claim stays `in_progress` (409 for 2 min),
  or is released and the retry **runs the write again**. Running it again can return a 4xx
  (for example "already running"), so a change that *was saved* shows as rejected, and its
  rollback removes it from the screen.
- `STALE_CLAIM_AFTER` (2 min) is shorter than `GUNICORN_TIMEOUT` (210 s), so a slow request
  that is still running can be run a second time alongside it.
- Rejected ops are discarded after 7 days, and the server refuses `occurred_at` older than
  7 days. A phone offline for longer loses its changes, with only a toast.

## Grade (F → S) against a critical-infrastructure queue

| Dimension | Benchmark (WAL, transactional outbox, broker queues) | Grade |
|---|---|---|
| Durability | fsync'd WAL, protected from eviction, survives a lost connection | **B−**: write-ahead to IDB, but relaxed durability, no `storage.persist()`, no reconnect, memory fallback is silent |
| Exactly-once | dedup key committed in the same transaction as the effect | **B−**: good keys and fixed bodies; the claim and the commit are split |
| Liveness | invariant "pending ⇒ wake-up scheduled", watchdog, lease heartbeats | **D**: four confirmed or likely wedges |
| Fault isolation | per-partition ordering, poison messages to a DLQ quickly | **C**: one global FIFO; a poison op blocks it for 30 min |
| Auth resilience | credential refresh is transparent to the queue | **D**: the stale-token retry pauses the queue |
| Observability | queue-age SLO, stall alerts, operator diagnostics | **C−**: drained and rejected events only; no stall signal; retry reasons hidden |
| Verification | fault injection, randomized invariant tests | **B−**: good unit tests; no store, auth or lock fault tests; one e2e spec |
| UX honesty | the state shown is the true state | **C**: "Syncing…" also covers retrying, blocked, wedged and memory-only |
| **Overall** | | **C+**: architecture worth an A−, run reliability a D |

## S+ plan

The goal: **with signal, no change is ever stuck or silently lost. Every pending op either
sends, waits for a reason the user can see, or goes to review with an action.** These are
enforced as invariants and tested under randomized faults.

### Phase 0: Fix the confirmed wedges (ship first, small diff)

1. **Refresh retry uses the new token.** `client/src/utils/api/core.js`: before
   `return axios(originalRequest)`, call `setHeader(originalRequest, 'Authorization', \`Bearer ${token}\`)`.
   Also export a monotonic `getAuthGeneration()`, bumped in `setAccessToken`. The outbox
   (`outbox.js`) records the generation at send, and on an `auth` verdict retries at once if it
   has changed instead of pausing. Test: a new case in `utils/api/__tests__/core.test.js`.
2. **The drain never dies silently.** `outbox.js` `runDrain`: catch every non-lock error, emit
   `drain_error`, and `scheduleRetry(now + backoff)`. `flush()` never rejects.
3. **Startup can't wedge the outbox.** `hydrated = expireRejected().then(refresh).catch(onHydrateError)`.
   On failure, log it, emit an event and retry hydration with backoff. `submit` never awaits a
   rejected promise.
4. **Liveness watchdog** (`outbox.js`). Invariant: when pending ops exist, the outbox is online
   and not paused, and no flush is running, a retry timer must exist. A 10 s tick checks this
   while anything is pending and calls `flush()` if it doesn't hold. This also covers bugs not
   yet found.
5. **Self-healing IndexedDB store** (`indexedDbStore.js`):
   - Reset `dbPromise` on `db.onclose`, on `onversionchange` (close it), and whenever a
     transaction throws `InvalidStateError` or `UnknownError`. Retry the operation once on a
     fresh connection.
   - Open readwrite transactions with `{ durability: 'strict' }`.
   - On first submit, call `navigator.storage.persist()` once (best effort) so the browser
     doesn't evict the queue.
   - If the store falls back to memory, set `volatile: true` in the snapshot, try to reopen on
     each drain, and copy the memory ops into IndexedDB once it opens.
6. **Submit failures are never silent.** The `enqueue` wrapper in
   `hooks/useOfflineSessionWrites.js` catches errors, shows "Couldn't save this change on the
   device", and rethrows. Replace `void enqueue` in `removeActivity`.

### Phase 1: Isolation and honest status

7. **Ordering per session.** `nextPending()` becomes "the earliest ready head of each scope".
   A scope whose head is backing off doesn't block other scopes. Sending stays one at a time,
   and order within a scope is unchanged. Every op kind is scoped by session (quick sessions
   by draft id, `useQuickSessionPersistence.js:64`), and no dependency crosses scopes.
8. **Faster poison-op handling.** Now that a poison op holds only its own session, give up at
   5 counted 5xx failures and ≥10 min (was 8 and 30 min). It moves to review (the existing
   `retry_exhausted` state), keeps its body and stays retryable. The 24 h ceiling stays for
   outages.
9. **Drain heartbeat for cross-tab takeover.** The drain owner writes `{ tabId, at }` to a
   `drain-heartbeat` key (`idbKeyValue.js`) at the top of each loop and before each send. A
   tab waiting on the drain lock checks every 10 s, not only on a visibility change, and steals
   the lock when the heartbeat is older than `SEND_LEASE_MS`. This covers a tab frozen between
   ops. It replaces the `sendingUntil`-only check in `reclaimStalledDrain`.
10. **The status shows the real state** (`OutboxContext.jsx` `useOutboxStatus` +
    `SessionSyncIndicator.jsx`). New snapshot fields: `headState`
    (`sending | backoff | waitingForTab | volatile`), `nextAttemptAt`, `lastError`,
    `oldestPendingAt`. Labels:
    - "Retrying in 40 s · server error 503 · **Retry now**"
    - "Waiting for another tab"
    - "Saved in this tab only: keep it open"
    - When the oldest pending op is over 2 min old while online, a warning tone and
      **Retry now**. `retryNow()` resets backoff and the watchdog.

### Phase 2: Exactly-once on the server

11. **The commit marker shares the business transaction** (`blueprints/idempotency.py`). Keep
    the separate claim session (concurrent requests need to see it). Add a one-shot
    `before_commit` listener on the request's scoped session (`models/base.py`
    `get_scoped_session`) that runs
    `UPDATE idempotency_records SET status='committed' WHERE user_id, key`. The marker then
    commits or rolls back with the effect.
    - `_claim` treats `committed` like `done` without a body: it replays 200 `{"replayed": true}`
      (the existing status-only path, which the client's post-sync refetch already handles).
    - `_finish` upgrades the row to `done` with the body.
    - Release on failure only when no commit marker was written.
12. **The stale-claim window is derived from the request limit:** `STALE_CLAIM_AFTER = GUNICORN_TIMEOUT + 30 s` (read from config).
13. **Versioned ops.** Add `v: 1` to each op. Hydration runs a small migration table, and an
    op with an unknown version goes to review instead of being sent.
14. **Expiry warns first.** Rejected ops and ops close to the 7-day `occurred_at` limit raise
    a persistent warning at day 5, with an option to save them now, not only a toast at
    discard.

### Phase 3: Observability (proving "never fails")

15. **New `trackEvent` events, counts and codes only** (via the `HEALTH_EVENTS` map in
    `engine.js`):
    - `offline_queue_stalled`: oldest pending op over 2 min while online, with the head state
      as the reason
    - `offline_drain_error`
    - `offline_store_reopened` / `offline_store_volatile`
    - `offline_auth_paused`
    - `offline_lock_reclaimed`
16. **SLOs on the admin telemetry view:**
    - p99 time from submit to ack while online < 10 s
    - stalled sessions = 0
    - ops rejected after a write that actually saved = 0 (from replays of `committed` claims)
17. **"Copy sync diagnostics"** in the review panel: op kinds, states, attempts, error codes,
    head state and ages. No content.

### Phase 4: Verification harness

18. **Fault-injection simulator** (`offline/__tests__/outbox.chaos.test.js`): fake clock, a
    store that injects throws or connection loss, a drain lock that can freeze, and a fake
    server with scripted statuses and a dedup model. The seeded randomized run takes about
    500 schedules of submits and faults. Once faults stop, it checks:
    - every op is acked or under review with a reason
    - no effect is applied twice
    - order holds within each scope
    - the watchdog invariant always holds

    Seeded loop, no new dependency (`fast-check` isn't installed).
19. **Targeted regressions** for each row in the root-cause table (1–6) in
    `outbox.resilience.test.js`, plus the refresh header test.
20. **Server:** `tests/integration/test_idempotency*.py`:
    - `_finish` raising after a business commit → the retry replays and doesn't run again
    - a handler raising after its commit → replay
    - a slow request past the old 2-minute window → no second run
21. **E2E** (`client/e2e/offline-session.spec.js`):
    - token expiry while ops are queued (route the first write to 401, then refresh) → syncs
      with no "Sign in" pill
    - a route returns 500 five times, then 200 → shows "Retrying", then synced
    - two tabs with one frozen through CDP `Page.setWebLifecycleState` → the visible tab
      drains within 15 s

### Updates

- ADR 0004: the per-scope ordering, the watchdog invariant, the commit marker, the heartbeat
  and the new retry limits.
- `index.md`: the offline paragraph.
- Save this plan to `planning/offline-sync-hardening-2026-11.md`.

## Critical files

- Client:
  - `client/src/offline/outbox.js`, `outboxRetry.js`, `outboxTransport.js`, `indexedDbStore.js`,
    `idbKeyValue.js`, `OutboxContext.jsx`, `engine.js`
  - `client/src/utils/api/core.js`
  - `client/src/hooks/useOfflineSessionWrites.js`
  - `client/src/components/sessionDetail/SessionSyncIndicator.jsx` (+ `.module.css`)
- Server: `blueprints/idempotency.py`, `models/base.py`, `config.py`
- Docs: `docs/architecture/ADR_0004_OFFLINE_SESSION_OUTBOX.md`, `index.md`

## Verification

1. `cd client && npx vitest run src/offline src/utils/api`: new regression tests fail before
   each fix and pass after; the chaos suite passes across seeds.
2. `./run-tests.sh tests/integration -k idempotency` passes.
3. `npx playwright test e2e/offline-session.spec.js` passes, including the three new
   scenarios.
4. Manual, on an iPhone PWA:
   - log during signal drops and background the app for 10+ min
   - resume and confirm the pill drains or shows a specific reason with **Retry now**
   - force a token expiry (`JWT_EXPIRATION_HOURS` low in staging) and confirm no
     "Sign in again" pill
5. After deploy, watch `offline_queue_stalled` and `offline_drain_error` for a week. Exit
   criterion: zero stalls not explained by a visible state.

## Implementation status (November 14, 2026)

Phases 0–4 are implemented, except where noted below.

### Bugs found during implementation

The seeded fault simulation (item 18) found two bugs the audit had missed:

- **A failed coalesce lost the earlier change.** `submit` deleted the older unsent edit before
  storing the newer one, so a failed put lost both, and the user was told only about the newer
  one. Supersede had the same ordering. The new op is now stored first, and replaced ops are
  dropped after it (`planReplacements` / `dropReplaced` in `offline/outboxQueue.js`).
- **A save could stall after it was stored.** A store error in the re-read after a successful
  put made `submit` throw. The user was told the change failed although it was saved, and the
  outbox never learned of the change, so nothing sent it. A durable submit no longer fails on
  the re-read.

### Test infrastructure

- Node 25's `navigator.locks` is shared across vitest worker threads. Outbox tests that fell
  back to the real drain lock contended across files and flaked. `src/test/setup.js` now
  removes it; tests that need locking inject their own.
- The browser e2e server serves `client/dist`. Run `npm run build` before Playwright, or the
  tests run an old bundle.

### Deviations from the plan

- **Item 9:** the takeover uses a ping over the user's BroadcastChannel
  (`offline/drainLiveness.js`), not an IndexedDB heartbeat. It needs no periodic writes, and a
  frozen tab can't answer while a live one waiting on a request can.
- **Item 11:** the commit marker is a `before_commit` listener on the request session. The
  `status` column already allowed `committed`, so no migration was needed. This closes S10 from
  `offline-sync-audit-2026-11-07.md`.
- **Item 16 (deferred):** the new events reach `product_events` (on the allowlist in
  `services/telemetry_service.py`), but no admin view reads product telemetry yet. A sync-health
  panel with SLOs is still to be built.
- **Item 21:** the frozen-tab e2e scenario was dropped. CDP's `Page.setWebLifecycleState`
  doesn't hold a page fully frozen in headless Chromium, so the test flaked. Traces showed the
  takeover working in real Chromium about 13 s after the visible tab opened. Deterministic
  coverage is in `outbox.resilience.test.js`.

### Pre-existing failures

Two landing tests fail on HEAD without these changes and were left alone:

- `tests/performance/test_query_budgets.py::test_publish_landing_examples_query_budget` (117 queries > 115)
- `tests/performance/test_query_budgets.py::test_publish_multiple_landing_examples_total_payload_budget`
