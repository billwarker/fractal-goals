# Offline sessions — feature audit (2026-10-14)

**Scope:** the offline session feature as built across `cd03eea3` (outbox, idempotency,
`occurred_at`, PWA shell, offline boot) and the gaps work (deterministic circuit IDs, quick
sessions, app-wide sync status, offline sign-in, telemetry).

**Method:**
- read-through of every module under `client/src/offline/`, the session/circuit/notes write
  hooks, `blueprints/idempotency.py`, `services/occurred_at.py` and `services/circuit_ids.py`;
- a check for in-session write paths that bypass the outbox;
- a server probe of the client-ID replay path.

Recommendations are not implemented in this document.

## Verdict: **A− (88/100)**

The architecture is right, and the main paths have strong evidence behind them:
- **Durability:** the outbox persists every write before showing it.
- **Retry safety:** idempotency makes resends harmless.
- **Correct times:** `occurred_at` records when you tapped.
- **Consistent IDs:** client and server derive identical IDs.
- **Browser evidence:** four Playwright specs reproduce the real gym scenario on desktop and
  mobile.

It falls short of S because of one rare but total failure mode (finding H1). Two more problems
undermine trust in the sync story over time:
- clients can get stuck on an old app version (M2);
- there's no remote off-switch for the service worker (M1).

| Dimension | Weight | Score | Summary |
|---|---:|---:|---|
| Correctness and data integrity | 30% | 84 | Durable, ordered, idempotent, correctly timed. One poison-op path can stop all syncing. |
| Resilience and operations | 20% | 82 | Good backoff and connectivity. No retry ceiling, no service-worker kill switch, idempotency storage unbounded for inactive users. |
| Coverage of in-session actions | 15% | 88 | Everything in-session is queued except activity/set tag edits and per-instance goal links. |
| UX and honesty of status | 15% | 93 | One calm indicator, honest wording ("saved on this device" vs "completed"), review of rejected changes, offline sign-in screen. |
| Security and privacy | 10% | 90 | Per-user stores, no API caching in the service worker, cleared on logout. Quick drafts and the queue outlive logout. |
| Verification | 10% | 95 | Unit, integration, cross-language vectors and four offline browser specs. Gaps: optimistic rules vs server rules, the poison-op path. |

Weighted: 25.2 + 16.4 + 13.2 + 14.0 + 9.0 + 9.5 = **87.3, rounded to 88**.

---

## Findings

### High

**H1. A failing write can stop all syncing permanently.**
- **What happens:**
  - `classifyFailure` ([outbox.js](../client/src/offline/outbox.js)) treats every 5xx and
    `idempotency_in_flight` as retryable, with no attempt limit.
  - Ops are strictly first-in, first-out.
  - So an op that fails the same way every time sits at the head of the queue, retrying every
    ≤60 s, and **every later change for every session waits behind it indefinitely**.
- **Shown to the user:** "Syncing N changes…" that never finishes.
- **Concrete trigger:** see H2. Any deterministic server bug on a queued endpoint produces the
  same outcome.
- **Fix:**
  - Cap retries (for example 10 attempts or 24 h, whichever comes first), then mark the op
    *rejected* with code `retry_exhausted` so it appears in Review and the queue moves on.
  - Report `retry_exhausted` through the existing `offline_op_rejected` telemetry.

**H2. Replaying a create whose idempotency record is gone fails instead of succeeding.**
- **Verified by probe:** posting the same client `instance_id` to
  `POST /sessions/{id}/activities` twice returns **201, then 500** (primary-key collision).
  The 500 is retryable, which feeds H1.
- **Other creates:** notes, quick sessions, circuit runs and rounds return **409**. That marks
  the change "couldn't sync" even though it was saved.
- **When it happens:**
  - the server crashes between the handler committing and `_finish` storing the response (the
    claim goes stale, the retry re-executes); or
  - the op is replayed more than 14 days later (record purged).
- **Plan deviation:** the original plan specified that an existing ID owned by the same user,
  under the same parent, counts as **idempotent success**.
- **Fix:** for every client-ID create, if the row exists with the same owner and parent, return
  the current serialized row with 200. Return 409 only for a genuine foreign collision. Add an
  integration test for each create path.

### Medium

**M1. No remote off-switch for the service worker.**
- **Why it matters:** removing the feature flag also removed the only rollback path
  (`unregisterAppServiceWorker`). A bad service worker (wrong precache, broken navigation
  fallback) would keep serving the broken shell to every phone that installed it, until each
  user clears site data.
- **Fix:** add a server-controlled kill switch (for example `/api/healthz` returning
  `service_worker: "disable"`, or a dedicated flag) that the client checks on boot to unregister
  and clear caches. Document a "self-destroying worker" deploy as the last resort.

**M2. Updates can be withheld indefinitely.**
- **What happens:** `AppUpdatePrompt` hides while any op is pending **or rejected**. Rejected ops
  never expire and stay until the user acts on them.
- **Effect:** a user who ignores one rejected change never sees the update prompt. On mobile,
  where the tab is rarely fully closed, the waiting worker may not activate for weeks.
- **Fix:**
  - Block the prompt only on *pending* ops, not rejected ones.
  - Give rejected ops a lifetime (for example 7 days), after which they are discarded with a
    one-time notice.

**M3. Some in-session edits still bypass the outbox.**
- **Which:**
  - activity and set **tag edits** (`replaceActivityInstanceTags` / `replaceActivitySetTags` via
    [useActivityProgressViews.js](../client/src/hooks/useActivityProgressViews.js));
  - **per-instance goal links** ([useActivityInstanceGoalAssociation.js](../client/src/hooks/useActivityInstanceGoalAssociation.js)).
- **Offline:** they fail with "needs a connection".
- **Online, while a queue is draining:** they can reach the server before the queued create of
  the record they target, and get a 404.
- **Fix:** queue them as op kinds; tag edits carry their `version` for the server's
  optimistic-concurrency check. At minimum, make them `await outbox.whenDrained(scope)`, as
  circuit definition edits do.

**M4. Device clock skew is not corrected.**
- **What happens:** `resolve_occurred_at` trusts the phone's clock within bounds.
- **Fast clock:** every tap is clamped to the moment the request arrives, so durations collapse.
- **Slow clock:** times land early. Durations survive only because the floor keeps intervals
  ordered.
- **Fix:** send the client's send time alongside `occurred_at`, and have the server shift
  `occurred_at` by (server receive time − client send time), with a sanity cap.

**M5. Idempotency storage grows without bound for inactive users.**
- **What happens:** every keyed 2xx response is stored in full (session and instance payloads,
  often several KB). Expired rows are pruned only for the user making the next keyed write, so
  rows of users who stop using the app are never removed.
- **Fix:**
  - Add a global purge to the existing admin prune action, or a scheduled job.
  - Consider storing only the status and a compact body for large responses.

**M6. Circuits created offline lack member activity instances in the cache.**
- **What happens:** `useCircuitRunDerivedState` resolves members through the session
  activity-instance cache. Placeholders add the run, slots, rounds and members, but not the
  member/slot instances.
- **Effect:** until the circuit syncs, member tag editors don't render and per-member progress
  hints are missing. Nothing is lost.
- **Fix:** have `buildPlaceholderRun` / `buildPlaceholderRound` also return placeholder instances
  (their IDs are already derived), and patch them into `sessionActivities`.

**M7. Timing changes queued for more than 24 hours are rejected.**
- **Why it happens:** the stale-queue guard rejects any `occurred_at` older than 24 h.
- **Effect:** a phone left offline overnight (dead battery in a gym bag) loses its timer starts
  and completions, which are shown as rejected.
- **Fix:**
  - Accept the op but fall back to server time beyond the window, marking the instance as
    `timing_estimated`; or
  - widen the window to the 48 h used by the persisted cache.

### Low

- **L1. Logout leaves workout data on the device.** Quick-session drafts and the per-user outbox
  database persist (by design for the queue). On a shared device, clear drafts at logout, and
  offer "discard unsynced changes" in the sign-out warning.
- **L2. Optimistic rules duplicate server rules.** `applyTimerAction`, `applySessionPause/Resume`,
  `cascadeMemberMetric` and the round renumbering mirror server behaviour with no contract test
  against real server output. A server change could silently diverge until the next ack.
  - **Fix:** record serializer fixtures from integration tests and assert the client patch
    produces the same fields.
- **L3. Cross-tab ordering ties.** `nextSeq()` is `max(highest + 1, now())` against each tab's
  own snapshot, so two tabs writing in the same millisecond can tie. Single-user impact is
  negligible.
- **L4. Coalescing can reorder an edit past a delete.** A coalesced edit moves to the end of the
  queue. If the record was deleted in between, the edit is rejected with a spurious "couldn't
  sync".
  - **Fix:** drop coalesced ops whose target was deleted later in the queue.
- **L5. The persisted-cache version is a manual constant.** It's documented, but there is no
  test that fails when a persisted query's shape changes.
- **L6. Two flaky tests outside this feature.** `program-day-layout` (mobile) failed 1 in 4 full
  runs. `test_analytics_aggregates_instances_without_hydration[10000]` fails under parallel load.
  Both pass on their own.

---

## Strengths (keep)

- **Shown means saved:** optimistic UI runs only after the IndexedDB commit (`onPersisted`). A
  browser test caught the earlier gap.
- **Idempotency as the single source of retry safety:** HTTP-only request schemas keep the AI
  agent contract unchanged, and the maintainability caps were respected.
- **Deterministic circuit IDs:** UUIDv5 with shared vectors tested in both languages, so there is
  no ID-mapping layer.
- **Honest status:**
  - the toast wording follows the actual sync outcome;
  - the review list explains server refusals in plain language;
  - telemetry carries counts and codes only.
- **Auth:** network failures never sign anyone out. Offline boot grants nothing until the cookie
  refresh succeeds.

## Path to S+

1. **H1 + H2:** retry ceiling, and idempotent success for client-ID creates. These are the only
   changes needed to remove the "stuck forever" class.
2. **M1 + M2:** remote service-worker kill switch; updates blocked only by pending ops; rejected
   ops expire.
3. **M3 + M6:** queue tag and goal-link edits; placeholder instances for offline circuits.
4. **M4 + M7:** clock-offset correction; graceful handling of timing older than 24 h.
5. **M5 + L1–L5:** storage purge, logout hygiene, contract fixtures, dependency-aware coalescing.

Items 1 and 2 together would take this to **S (≈95)**. All five reach **S+**.
