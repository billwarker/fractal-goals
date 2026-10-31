# Remediation round 2 — close the independent review's findings

## Context

The independent review (`planning/remediation-independent-review-2026-10-29.md`) checked
commit `f80ba845`. It confirmed most fixes but reproduced four new gaps (R1–R4), and noted
two follow-ups from the remediation report (N1, N2). I re-checked each claim against the code
and **agree with all of them**. Two are wider than the review states:

- **R1 is broader.** It isn't only table functions. A schema-qualified *scalar* call parses as
  `Dot(schema, Anonymous('lower'))`. The guard checks only the bare name, so `s.lower(name)`
  passes. `OPERATOR(public.+)` parses as `exp.Operator`, which isn't refused, and any
  `USERDEFINED` type (`x::myschema.mytype`) passes when nested. Unqualified calls also
  depend on `search_path`: an attacker-created overload in `public` with a closer argument
  type would win over the `pg_catalog` built-in.
- **R3 is exactly as described.** `scripts/compat_inventory.py` builds its exclusion set from
  *all* instance rows, including soft-deleted ones. The runtime
  (`services/session_analytics_service.py:190`) excludes only sessions with a live instance.
- **R4:** `client/src/utils/monitoring.js` enables `Sentry.replayIntegration`. The installed
  `@sentry-internal/replay` 10.38.0 supports a `workerUrl` option and ships its worker source
  (`build/npm/esm/worker-bundler.js`), so a same-origin worker is feasible.
- **N2 likely cause:** the program specs build "today" with `new Date().toISOString()` (UTC)
  and set a UTC timezone preference, but Chromium runs in the machine's local zone.
  `client/src/utils/programViewModel.js:733` and several calendar utilities derive dates with
  `toISOString().slice(0, 10)`. Local and UTC days disagree between 20:00 and 24:00 Eastern.
  This may be a product bug, not only a test bug.

Intended outcome: the SQL boundary becomes default-deny for names, types and output size;
the evidence tools are trustworthy; monitored builds stay CSP-clean; the stale-statistics hazard
is fixed in the query rather than only in operations; and the calendar works across the UTC
date boundary.

## Grade of the current codebase against this plan

| Area | Grade | Why |
| --- | --- | --- |
| SQL boundary (R1, R2) | **B** | Relations are default-deny, but qualified names, operators, nested types and output size are not. |
| Evidence tooling (R3) | **C+** | The inventory can report zero for readers still in use, which is the opposite of what it's for. |
| Monitoring and CSP integration (R4) | **B** | Script policy is strong; worker policy silently degrades replay compression. |
| Analytics performance under stale statistics (N1) | **C** | Quadratic (53 s at 10k sessions) after a restore; mitigated only operationally. |
| Calendar date correctness (N2) | **C / unknown** | Specs fail every evening on `HEAD`; product impact unproven. |
| Release pipeline and recovery (F8, F10) | **D+** | No enforced CI-to-deploy link, backup check or smoke test in the repository. |
| **Overall for this scope** | **B** | |

## S+ plan

### Phase 1 — R1: default-deny names, operators and types (`services/_analytics_sql_guard.py`)

1. **Qualified calls.** Refuse any `exp.Dot` whose expression is an `exp.Func`. In
   `_check_table`, check the `db`/`catalog` qualifiers *before* the early return for
   table functions.
2. **Operators.** Add `exp.Operator` (the `OPERATOR(schema.op)` syntax) to the forbidden nodes.
3. **Types.** Validate every `exp.DataType` anywhere in the tree, not only one directly under a
   cast, including array element types. Refuse `USERDEFINED` and any qualified type. Keep the
   existing value-type allowlist.
4. **`search_path`.** In `_read_only_query_scope` (`services/_analytics_execution.py`), run
   `SET LOCAL search_path = pg_catalog, pg_temp`. Compile the catalog CTEs with
   schema-qualified table names (SQLAlchemy `schema_translate_map` or explicit `public.`) so
   they still resolve. Unqualified function calls then can only reach `pg_catalog`, and the
   user's own unqualified table names resolve only to the CTEs (anything else becomes
   "relation does not exist" as a second layer).
5. **Tests** (`tests/integration/test_analytics_sql_guard.py`): turn the review's probes into
   regressions that must be **refused**:
   - a schema-qualified `generate_series` backed by a `SECURITY DEFINER` routine, created in
     setup and dropped afterwards;
   - `s.lower(...)`, `pg_catalog.lower(...)`, `OPERATOR(public.+)`;
   - nested `regclass[]`, `myschema.mytype` and `mytype[]` casts;
   - a `public.lower(varchar)` overload that must not be called.

   The explanation corpus and all 25 existing probes must still pass.

### Phase 2 — R2: result byte budget (`services/_analytics_execution.py`)

1. Add constants in `services/_analytics_catalog.py`: `RAW_SQL_MAX_ROW_BYTES` (64 KiB) and
   `RAW_SQL_MAX_RESULT_BYTES` (4 MiB).
2. Wrap the guarded query so oversized data never crosses the wire:

   ```sql
   SELECT CASE WHEN q.b <= :row_cap THEN q.j END AS row, q.b AS bytes,
          sum(q.b) OVER (ROWS UNBOUNDED PRECEDING) AS running
   FROM (SELECT row_to_json(u) AS j, octet_length(row_to_json(u)::text) AS b
         FROM (<user>) u LIMIT n + 1) q
   ```

   Stop at the first row over the row cap, or once `running` passes the result cap, and
   return a 413-style 400 that names the limit. Rebuild the columns from the `row_to_json`
   keys, which keep column order. Values are already JSON-typed, so `_json_value` can stay.
3. Apply the same per-request byte cap to structured queries' serialized payloads.
4. **Tests:** exactly at the cap, one byte over, a single oversized value (the review's
   `string_agg` probe), and many small rows passing the total. Corpus results unchanged.

### Phase 3 — R3: correct the compatibility inventory (`scripts/compat_inventory.py`)

1. Replace the all-instances set with a SQL `NOT EXISTS (… deleted_at IS NULL)` per session,
   batched with `yield_per`. This mirrors the runtime predicate and doesn't grow with the
   size of the instance table.
2. Tests: zero, one live, mixed live and deleted, and deleted-only instances. The
   deleted-only case must count, as it does at runtime.
3. Rerun the inventory against local development data and correct the numbers in the audit.

### Phase 4 — R4: same-origin Sentry replay worker

1. Emit the replay compression worker as a hashed asset at build time: a small Vite plugin
   that writes it from `@sentry-internal/replay`. Pass its URL as `workerUrl` in
   `replayIntegration` (`client/src/utils/monitoring.js`). Keep `worker-src 'self'`; do not
   add `blob:`.
2. Extend `client/scripts/check-csp-enforcement.mjs` with a **monitored build** run, using a
   stub DSN pointed at a local sink. Assert there are no `worker-src`, `connect-src` or
   `script-src` violations and that the worker posts a message, not just that it was
   constructed.
3. Unit test: monitoring passes a same-origin `workerUrl`.

### Phase 5 — N1: make goal analytics independent of planner statistics

1. In `services/goal_analytics_queries.py` (`analytics_evidence`), force parameterized lookups
   in the session-goal branch. Use the same bounded `LATERAL … LIMIT 1` primary-key
   correlation already used for explicit instances, or aggregate per session before joining
   goals, so no plan can nest unparameterized scans.
2. Add a dedicated **stale-statistics guard** (`tests/performance/test_history_scaling.py`).
   It analyzes the tables while empty, disables autovacuum on them during the test, loads
   10k history rows, and keeps the same < 5 s budget. Its setup is the probe that produced
   53 s today. Keep the analyzed fixture for the existing structural budgets.
3. Keep `ANALYZE` in the restore runbook and drill as defence in depth.

### Phase 6 — N2: calendar dates across the UTC boundary

1. **Reproduce deterministically.** Run the program specs with Playwright `timezoneId:
   'America/New_York'` and `page.clock.setFixedTime` at 23:30 local, which is 03:30 UTC
   the next day. Repeat at 09:00 local as a control.
2. **Classify the cause.** Decide whether the defect is in the test (UTC "today" while the
   browser renders local) or in the product (UTC `toISOString().slice(0, 10)` in
   `programViewModel.js`, `programCalendarContinuous.js` and `dateRange.js` for a user whose
   preference is local).
3. **Fix the product side** with the existing timezone-preference helpers. Route every "today"
   and day-key derivation through one canonical local-date function, reusing the
   `goalDeadlineRules.js` pattern that has shared fixtures. Fix the specs to derive "today"
   in the same zone they render.
4. **Tests:** Vitest boundary cases at 23:59 and 00:00 local, for zones east and west of UTC.
   Add a browser project or spec that runs the program workflows at the fixed late-evening
   clock, so CI catches this at any time of day.

### Phase 7 — F8 and F10 in-repo preparation (live validation needs your GCP access)

1. In `cloudbuild.yaml`, add a first step that refuses to deploy unless the commit's required
   GitHub checks passed. This needs a read-only GitHub token in Secret Manager.
2. Add a pre-migration step that confirms a fresh dump or snapshot exists before `migrate-db`.
3. Add a post-deploy step that runs `/api/readyz` plus an authenticated synthetic-account
   smoke check, and rolls traffic back on failure.
4. Document these in `docs/architecture/BACKUP_RESTORE_RUNBOOK.md` and the audit. Proving
   that a failed gate can't deploy needs a trigger run in your project.

### Phase 8 — Documentation and audit

- Update `docs/architecture/ANALYTICS_SQL_BOUNDARY.md`: qualification and type rules,
  `search_path` pinning, byte budgets. Remove the "review status" caveat only once Phase 1
  and Phase 2 tests are green.
- In the October 28 audit and the review file, add an R1–R4/N1/N2 disposition table with
  evidence. Update `index.md`.
- Save this plan as `planning/remediation-round-2-plan-2026-10-29.md` once you approve it.

## Critical files

- `services/_analytics_sql_guard.py`, `services/_analytics_execution.py`,
  `services/_analytics_catalog.py`
- `tests/integration/test_analytics_sql_guard.py`
- `scripts/compat_inventory.py`, `tests/integration/test_compat_inventory.py`
- `client/src/utils/monitoring.js`, `client/vite.config.js`,
  `client/scripts/check-csp-enforcement.mjs`
- `services/goal_analytics_queries.py`, `tests/performance/test_history_scaling.py`
- `client/src/utils/programViewModel.js`, `programCalendarContinuous.js`, `dateRange.js`;
  `client/e2e/program-*.spec.js`; `client/playwright.config.js`
- `cloudbuild.yaml`, `docs/architecture/BACKUP_RESTORE_RUNBOOK.md`

## Verification

- `./run-tests.sh file tests/integration/test_analytics_sql_guard.py`: all review probes
  refused; corpus and the original 25 probes green.
- Byte-budget tests, inventory tests, and the stale-statistics guard, which must run under 5 s
  with autovacuum disabled.
- `./run-tests.sh lint`, `audit`, `backend` (uncontended full run), `frontend` with coverage,
  `npm run build`.
- Container: `scripts/check_frontend_headers.py`, plus `check-csp-enforcement.mjs` for both a
  plain build and a monitored build.
- The full browser suite twice: at a normal hour, and with the fixed late-evening clock
  project. All program specs pass in both.
- Phase 7: dry-run the Cloud Build config with `gcloud builds submit --config` against a
  staging trigger, which you run, and confirm that a failing check stops the deploy.
