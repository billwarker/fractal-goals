# Backlog Quality Audit — September 2026

This is the implementation record for the 24-item program/read-model and repository-quality
backlog. The architectural result is summarized in `index.md`; detailed evidence stays here.

## Worthiness decisions

| Item | Decision | Reason / completion evidence |
|---|---|---|
| 1 | Required | Chain endpoint classification now reads an immutable connectivity snapshot. |
| 2 | Required | Parameterized runs 1–5 plus bridge, break, repeat-break, and restart cases cover the state space. |
| 3 | Required | Prior context is bounded by available capacity inside `MAX_WINDOW_DAYS`. |
| 4 | Required | The full expanded window, including one forward-context day, is capped and maximum-request tested. |
| 5 | Required | Pagination merges all linked rows with the provably sufficient `offset + limit + 1` prefix of the independently sorted other stream; interleaving, late offsets, ties, and `has_more` are tested. |
| 6 | Required, per day | Overlapping occurrences share a deduplicated calendar-day template pool; the strongest configured minimum applies once rather than thresholds being summed. |
| 7 | Required | Legacy context parsing catches JSON/type/attribute failures specifically and logs the session identifier. |
| 8 | Required | `apply_chain_facts` only establishes facts; `summarize_chain_facts` is the sole summary implementation. |
| 9 | Required | Removed status-renderer glyph data has no remaining state metadata or consumer. |
| 10 | Required | The client rejects read-model payloads whose schema version is not exactly v2. |
| 11 | Required audit | FullCalendar labels use container-level React delegation and `dayCellWillUnmount` cleanup instead of per-node native listeners. Five repeated reconciliations remain idempotent in regression coverage. |
| 12 | Required | The measured 80.75% services/blueprints result is enforced at an honest 80% floor by the full CI coverage job. |
| 13 | Required | New low-coverage read-model/cache tests cover window limits, cursor boundaries, merge ties, fallback behavior, and logging. |
| 14 | Required | Classification/count/state boundary testing is now a standing engineering policy. |
| 15 | Required | `check_backend_coverage_gate.py` fails if CI overrides `addopts`, drops a suite, loses scope, or lowers the baseline. |
| 16 | Required review | The 97-revision history confirms recurring reconciliation/backfill work; new corrective revisions must now explain the missed gate and add a regression guard. Exact “corrective” counts are taxonomy-dependent, so policy targets the failure mode rather than a filename metric. |
| 17 | Required | The standing migration policy defines destructive classification, backup, decision, convergence, verification, and recovery requirements. |
| 18 | Reject blanket splitting; enforce remediation | Line count alone is not an ownership seam. Frontend and backend hard caps prevent growth; coherent extractions remain mandatory when state/tests can move together. Pass-through fragmentation would reduce production quality. |
| 19 | Reject a catch-all route decorator; cap debt | Route error responses are not uniform enough for a decorator that guesses ValueError/rollback semantics. Thin services plus shared response helpers remain safer; CI prevents the existing SQLAlchemy catch count from growing. |
| 20 | Required audit | All service/blueprint broad catches were classified. Silent cache/landing fallbacks now log, domain parsing is narrow, needless goal-helper catches are gone, and true isolation boundaries remain. |
| 21 | Required | `index.md` is reduced from 842 lines to a navigable architectural map; feature history remains in planning documents. |
| 22 | Required | The index header and engineering policy restrict updates to ownership, workflows, invariants, and core tooling. |
| 23 | Required process control | History is not rewritten; coherent imperative commit subjects are now standing review policy. |
| 24 | Required process control | Goal, session, landing, and mobile changes now require focused pre-merge manual QA due to their observed corrective-change concentration. |

## Broad-exception review

The inventory was reviewed by responsibility rather than mechanically replacing every
`Exception` with an arbitrary tuple:

- Retained and logged: HTTP/readiness boundaries, event and failure-handler isolation,
  email/cloud-provider calls, analytics export/cache fallbacks, best-effort audit/ops logs,
  transaction-owner completion handlers, and per-user erasure sweep isolation. These must
  contain third-party or callback failures so one failure does not take down unrelated work.
- Narrowed: program-context JSON parsing, target integer parsing, and shared JSON loading now
  catch only their actual parse/type errors.
- Removed: goal type/level helpers no longer hide unexpected programming errors; their
  canonical helpers already handle absent data.
- Unmasked: Redis and landing program fallbacks still degrade safely but now log operation
  and scope instead of silently returning fallback data.

## Coverage ratchet

The baseline is intentionally honest, not aspirational. `pytest.ini` owns scope and threshold;
the coverage CI job runs the entire backend suite without overriding `addopts`, and
`scripts/check_backend_coverage_gate.py` fails if this relationship drifts.
