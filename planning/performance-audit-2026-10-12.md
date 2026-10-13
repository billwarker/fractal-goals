# Performance audit — October 12, 2026

## Assessment and scope

**Initial performance grade: B+; initial production frontend delivery: A−.** Ordinary account reads are
reasonably fast locally and the September N+1 fixes remain effective. The distance to S+
is primarily bounded history processing, cheaper interaction updates, smaller read models,
and meaningful scaling/browser performance gates. This is a performance assessment, not a
new security, correctness, or deployment certification.

The initial audit changed documentation only. The remediation below was subsequently
authorized and implemented. Findings below separate measured costs from
source-confirmed scaling risks. The initial audit did not measure browser interactions.
Remediation verification adds desktop/mobile Chromium checks and local PostgreSQL plans;
production traffic, physical mobile hardware, concurrent load, and production query plans
remain unmeasured.

## Verification and measured baseline

- `npm run build` succeeds in 5.23 seconds. The public landing budget reports **150.6 KiB
  gzip JS + 10.8 KiB gzip CSS**, below its 175/20 KiB limits. Route and feature chunks are
  already split; summing all output chunks would misrepresent initial transfer.
- All **40 existing backend performance tests pass**, in 26.28 seconds, against a separate
  disposable local PostgreSQL database. The database was removed after the run.
- The initial canonical `./run-tests.sh file tests/performance` run encountered shared-test-
  database deadlocks/schema contention (27 passed, 1 failed, 12 setup errors). A first
  isolation attempt still used the shared database because configuration URL selection is a
  classmethod. The successful rerun bound the scratch URL to `type(config).DATABASE_URL`.
  These earlier results are not evidence of an application query regression.

The successful run used existing fixtures and assertions, disabled coverage for this focused
suite, and wrapped each collected test module's `timed_get` to record query count, response
bytes, and elapsed time. Rows below use the power account fixture: 150 child goals,
150 sessions, 450 activity instances, 900 metric values, and a four-block program. Each
endpoint was measured once on its independently seeded fixture; these are **local samples,
not percentiles or production latency estimates**. Bytes are uncompressed response sizes.

| Read path | Queries | Response bytes | Local elapsed |
|---|---:|---:|---:|
| Fractal goal tree | 6 | 338,524 | 57 ms |
| Goal selection | 9 | 81,833 | 45 ms |
| Sessions, limit 20 | 16 | 298,036 | 97 ms |
| Session analytics summary, default limit 50 | 12 | 682,913 | 135 ms |
| Goal analytics | 13 | 440,026 | 200 ms |
| Session goals view | 19 | 31,588 | 229 ms |
| Program day read model | 28 | 109,730 | 104 ms |
| Program day read model with detail | 31 | 117,981 | 92 ms |
| Global goal list | 6 | 356,588 | 33 ms |

## Findings, in priority order

### 1. High: single-instance progress rebuilds a quadratic full-history chain

`services/progress_service.py:compute_live_comparison` calls
`_activity_comparison_map(...).get(instance.id)`. In
`services/_progress_comparisons.py`, that loads every active instance of the activity,
including rich ORM relationships, and computes comparison payloads for the entire chain.
`_build_activity_comparison_map` creates an `eligible` list by scanning all prior included
instances on every iteration: **O(n²)** predecessor selection, even when every instance is
completed and belongs to a different session. Its cache lasts only for that service object.

This path is live: the instance-progress GET route calls it, timer response fallbacks call
it, and the completed-instance metric-update handler calls it before committing its work.

An isolated benchmark invoked the actual `_build_activity_comparison_map` method with
`SimpleNamespace` instances, distinct session IDs, and `completed=True`. A harness supplied
an empty comparison cache, always-true inclusion, and a trivial comparison payload returning
the predecessor ID. Median of three runs:

| Activity history | Predecessor loop only |
|---|---:|
| 1,000 instances | 26.70 ms |
| 5,000 instances | 655.70 ms |
| 10,000 instances | 2,741.74 ms |

This excludes database loading, tag/metric evaluation and serialization; it isolates the
algorithmic cost and is not a measured endpoint latency.

**Fix:** route single-instance reads through the canonical target-only comparison logic
already used by batch reads, preserving same-session exclusion and completed-predecessor
preference. Remove the competing full-history calculation once unused. Then bound predecessor
selection with indexed SQL rather than fetching all identity rows; batch/history reads
currently still load those rows and scan predecessors for their requested targets.

### 2. High: timeline pagination bounds the response, but scans lifetime history

`services/goal_timeline_service.py:get_goal_activity_heatmap` loads the fractal goal graph,
projects all qualifying summary entries, and passes them to
`services/goal_timeline_page.py:timeline_page`. That function sorts all matches and constructs
all remaining entries before slicing the requested page. Every subsequent cursor page repeats
this process. `GoalHistoryReadModel.instances` ends in `.all()` with no SQL page limit.

The second pass correctly loads rich activity/target data only for the selected entries.
That avoids full-history rich hydration, but the initial summary scan remains **O(history)**
loading and **O(history log history)** sorting for a 20-entry page. The separate calendar
request also projects lifetime evidence; it returns one row per lifetime day.

**Fix:** introduce a shared canonical evidence query/projection supporting stable database
keyset pagination on timestamp and ID. Aggregate calendar evidence by local day on the server
without hydrating each activity ORM object. Preserve one-off attribution, overlapping-source
deduplication, pause/completion windows, DST and equal-timestamp cursor behavior. A shared
versioned aggregate could follow only with reliable cross-worker invalidation.

### 3. High for large histories: goal analytics is an unbounded account-wide read

`services/goal_analytics_service.py:get_goal_analytics` loads all goals, sessions and activity
instances for the root. For each goal, it builds activity breakdowns and sorted per-occurrence
duration arrays, reprocessing shared session/activity evidence across linked goals. Work grows
with history and association fanout; a constant query count does not bound rows or CPU.

`client/src/hooks/useAnalyticsPageData.js` requests this endpoint alongside the 50-session
analytics summary on Analytics entry. The measured responses together are **1,122,939 bytes
uncompressed**, before the activity/group catalogs. The session summary has a session-count
cap, but not a comparable cap on instances, sets or metrics per session.

**Fix:** return aggregate summary data first, apply explicit chart date ranges/buckets, and
fetch paginated per-goal drill-down evidence on demand. Reuse canonical evidence attribution
rather than introducing another goal/session counting implementation. Choose aggregates that
match the current charts and filters before tightening response budgets.

### 4. Medium, measured: selecting or restyling a goal can rerun synchronous tree layout

`client/src/components/flowTree/useFlowTreeGraph.js` memoizes the entire graph presentation
with selection, callbacks, colors, evidence and metrics as dependencies. Presentation always
runs Dagre in `flowTreeGraphUtils.js`, so selection/style/metric changes can trigger geometry
work even when visible nodes and edges are unchanged. The unused `sessions` input also remains
in the hook's memo dependency list, despite `buildGraphPresentation` not reading it.

The actual exported `getLayoutedElements` was benchmarked through Vite's SSR loader with
150/400/1,000 nodes, five children per parent, default desktop tree layout. Median of three
runs after one warm-up:

| Tree size | Layout only |
|---|---:|
| 150 nodes | 19.55 ms |
| 400 nodes | 68.28 ms |
| 1,000 nodes | 310.80 ms |

These are Node CPU measurements, excluding React/DOM work, not browser interaction timings.
Vite's HMR listener could not bind in the sandbox; SSR module loading and the benchmark still
completed successfully.

**Fix:** memoize structural layout separately from selection, styles and node handlers.
Remove the unused sessions dependency/prop after checking callers. Use a worker only if browser
traces still show expensive topology changes; first remove unnecessary layout executions.

### 5. Medium: session list uses detail-heavy payloads and retains every loaded card

`services/session_service.py:get_fractal_sessions` uses the detail-oriented
`_session_read_options` and `serialize_session`: goals, notes, activity instances, sets,
metrics and circuits are loaded for each listed session. Twenty simple sessions already
produce **298 KB**. A bounded session count does not bound this nested content.

`client/src/pages/Sessions.jsx` flattens every fetched page and mounts a
`SessionCardExpanded` for every visible record. Load More increases retained data and mounted
DOM without windowing. Server reads also use OFFSET and repeat the total count per page;
deep-page cost is a secondary risk requiring EXPLAIN evidence before choosing index changes.

**Fix:** define a list read model around what the cards actually display, load expanded details
when needed, and window longer lists while preserving scroll position, focus and selection.
Consider a stable cursor if deep-page measurements justify it.

### 6. Medium: performance gates leave the above scaling behavior unprotected

Power-account tests use one fixed 150-goal/150-session fixture and 5,000 ms time ceilings.
Query/payload budgets are valuable N+1 guards, but those tests do not demonstrate that CPU,
rows loaded or payload growth remains acceptable at larger histories. There is no authenticated
route transfer budget corresponding to the public landing budget, nor a browser interaction
gate for goal selection, many loaded sessions, or long goal timelines in these performance tests.

**Fix:** test multiple history sizes and association fanouts, guard rich rows hydrated per
page, record repeat-run latency distributions outside brittle unit-test timing assertions,
and add representative desktop/mobile browser traces. Isolate disposable databases per audit/CI
run so parallel invocations cannot reset each other's schemas.

## Cleanup candidates and existing strengths

- `components/sessions/SessionsList.jsx` and its CSS appear unused; the only source reference
  is a barrel export. Verify barrel consumers/tests before removal. The canonical page uses
  `SessionCardExpanded`. This is maintenance debt, not a demonstrated transfer bottleneck.
- The full-chain progress calculation competes with the newer batch predecessor calculation;
  consolidation would remove both performance cost and semantics-drift risk.
- Remote state already uses TanStack Query, with a one-minute default stale time and no default
  window-focus refetch. Goal-tree data is slimmed, hot indexes exist, landing delivery is
  budgeted, assets are immutable-cacheable, and nginx enables gzip. These do not need blanket
  replacement or speculative caching/index additions.
- ChartJSWrapper (83.98 KB gzip), ProgramCalendarView (76.88 KB gzip) and FlowTree
  (67.81 KB gzip) are deferred feature chunks. Their size alone does not establish a bottleneck.
- Production bypass of the process-local analytics query cache deliberately preserves freshness
  across workers; enabling that cache globally would introduce a correctness problem.

## Plan to reach S+

1. **Progress:** consolidate target-only comparison calculation; remove quadratic predecessor
   scanning/full-history rich hydration for single reads. Verify same-session, tags/sets,
   excluded instances, ties, uncompleted predecessors, and timer/metric response contracts.
2. **Timeline:** share an evidence projection supporting database keyset pages and daily
   aggregates. Verify all attribution/lifetime/DST/cursor invariants and measure 1k/5k/10k
   history sizes with fixed rich-page loading.
3. **Analytics and session cards:** ship bounded summary/chart/list read models, with deferred
   evidence and expanded details. Preserve current displayed statistics and calendar behavior.
4. **Frontend interactions:** separate tree geometry from presentation, remove unused inputs
   and obsolete session-list components, and window long lists if browser measurements confirm
   the need. Add authenticated route transfer budgets using actual static dependency closures.
5. **Evidence and release gates:** repeat read/mutation profiles at larger sizes, collect query
   plans for changed SQL and row/memory counts, run focused semantic regressions, then complete
   backend/frontend/lint/build/browser checks. Establish p95 targets on a named representative
   environment and desktop/mobile interaction budgets before claiming S+.

## Implemented remediation

All six performance findings above have corresponding implementation and regression guards.

- **Progress:** SQL resolves at most one predecessor identity per requested instance. Only
  targets and chosen predecessors receive rich hydration. Completed preference, same-session
  exclusion, effective-time ties, tags, sets, and timer response contracts remain covered.
  The quadratic full-chain implementation and its competing cache were deleted.
- **Timeline/calendar:** a shared relational evidence projection supports SQL timestamp/ID
  keyset pages and timezone-aware daily aggregation. Calendar reads hydrate no activity
  instances; a 20-entry page hydrates at most 20, including subsequent cursor pages.
  Existing attribution, pause, completion, overlap, and DST regressions pass.
- **Analytics:** SQL computes exact totals, activity breakdowns, and latest evidence. Default
  goal responses contain no occurrence arrays. Explicit date/activity filters run before
  aggregation, and requested charts have at most 366 points for a selected goal or 120 per
  goal for multi-goal charts. Session evidence pages cap persisted instances at 500 and
  expose continuation metadata; the UI requests more explicitly and shows loading/retry
  states. Compact serialization removes unused duplicated data. The unused process-local
  analytics cache was removed; the canonical query-engine cache remains.
- **Session cards:** `view=summary` selects card metadata and compact goal badges without
  hydrating activity/set/note details. Template names/colors retain native and legacy JSON
  presentation contracts. Selected cards fetch details through the shared query cache.
  Offscreen rows retain measured spacers; selection and keyboard focus stay mounted.
  The unused alternate session-list component and stylesheet were deleted.
- **Tree/delivery:** geometry is memoized by topology, layout mode, and viewport class.
  Presentation updates reuse positions while refreshing handlers/styles. Optional surface
  widgets and quick-session entry load on demand. Build budgets inspect the actual unique
  static dependency closure of the public entry, authenticated shell, and main routes.
- **Verification:** the canonical local backend runner now owns a disposable database per
  invocation. Scaling fixtures exercise 1,000/5,000/10,000 linked history rows. New real
  desktop/mobile Chromium checks guard compact pages, deferred details, mounted cards, and
  goal-selection long tasks. No speculative indexes, migrations, or dependencies were added.

The linked-history fixture also exposed an expensive cold aggregate plan: joining activity
identities back through an unindexed materialized session CTE took approximately 27–39
seconds at 10,000 rows. The final query carries aggregate/chart fields through the union and
joins indexed base tables directly. Local service samples were **36.6 / 77.4 / 127.7 ms** at
1k / 5k / 10k rows; the 10k SQL totals and breakdown statements took **47.8 / 70.0 ms**.
These are diagnostic local samples, not production percentiles. A cold aggregate ceiling
and a no-activity-hydration assertion now protect this path.

## Remediation verification

Final power-account reads pass all **5 root read-budget cases**. The same fixture size as
the baseline gives these uncompressed response sizes; elapsed times are single local
samples, not latency guarantees. Goal catalogs still contribute substantial payload.

| Read path | Baseline bytes → final bytes | Reduction | Final queries | Local elapsed |
|---|---:|---:|---:|---:|
| Sessions, limit 20, summary | 298,036 → 28,389 | 90% | 6 | 28 ms |
| Session analytics summary | 682,913 → 331,058 | 52% | 13 | 138 ms |
| Goal analytics | 440,026 → 321,368 | 27% | 5 | 171 ms |

- Complete backend suite: **1,385 passed**, plus **7 adapter tests**. Subsequent SQL and
  presentation refinements passed focused follow-up checks: **108 semantic/performance
  tests**, then **38 goal/list/read-budget contract tests**.
- Complete frontend suite: **333 files / 1,657 tests passed**. Final analytics loading/retry
  refinements passed **26 files / 113 tests**.
- ESLint, TypeScript, backend static types, responsive checks, maintainability checks, and
  production build pass. The existing backend type baseline shrank rather than expanding.
- Dedicated desktop/mobile browser performance checks: **2 passed**. Each separate fixture
  contains 150 goals and 120 sessions with large detail-only attributes. Checks load six
  session pages, enforce compact response/mounted-card limits, and permit no detail request
  until selection. Goal-selection long tasks must stay below 500 ms.
- The broader browser workflow suite is **not green**. An earlier run before adding the new
  performance fixtures produced **12 passed / 10 failed**. Failures include stale AI/dialog
  and day-goal expectations, shared-root active-session collisions, and changed mobile
  layout expectations. Later performance fixture quota/visibility issues were fixed and
  the dedicated performance suite rerun successfully. Overall browser release readiness
  cannot be inferred from the two passing performance cases.

Final route transfer sizes count shared chunks once per entry and include its CSS:

| Entry | JS gzip KiB | CSS gzip KiB | Budget JS / CSS KiB |
|---|---:|---:|---:|
| Public landing | 150.6 | 10.8 | 175 / 20 |
| Authenticated shell | 162.4 | 16.8 | 200 / 40 |
| Goals | 265.5 | 24.2 | 350 / 65 |
| Sessions | 219.8 | 34.7 | 300 / 65 |
| Analytics | 307.2 | 32.4 | 320 / 65 |

## Completion audit and distance to S+

**Implementation assessment: A+ for the audited performance scope; S+ production readiness
is not yet established.** All identified application bottlenecks have fixes and regression
coverage, with canonical semantics retained and competing implementations removed.
`index.md`, test instructions, and analytics architecture/roadmap references match the result.

Remaining distance to S+ is evidence and release reliability: reconcile the broader browser
suite, establish p95 targets under representative concurrent production-sized load, verify
query plans on that deployment, and profile real lower-powered mobile hardware. Local
Chromium mobile viewport checks do not substitute for physical-device measurements.

SQL exact counts/aggregates still process qualifying history; the improvement bounds Python
hydration and response/chart work rather than promising constant database cost. Goal catalogs
and activity breakdowns still scale with catalog/fanout. A single selected instance can carry
many sets/metrics, and legacy JSON metadata requires bounded-page parsing. Session/evidence
offset pages can shift under concurrent writes and deep offsets remain a measured-follow-up
candidate. Cross-worker aggregate caching or new indexes need deployment evidence and reliable
invalidation before adding them.

Suggested commit: `perf: bound history reads and defer expensive UI work`
