# Program Metrics & Insights

> UI status (2026-09-04): the standalone Insights workspace described in this historical plan has been retired. Its useful program-native summary now lives in the persistent Details sidepane, and multi-day calendar selection scopes that overview directly. The backend metrics and comparison contracts remain available; the obsolete Insights component, header tab, client comparison query, heatmap-only status icon, and associated styles/tests were removed.

## Context

Programs currently model structure (programs → blocks → days → templates → goals) but say almost nothing about **execution**. The entire metrics surface today is eight lines of plain text in `ProgramSidebar.jsx:44-71` — Days Remaining, Program Days completed/scheduled, Duration, Goals met/total — computed client-side by `buildProgramMetrics` (`client/src/utils/programViewModel.js:687-723`) from the fat `getProgram` payload. There is no program metrics endpoint, no program visualization in the analytics registry, and no measure of whether the user is actually *doing* the program.

Meanwhile, five recent commits (`19b2378` → `359df91`) made the rest of the app program-aware: the goal tree scopes to active programs, Create Session is program-aware on scheduled *and* unscheduled days, sessions persist a `program_context` snapshot, and off-scope manual goals are recorded as `off_program_goal_ids`. `planning/program-aware-create-session.md:171` explicitly banked that field "for later analytics." That raw material now exists and is unused.

This plan turns the Programs page into a surface the user returns to for **adherence, alignment, and refinement**: an always-visible summary strip above the calendar plus a full Insights view, both driven by one backend metrics engine. It deliberately stays out of the Analytics page's territory — Analytics is the free-form exploration surface (21 visualizations, saved views, SQL console); Programs gets a fixed, opinionated, non-configurable set of program-native metrics.

### Blocking problem this plan must solve first

**Four conflicting definitions of "this goal is in the program" exist today.** Any alignment metric built on top of them would be meaningless:

| Surface | Seeds | Expansion | Location |
|---|---|---|---|
| FlowTree scope | program ∪ block ∪ day goals | ancestors + self + descendants | `client/src/components/flowTree/flowTreeTreeUtils.js:49` |
| CreateSession scope | `program_goal_ids` | ancestors + self + descendants | `client/src/hooks/useCreateSessionProgramContext.js:44` |
| Server `off_program_goal_ids` | `program_goals` table only | **none** (exact membership) | `services/session_lifecycle_service.py:41-49` |
| Programs page | `program.goal_ids` | descendants only, window-pruned | `client/src/utils/programGoalWindow.js` |

A goal can read as in-scope in the UI and simultaneously land in `off_program_goal_ids` on the server. Phase 1 fixes this.

---

## Database Grade: **C+**

Assessed against what this feature needs.

**What's strong (B+/A- territory):**
- Clean relational skeleton: `programs` / `program_blocks` / `program_days` with proper FKs, CASCADE deletes, and indexed `root_id` / `program_id` / `block_id` (`models/program.py:31-122`).
- `program_day_templates` carries `is_required` + `order`; `program_days.completion_min_templates` gives a real completion rule, correctly implemented and unit-tested in `evaluate_program_day_completion` (`models/program.py:184-207`).
- `sessions.program_day_id` is a real indexed FK (`ix_sessions_program_day_id`).
- `goal_pause_intervals` + `resolve_contribution_goal` (`services/goal_contribution.py:42`) is a genuinely excellent evidence primitive — durable pause history, one chokepoint, already shared by the tree/timeline/metrics overlay.
- Migration discipline is strong: CI gates upgrade-to-head, drift detection, and one-step downgrade/re-upgrade.

**What drags it to C+:**
1. **Session→program linkage is dual-channel and half-invisible to SQL.** `sessions.program_day_id` is NULL for every session created on an active-but-unscheduled day (the `359df91` path); those carry `program_id` only inside `attributes` JSON, unindexed. Any column-only aggregate silently undercounts exactly the case just shipped.
2. **No program_id/block_id on sessions at all.** Every program rollup must traverse `session → program_day → block → program`, which is why `get_program_session_count` (`services/_program_crud.py:250-260`) is a nested Python loop with no eager loading.
3. **Denormalized progress columns drift.** `programs.goals_completed` / `goals_total` / `completion_percentage` are only refreshed by `_recalculate_program_progress` on goal-completion events (`services/completion_handlers.py:1030-1062`); soft-deletes and un-completions via other paths never refresh them. `is_completed` on blocks/programs is only re-evaluated on a day's false→true transition — day deletion never re-triggers.
4. **`ProgramDaySession` rows are appended without dedupe** (`services/_program_completion.py:44-51`), so `COUNT(*)` over that ledger is wrong.
5. **Junction-table inconsistency:** `program_day_goals` has `deleted_at`, but `program_goals` / `program_block_goals` don't — and `ProgramDay.goals` is `viewonly=True` and **doesn't filter `deleted_at`**, so soft-deleted day-goal links still appear.
6. **Timezone-blind.** `get_active_program_days` uses bare `date.today()` (`services/_program_days.py:459`), and `serialize_program` computes `is_active` from `date.today()` (`services/serializers.py:1033`). Day-keyed metrics would mis-bucket for users far from UTC.
7. **Type asymmetry:** `Program.start_date/end_date` are `DateTime` while `ProgramBlock` dates and `ProgramDay.date` are `Date`, forcing `_date_part` normalization everywhere.
8. **Legacy overlapping programs may exist** — overlap remediation was audit-only and never auto-fixed, so `getActivePrograms(...)[0]` can silently drop co-active programs in old roots.

### Path to S+

Phases 1–2 below target the structural items (1, 2, 5, 6, and the scope-definition conflict) and route around the untrustworthy progress flags and completion ledger by **computing metrics from source rather than reading drifted flags**. S+ also requires more than a bounded query count: the plan now fixes the observation-window semantics, attribution grain, historical meaning, client cache identity/invalidation, response-size and latency budgets, accessibility contract, rollout compatibility, and the public landing preview that still consumes the legacy client metric builders.

Item 7 remains an explicit constraint because date normalization already exists. Legacy overlap data in item 8 is not auto-repaired, but Q43 removes nondeterministic `[0]` defaulting so the same active program is selected consistently.

---

## Decisions (locked)

| # | Decision |
|---|---|
| Q1 | Purpose: adherence scorecard + refinement feedback + outcome attribution |
| Q2 | Fixed, opinionated, non-configurable. Analytics stays the exploration surface |
| Q3 | Summary strip above the calendar **plus** a full Insights view |
| Q4 | Active program by default; calendar selection filters to a block or date range |
| Q5 | A day counts when **any evidence toward program-scoped goals** exists (session need not be program-linked) |
| Q6 | Adherence denominator = **scheduled days** |
| Q7 | Alignment measured on **activity instances and time (duration)** |
| Q8 | Off-program work framed **neutrally** as "other work" |
| Q9 | Canonical scope = **program ∪ block ∪ day goals, expanded to descendants** (no ancestors) |
| Q10 | **Extract one canonical backend resolver**; APIs expose its result and clients consume it instead of redefining membership |
| Q11 | **Live compute behind a cache-ready contract** |
| Q12 | **Add indexed `program_id` / `program_block_id` to sessions**, backfilled |
| Q13 | Strip: Adherence %, Alignment %, Current streak, Program progress |
| Q14 | Insights: adherence heatmap, per-block comparison, goal coverage (incl. **effort share %**), template execution rates |
| Q15 | Insights: volume trend, outcome (targets/goals in-window), day-of-week patterns |
| Q16 | Calendar filter reuses existing block-label click + multi-day select |
| Q17 | **Pure data, no interpretation** — no recommendation engine |
| Q18 | Past programs get the full Insights feature set **plus cross-program comparison**; programs longer than the request cap are explored in explicit ranges |
| Q19 | Day credit is **binary**: any evidence = day met |
| Q20 | **Reuse `resolve_contribution_goal` exactly** — one truth |
| Q21 | Sidebar metrics **replaced** by the new engine, kept compact |
| Q22 | Client passes timezone; route through `resolve_timezone` |
| Q23 | **Programs page only** this pass |
| Q24 | Everything in one pass (phased internally for reviewability) |
| Q25 | Nullable indexed columns + backfill, no data loss |
| Q26 | Show the complete frame + "needs N days of data" note; render valid counts as zero and rates with no denominator as `—` |
| Q27 | No scheduled days → fall back to **calendar-day density, labeled differently** |
| Q28 | Unit + integration + migration reversibility + performance budget tests |
| Q29 | Alignment denominator = **all root activity-instance work in the effective observation window** |
| Q30 | Analytics untouched; program-day completion rules unchanged; calendar stays primary |
| Q31 | Separate the **display window** from the **observation window**; adherence, streaks, density, and sufficiency never treat future dates as misses |
| Q32 | Multi-goal instance duration is **partitioned equally across its eligible contribution goals** for goal coverage, so effort share is a true 100% allocation |
| Q33 | Resolve activity evidence through `resolve_effective_goals_by_activity` and then `resolve_contribution_goal`; an instance counts at most once in alignment |
| Q34 | V1 retrospectives are explicitly **recomputed using current scope, hierarchy, associations, and completion state**; immutable historical attribution is a future schema project |
| Q35 | The backend is authoritative for canonical `seed_goal_ids` / `goal_ids`; client tree expansion is only a tested fallback for already-complete program payloads and render context |
| Q36 | Evidence metrics use all completed root instances; execution metrics use explicitly program-linked sessions; block metrics require explicit block linkage |
| Q37 | A linked session belongs to a recurring template occurrence by the local date of `session_start` (falling back to `completed_at`, then `created_at`) |
| Q38 | Cross-program comparison uses one **batched** aggregation path; it may not run the full query plan once per program |
| Q39 | Metric ranges are clamped to the program and capped at 366 days per request; programs longer than that default to their latest observed 366-day slice and expose range navigation |
| Q40 | Canonical scope intentionally changes Create Session filtering and `off_program_goal_ids`; treat it as an explicit correctness migration with regression tests, not as behavior unchanged |
| Q41 | `as_of` is the caller-timezone local date resolved by the server at request time and is returned in the payload for deterministic interpretation |
| Q42 | Percentages are JSON numbers in `[0, 1]` or `null`; counts and durations are non-negative integers; dates are ISO `YYYY-MM-DD` |
| Q43 | If legacy overlaps produce multiple active programs, default deterministically by latest start date, then latest creation date, then ID; selection remains user-overridable |

---

## Phase 1 — Canonical program scope resolver

**Problem:** four definitions (table above). **Rule:** seeds = program ∪ block ∪ day goals; expand to **descendants only**.

Rationale for descendants-not-ancestors: evidence flows *up* the tree, so work on a sub-goal of a program goal genuinely advances the program. Ancestors are context — including them would sweep in most of the fractal and push alignment toward 100%, destroying the signal.

### Backend

Create **`services/program_scope.py`** as the single backend chokepoint:

```python
@dataclass(frozen=True)
class ProgramScope:
    seed_goal_ids: frozenset[str]
    goal_ids: frozenset[str]

def resolve_program_scope(db_session, root_id, program_id) -> ProgramScope
    # Query all three junction levels directly. Exclude soft-deleted day links,
    # deleted goals, and any seed that is not an active goal in this root.
    # Expand valid seeds through active descendants only.

def resolve_program_scopes(db_session, root_id, program_ids) -> dict[str, ProgramScope]
    # Bulk list/active-day path: one active-goal graph and batched junction loads;
    # never call the single-program resolver in a serialization loop.
```

Reuse the shape of `ProgramService._collect_goal_descendant_ids` (`services/_program_helpers.py:234-257`) but harden it while extracting it: load the active root goal map first, intersect seeds with that map, then walk downward. The existing helper adds unknown seeds to `visited`; the canonical resolver must never return a deleted, cross-root, or nonexistent seed. Have `_program_helpers` delegate to the new resolver so there is one backend implementation.

Fix the underlying soft-delete leak as part of this phase: `ProgramDay.goals` / `serialize_program_day` must exclude `program_day_goals.deleted_at IS NOT NULL`. Do not leave one API returning stale day-goal IDs while the metrics resolver silently filters them. Program list/detail and active-day services pass pre-resolved scopes into serializers; serializers never issue scope queries or trigger per-program lazy loads.

Migrate these call sites to the new resolver:
- `services/_program_helpers.py:260` `_program_scope_goal_ids` and `:268` `_program_allowed_goal_ids` — currently program-seeds-only + a separate block-goal union; the new resolver subsumes both.
- `services/session_lifecycle_service.py:41-49` `_program_goal_ids` — **delete** this raw-SQL flat lookup.
- `services/session_service.py:29-36` `_program_goal_ids` — **delete** the duplicate.

> **Behavioral migration (Q40):** widening scope from flat program goals to all three seed levels plus descendants intentionally changes Create Session filtering and `off_program_goal_ids`. Preserve the `None`-vs-`set()` sentinel at `session_lifecycle_service.py:666` (which distinguishes "no scoping" from "scoping with zero goals"), but update old flat-scope expectations deliberately and add positive coverage for block/day seeds and descendants.

### Client

The server must serialize `scope_seed_goal_ids` and `scope_goal_ids` on full program payloads and active-day program context. This makes backend ownership and soft-delete filtering authoritative and gives Create Session enough information; its current `program_goal_ids` payload contains only program-level seeds.

Create **`client/src/utils/programScope.js`** exporting:

```js
getProgramMetricScopeGoalIds(programOrContext)
buildProgramRenderScopeGoalIds(treeData, metricScopeGoalIds)
```

The first consumes server-provided canonical IDs. It may fall back to descendants-only expansion from `collectProgramGoalIds(program)` only for complete program payloads such as static landing fixtures; active-day/Create Session context must receive server-resolved IDs. The second may add ancestors as de-emphasized context nodes without adding them to the metric scope.

Migrate:
- `client/src/pages/FractalGoals.jsx:157` — consume the canonical metric set, then derive a distinct render set if ancestors are needed for tree coherence.
- `client/src/hooks/useCreateSessionProgramContext.js:44` — consume `scope_goal_ids`; never reconstruct incomplete scope from `program_goal_ids`.
- `client/src/utils/programGoalWindow.js` `buildProgramGoalScope` — delegate its expansion to the shared helper, keeping its window-pruning (`isGoalCompletedOutsideProgramWindow`) as a separate concern.

`getGoalLineageScope` / `getLineagePath` in `flowTreeTreeUtils.js:3-57` stay — they're still used for selected-goal lineage filtering, which legitimately wants ancestors.

FlowTree uses two named sets from the start: `metricScopeGoalIds` (canonical descendants-only set) and `renderScopeGoalIds` (metric set plus any ancestors needed for coherent paths). Context nodes are visually de-emphasized and excluded from alignment, coverage, and Create Session filtering. This is a contract, not a manual fallback discovered late in verification.

---

## Phase 2 — Session→program linkage migration

Add to `models/session.py` (alongside `program_day_id` at `:29`):

```python
program_id = Column(String, ForeignKey('programs.id', ondelete='SET NULL'), nullable=True, index=True)
program_block_id = Column(String, ForeignKey('program_blocks.id', ondelete='SET NULL'), nullable=True, index=True)
```

Add one PostgreSQL expression index `ix_sessions_program_effective_start` on `(program_id, COALESCE(session_start, completed_at, created_at))` for the Q37 occurrence/window path. Do not also add a competing `(program_id, session_start)` index. `program_id` and `program_block_id` retain their simple indexes for equality/grouping queries.

**Alembic migration** (new revision on current head):
1. Add both nullable columns + indexes.
2. Backfill from the FK path: `UPDATE sessions SET program_id = ..., program_block_id = ... FROM program_days JOIN program_blocks ... WHERE sessions.program_day_id = program_days.id`.
3. Backfill the JSON path for rows still NULL: read `attributes->'program_context'->>'program_id'` and `->>'block_id'`. Set `program_id` when that program belongs to `sessions.root_id`. Set `program_block_id` only when the block belongs to that validated program. Do not validate the IDs independently; a mismatched block remains NULL even when the program itself is valid.
4. Downgrade drops indexes and columns. Non-destructive — `attributes` JSON is left completely untouched, so downgrade loses nothing.

Migration assertions, exercised before commit and in tests:
- Every non-null `program_day_id` that resolves through live relational rows has the corresponding `program_id` and `program_block_id`.
- Every non-null `program_block_id` belongs to `program_id`.
- Every non-null `program_id` belongs to `sessions.root_id`.
- Malformed JSON, stale IDs, cross-root IDs, and mismatched program/block pairs remain NULL without aborting the migration.

**Forward writes:** set both columns in `services/session_lifecycle_service.py` in both program-context branches (`:392-413` day-anchored, `:414-435` program-anchored). `_program_days.py:288-298` continues to call that lifecycle path; add an integration assertion rather than a second write implementation. The JSON `program_context` continues to be written unchanged — it remains the display snapshot and downgrade compatibility path; the columns become the query path.

The lifecycle service validates and assigns the program/block pair atomically from loaded relational objects. Callers cannot write the new IDs directly. Add relationships only if a concrete reader needs them; do not introduce a second serializer traversal competing with `program_day` and the JSON snapshot.

`_serialize_session_program_info` (`services/serializers.py:527-549`) keeps its existing relation-then-JSON fallback and gains the new columns as an intermediate preference tier. No response-shape change.

---

## Phase 3 — Program metrics service

New **`services/program_metrics_service.py`**, modeled on the contract discipline of `services/session_template_stats_service.py` but shipping **load → aggregate → serialize** only. Keep private typed aggregation structures separate from the JSON serializer so a future `program_stats` cache can store versioned results without forcing the UI to change (Q11).

```python
class ProgramMetricsService:
    def __init__(self, db_session): ...

    def get_program_metrics(
        self, root_id, program_id, current_user_id, *,
        timezone_name=None, range_start=None, range_end=None, as_of=None,
    ) -> ServiceResult[JsonDict]
```

Follows the repo `ServiceResult` `(payload, error, status_code)` triple and opens with `validate_root_goal(...)` like `SessionAnalyticsService` (`services/session_analytics_service.py:348`). `as_of` is internal/test-only; the HTTP route always uses the server-resolved current date in the requested timezone.

Tenant isolation is structural, not post-filtered: load the program by `(program_id, root_id)` after root ownership validation, and constrain every goals, associations, instances, sessions, and targets statement by the same `root_id`. Never load globally by supplied IDs and discard foreign rows in Python. Cross-root IDs in junctions/JSON are treated as invalid data and excluded.

### Reused primitives (do not reimplement)

| Need | Reuse |
|---|---|
| Activity→goal resolution | `resolve_effective_goals_by_activity` (`services/effective_goal_activities.py`) so direct and group-derived associations follow one rule |
| Evidence eligibility | Apply `resolve_contribution_goal` (`services/goal_contribution.py:42`) to every resolved goal — **exactly**, per Q20 |
| Pause N+1 avoidance | `selectinload(Goal.pause_intervals)`, as `session_analytics_service.py:363,427` |
| Activity completion timestamp | `_effective_activity_completion_timestamp()` = `coalesce(time_stop, updated_at, created_at)` (`session_analytics_service.py:62-64`) |
| Session execution duration | `session_duration_seconds_from_row` (`services/session_filters.py:45-57`); alignment duration uses `ActivityInstance.duration_seconds` only |
| Timezone | `resolve_timezone` (`services/session_filters.py:36-42`) + the `datetime.combine(d, time.min, tzinfo=tz).astimezone(utc)` boundary pattern (`session_filters.py:121-123`) |
| Local-day bucketing | The heatmap pattern at `session_analytics_service.py:228-248` — naive DB datetimes are UTC; `.replace(tzinfo=utc)` before `.astimezone(zone)` |
| Scheduled-day resolution | `_program_day_scheduled_on` (`services/_program_helpers.py:149-160`) — handles both concrete `date` and `day_of_week` recurrence |
| Program scope | Phase 1 `resolve_program_scope` |

**Compute from source, never from drifted flags** — do not read `programs.goals_completed`, `completion_percentage`, or `blocks.is_completed` (drag item 3), and do not `COUNT(program_day_sessions)` (drag item 4; use `DISTINCT session_id` if that ledger is needed at all).

### Window contract

All calculations use inclusive local dates:

```text
display_start     = max(requested_start or program_start, program_start)
display_end       = min(requested_end or program_end, program_end)
as_of             = current date in requested timezone
observation_end   = min(display_end, as_of)
has_observation   = observation_end >= display_start
```

Both range parameters must be supplied together. Reject reversed ranges and ranges with no overlap with the program. Clamp overlapping ranges to the program and return the effective dates. A request may cover at most 366 display days. If no range is supplied and the program is longer, select the latest 366-day slice ending at `min(program_end, as_of)` for active/completed programs or the first 366 days for future programs; return `is_partial: true` and adjacent-range cursors. Future program/range requests have no observation window: rates and streaks are `null`, observed counts are zero, and days are `upcoming`, never missed.

### Payload contract

```jsonc
{
  "program": { "id", "name", "color", "start_date", "end_date", "status",
               "progress": { "elapsed_days", "total_days", "days_remaining",
                             "days_until_start", "rate" } },
  "window":  { "display_start", "display_end", "observation_start", "observation_end",
               "as_of", "timezone", "observed_days", "total_days",
               "is_partial", "scope_label", "previous_range", "next_range" },
  "scope":   { "goal_ids": [...], "seed_goal_ids": [...], "goal_count" },

  "adherence": {
    "mode": "scheduled" | "density",       // Q27 fallback
    "streak_mode": "scheduled" | "calendar",
    "scheduled_days_observed": 24, "scheduled_days_total": 40,
    "met_days": 19, "active_days": 22, "denominator_days": 24, "rate": 0.79,
    "current_streak": 4, "longest_streak": 9,
    "unscheduled_days_with_evidence": 3
  },

  "alignment": {                            // denominator = ALL instance work in observation window (Q29)
    "instances": { "aligned": 88, "total": 104, "rate": 0.846 },
    "duration_seconds": { "aligned": 41400, "total": 52200, "rate": 0.793 },
    "other_work": { "instances": 16, "duration_seconds": 10800,
                    "goals": [{ "goal_id", "name", "instances",
                                "allocated_duration_seconds" }] }
  },

  "days": [ { "date": "2026-08-12", "state": "scheduled_met",
              "scheduled": true, "observed": true, "met": true,
              "instances": 6, "duration_seconds": 3300,
              "weekday": 2, "block_ids": ["..."] } ],

  "blocks": [ { "block_id", "name", "color", "start_date", "end_date",
                "adherence": {...}, "alignment": {...},
                "aligned_instances", "aligned_duration_seconds",
                "linked_sessions", "linked_duration_seconds" } ],

  "goal_coverage": [ { "goal_id", "name", "level", "is_seed", "seed_level",
                       "credited_instances",
                       "allocated_duration_seconds": 12834,
                       "effort_share": 0.31,
                       "last_evidence_at", "days_since_evidence",
                       "completed_in_window", "targets_met_in_window" } ],

  "templates": [ { "template_id", "name", "color",
                   "scheduled_occurrences", "completed_occurrences",
                   "extra_completions", "completion_rate", "is_required",
                   "last_completed_at" } ],

  "volume": [ { "period_start", "sessions", "instances", "duration_seconds" } ],
  "weekday": [ { "weekday": 0, "scheduled_days_observed", "met_days",
                 "instances", "duration_seconds" } ],

  "outcomes": { "goals_completed_in_window": 3, "goals_in_scope": 11,
                "targets_met_in_window": [ { "target_id", "goal_id", "name", "met_at" } ],
                "targets_open": 4, "attribution": "current_state" },

  "data_sufficiency": { "has_data": true, "observed_days": 24,
                        "minimum_days": 7, "message": null },

  "semantics": { "attribution": "current_state", "effort_allocation": "equal_split",
                 "execution_linkage": "explicit" },
  "calculation_version": 3
}
```

`calculation_version` is the Programs metrics contract version so a formula change can invalidate a future cache. Version 3 consumes the canonical occurrence evaluator's stable chain roles, active-break facts, and per-calendar-day minimum-template semantics.

### Metric semantics (precise)

- **Activity evidence grain.** Load every completed, non-deleted activity instance in a non-deleted session in the root whose effective activity timestamp falls inside the UTC boundaries of the observation window; the containing session need not itself be complete. Resolve effective direct/group activity goals, apply `resolve_contribution_goal` at the instance timestamp, and deduplicate goal IDs per instance. The instance itself is counted once even when it contributes to multiple goals. `duration_seconds` is `max(ActivityInstance.duration_seconds or 0, 0)`; session duration is never substituted into alignment.
- **Adherence.** Enumerate program-day occurrences via `_program_day_scheduled_on`, then collapse them to **distinct local calendar dates** for the program-level denominator; two configured days/blocks on one date still equal one scheduled day. Calculate misses and the denominator only through `observation_end`. An observed scheduled date is **met** if ≥1 eligible instance on that local date resolves to a goal in canonical scope (Q5, Q19 binary). `rate = met_days / scheduled_days_observed`. Future scheduled dates use `state: "upcoming"`. If there are zero observed scheduled days, use density mode only when there is an observation window: `active_days / observed_days`, displayed as **"Active days: N of M"** rather than "Adherence". With no observation window, `rate` is `null`.
- **Streak.** Consecutive observed *scheduled* occurrences met, walking backward from `observation_end`; unscheduled dates are skipped and future dates are ignored. A scheduled miss breaks the current streak. Longest streak is calculated only over observed scheduled occurrences. Density mode returns active-calendar-day current/longest streaks under explicitly density-labeled fields.
- **Alignment.** Denominator = every eligible completed activity instance and its instance duration in the root during the observation window (Q29), regardless of program linkage. Numerator = instances with at least one eligible contribution goal in canonical program scope. Both instance and duration rates are `null` when their denominator is zero.
- **Other work.** The complement consists of instances with no eligible in-scope contribution goal and is presented neutrally as "Other work" (Q8). Group it across eligible out-of-scope goals using the same equal duration allocation; instances with no eligible goal use a `goal_id: null`, `name: "Unassociated"` bucket. This is where `off_program_goal_ids` becomes readable, but derive it from live evidence rather than the advisory stored field.
- **Goal coverage and effort share.** For an aligned instance with `N` eligible in-scope contribution goals, allocate `duration_seconds / N` to each goal. Per-goal `effort_share = allocated_duration_seconds / total_aligned_duration_seconds`; shares sum to 1.0 within floating-point tolerance when aligned duration is non-zero. Evidence counts may overlap across goal rows and are labeled "credited instances." Zero-duration aligned instances affect instance counts but not effort share.
- **Program/block execution.** Program session counts and execution duration use completed, non-deleted sessions with `Session.program_id == program.id`. Block rows use `Session.program_block_id == block.id`; unassigned program-linked sessions remain in program totals and an optional `unassigned_block` bucket, never guessed from dates.
- **Day/block evidence rollups.** `days.instances` / `days.duration_seconds` and the evidence portion of block rows contain aligned activity evidence only. A day exposes every matching `block_id` because legacy block ranges may overlap. Block adherence/alignment windows are calculated independently from the intersection of the effective display/observation window and block dates; overlapping block rows are not additive and the table states that. Execution fields remain explicitly linked as above.
- **Template execution.** Per template linked to program-day occurrences: scheduled occurrences are observed occurrences in-window referencing it. A completion is a distinct completed, non-deleted session linked to the program/day with the same `template_id`, assigned to the local occurrence date of `session_start`, falling back to `completed_at`, then `created_at`. Multiple sessions cannot make one occurrence exceed one completion; expose an `extra_completions` count separately. Carries `is_required` from `program_day_templates`.
- **Volume.** Aligned activity evidence volume, not program-linked session volume. Weekly buckets by default; daily when the display window is ≤ 21 days. Block boundaries are returned for annotation. Session counts in a bucket are distinct sessions containing aligned evidence.
- **Outcomes.** Current, non-deleted goals in scope whose present `completed_at` falls in the display window; current, non-deleted targets whose persisted `completed_at` falls in-window. Reuse persisted target completion fields and `GoalTargetService` serialization, not threshold recomputation. The UI states that v1 retrospectives are recomputed from current records and can change after edits/uncompletion (Q34).
- **Program status.** Metrics status is date-derived in the requested timezone: `upcoming`, `active`, or `ended`. Do not use drift-prone `Program.is_completed` to decide whether Insights or comparison is available.
- **Program progress.** Temporal progress always uses the full program dates, independent of a block/custom metrics range. `elapsed_days` is clamped to `[0, total_days]`; upcoming programs expose `days_until_start`, ended programs expose zero `days_remaining`, and `rate` is always bounded `[0, 1]` when program dates are valid.
- **Data sufficiency.** `observed_days` is the number of calendar dates in the observation window, not scheduled days and not days with data. `has_data` is true when the window contains at least one completed activity instance or explicitly linked completed session. `minimum_days = 7` is presentation guidance only; it never suppresses valid metrics. Future programs return a distinct "Program has not started" message.

### Query strategy

Target **≤ 8 actual SQL statements** for a single-program request regardless of program size:
1. Owned program + blocks + days + template links as one bounded flattened load with only aggregation fields.
2. Active root goals.
3. Pause intervals for those goals (the `selectinload` statement is counted explicitly).
4. Program/block/day junction seeds in one `UNION ALL`, filtering soft-deleted day links.
5. Completed activity instances in the UTC observation boundaries, joined only to session fields needed for root/deletion filtering and distinct-session volume; collect the present activity-definition IDs.
6. Direct activity edges, goal→group edges, group hierarchy edges, and group→activity edges for those activity IDs in one normalized bulk/union statement. Combine them with the goal graph and `inherit_parent_activities` from statement 2, then run the same in-memory semantics as `resolve_effective_goals_by_activity`.
7. Completed program-linked sessions in the display boundaries using the indexed effective timestamp expression.
8. Active targets for scope goals.

Goal completions come from query 2; do not query the same goals again. Avoid hidden ORM lazy loads in the aggregation phase. If the existing effective-goal resolver cannot use statement 6 directly, extract a bulk row resolver that preserves its semantics and add parity tests against the existing resolver.

Scheduled-day enumeration, day bucketing, and all rollups happen in Python over these bounded result sets — no per-day, per-goal, template, or per-block queries. Explicitly avoid the `goal_analytics_service.py` anti-pattern (load everything, no windowing). Instrument SQL statement count in tests and record aggregate duration and serialized byte size in debug logs without including user content.

### Cross-program comparison (Q18)

Second method on the same service:

```python
def get_program_comparison(self, root_id, current_user_id, *, anchor_program_id=None, limit=5, timezone_name=None)
```

Returns a compact per-program row (`adherence.rate`, `alignment.duration_seconds.rate`, aligned duration, instances, met/observed-scheduled days, effective window label, status) for the N most recently ended programs, ordered by end date descending with stable ID tie-breaking. Maximum `limit` is 5. When supplied, an owned, ended `anchor_program_id` is always included and the remaining rows are the nearest previously ended programs; an invalid/foreign anchor returns 404. Each comparison row uses the same default-window rule as the primary endpoint, including the latest observed 366-day slice for longer programs, and exposes its effective window so unlike durations are never silently compared.

The comparison loader batches the selected programs, unioned display/observation window, goal graph, association inputs, evidence, and targets, then calls the same pure aggregation function once per in-memory program bundle. It must not invoke `get_program_metrics` in a loop. Target **≤ 10 SQL statements total** for five programs.

---

## Phase 4 — API

In `blueprints/programs_api.py`, matching the existing `@token_required` + `ProgramServiceValidationError` + `finally: session.close()` conventions:

```
GET /api/<root_id>/programs/<program_id>/metrics
    ?timezone=America/New_York
    &range_start=YYYY-MM-DD      (optional, calendar-driven)
    &range_end=YYYY-MM-DD        (optional)

GET /api/<root_id>/programs/metrics/comparison
    ?timezone=...&limit=5&anchor_program_id=<selected-program-id>
```

Invalid timezone → `400` with the repo's canonical error envelope; one missing range bound, reversed dates, a non-overlapping range, or more than 366 effective days → `400 "Invalid date range"`; not owned → 404. Unknown query parameters are ignored consistently with existing endpoints. Wrap in `etag_json_response` like `GET /programs` (`:40`); because the body includes server-resolved `as_of` and live evidence, its ETag naturally changes when the response changes.

**Also fix the timezone blindness while in here** (Q22): accept the same optional `timezone` parameter on program list/detail and `GET /programs/active-days` (`:340-367`). `_program_days.py:459` and `serialize_program` receive one resolved local `as_of` date instead of calling `date.today()` independently. The client always sends its timezone. Omitted timezone retains UTC/server-default compatibility for older clients, and tests pin both paths. List, detail, metrics, and active-day endpoints must agree on active status at a timezone date boundary.

Full program and active-day responses gain `scope_seed_goal_ids` / `scope_goal_ids`. This is an additive response change. Preserve legacy `program_goal_ids` during the rollout because older clients still consume it.

Client helpers in `client/src/utils/api/fractalProgramsApi.js`: `getProgramMetrics(rootId, programId, params)` and `getProgramMetricsComparison(rootId, params)`.

Query keys in `client/src/hooks/queryKeys.js`:
```js
programMetricsRoot: (rootId) => ['program-metrics', rootId],
programMetrics: (rootId, programId, timezone, rangeStart, rangeEnd) =>
  ['program-metrics', rootId, programId, timezone, rangeStart || null, rangeEnd || null],
programMetricsComparison: (rootId, timezone, anchorProgramId, limit = 5) =>
  ['program-metrics-comparison', rootId, timezone, anchorProgramId || null, limit],
```

There is no existing shared program invalidation cluster in `client/src/utils/queryInvalidation.js`. Add `invalidateProgramMetrics(queryClient, rootId, queryKeys)` and call it from:
- Program/block/day/template/scope mutations.
- Session create, update, complete/reopen, pause/resume, and delete.
- Activity instance create/update/complete/uncomplete/delete and circuit mutations.
- Direct/group activity-goal association mutations.
- Goal create/move/archive/delete, completion/uncompletion, and pause/resume.
- Target create/update/delete/evaluation paths.

Tests for each mutation family assert the root prefix is invalidated. Prefix invalidation intentionally refreshes every active range/timezone variant for that root.

---

## Phase 5 — Frontend

### 5a. Data hook

**`client/src/hooks/useProgramMetrics.js`** — `useProgramMetrics(rootId, programId, { timezone, rangeStart, rangeEnd })`, keyed by root, program, timezone, and normalized range. Timezone comes from the existing `TimezoneContext`. The hook uses `enabled` guards, retains the prior range only while fetching the same program/timezone, exposes initial versus background loading separately, and sends both range bounds or neither. While mounted, schedule one invalidation at the next midnight in that timezone so `as_of`, active status, streaks, and newly missed days do not remain stale across a date boundary.

Centralize Q43 ordering in the existing active-program selection helper: active candidates sort by start date descending, creation date descending, then stable ID ascending. Programs and Create Session consume that helper; an explicit user selection always wins. Do not scatter another `[0]` policy into the metrics hook.

### 5b. Summary strip (Q3, Q13)

**`client/src/components/programs/ProgramMetricsStrip.jsx`** — inserted in `ProgramCalendarPage.jsx` between `PageHeader` (:754) and `.calendarPanel` (:756), inside `mainColumn`. Needs `flex-shrink: 0`; the calendar is `flex: 1` in an `overflow: hidden` column, so the strip must have a bounded height (~72–88px desktop).

Four tiles: **Adherence** (or "Active days" in density mode), **Alignment**, **Streak**, **Program progress** (full-program elapsed/total + days remaining). Each tile shows value, label, and a small sub-label with the raw fraction. The first three follow the active metrics range; Program progress remains whole-program and says "Starts in N days" when upcoming. Future programs display `—` for the first three tiles and never display `0%` before observation begins.

Build on the declarative pattern in `MetricCardWidget.jsx` (`METRIC_DEFINITIONS` array of `{ key, label, value(payload), subLabel(payload) }`) rather than inventing a new one. `StatCard` (`components/analytics/visualizations/shared/StatCard.jsx`) is close but its styles are coupled to `ProfileWindow.module.css` — **extract a neutral `StatTile` into `client/src/components/common/`** and have both use it, rather than importing analytics CSS into Programs.

Mobile: horizontal scroll rail with 44px touch targets, consistent with the existing mobile Programs header contract. Respects `--z-sheet` layering — the strip must never overlay the mobile side-pane sheet. The rail has an accessible group label and does not trap horizontal keyboard navigation.

### 5c. Insights view (Q3, Q14, Q15)

Extend `viewMode` in `ProgramCalendarPage.jsx:103` from `'calendar' | 'blocks'` to include `'insights'`, add a third `styles.toggleButton` in `viewActions` (:711-743), and a third branch in the panel render (:756-801) reusing `mainColumnBlocksMode`'s scrolling (`overflow-y: auto`, no border).

**`client/src/components/programs/ProgramInsightsView.jsx`** composing seven sections, in this order:

1. **Adherence heatmap** — per-day grid across the display window. Five states: scheduled+met, scheduled+missed, unscheduled+evidence, observed rest, upcoming. Block boundaries marked. **Net-new component** — no heatmap primitive exists in the codebase.
2. **Per-block comparison** — table: block, dates, adherence, alignment, sessions, instances, duration. Block colors preserved.
3. **Goal coverage** — table: goal (level icon + color), credited evidence count, allocated duration, **effort share %**, last touched / days since, completed-in-window. Rows click through to `GoalDetailModal` (already wired on this page at :1078). Footnote explains equal duration allocation for multi-goal evidence and why credited instance counts can overlap while shares still total 100%.
4. **Template execution** — table: template (color badge), required/optional, completed/scheduled, rate, last completed.
5. **Volume trend** — `react-chartjs-2` `<Bar>` with block boundary annotations, using `useChartThemeDefaults()` and `DISABLED_CHART_ANIMATION` from `components/analytics/ChartJSWrapper.jsx` (mandatory for theming).
6. **Day-of-week patterns** — scheduled vs met per weekday.
7. **Outcomes** — goals completed in-window, targets met in-window, targets still open.

Then, for date-derived `ended` programs, an eighth **cross-program comparison** section (Q18), lazy-loaded only when that section approaches the viewport or is explicitly expanded. Failure of comparison data does not fail the primary retrospective.

**Q17 is binding: pure data, no interpretation.** No "you should…" copy, no recommendation engine, no auto-actions. Default sort order must be factual and stable (program order, then goal tree order); users may choose low-adherence or stale-first sorts, but the UI does not silently frame them as recommendations.

Every visual has a semantic heading and a table/text equivalent. Heatmap cells are keyboard reachable only when interactive, expose full date/state/count labels, and never rely on color alone. Charts use theme tokens, visible focus, reduced-motion behavior, and accessible summaries. Tables retain headers on narrow scroll containers and use real buttons/links for drill-through rows.

### 5d. Calendar as scope filter (Q16)

Reuse what exists for ordinary programs/ranges:
- `onBlockLabelClick` (already wired through `ProgramCalendarView.jsx:183-235`) → set metrics range to that block.
- "Select Multiple Days" mode + `selectedRange` → set metrics range to the selection.
- The active scope renders as `window.scope_label` in the strip ("Whole program", "Block 2: Intensification", "Aug 4 – Aug 17") with a clear affordance back to whole-program.

Range state is owned by `ProgramCalendarPage`, normalized to inclusive `YYYY-MM-DD`, and reset when the selected program changes. A block click sets both dates from the block. A multi-day selection is clamped by the backend, then the page renders the returned effective range rather than assuming the request was accepted unchanged. Selection applies consistently to strip, Insights, and sidebar; each surface displays the same range label so the calendar interaction is never hidden.

When `window.is_partial` is true because a program exceeds 366 days, Insights adds compact Previous/Next range controls from the returned cursors and labels the visible interval. This is the only net-new range control; it is required so long legacy programs remain fully explorable without unbounded requests.

### 5e. Sidebar replacement (Q21)

Rewrite the `ProgramSidebar.jsx:44-71` metrics block to consume the same `useProgramMetrics` result owned by the page instead of issuing a duplicate query or calling `buildProgramMetrics`. Keep it compact (adherence, alignment, linked execution duration, days remaining) and show the active range label. This also removes the `completedProgramDays ?? completedSessions` duplicate-field drift at `:51` and `:66`.

The authenticated Programs page deletes `buildProgramMetrics` (`programViewModel.js:687-723`) and `buildBlockMetrics` (:759-794) once no production reader remains. `LandingFeaturePrograms.jsx` currently imports `buildProgramSidePaneData`, so preserve a deliberately named, fixture-only `buildLandingProgramPreviewMetrics` in the landing feature module (or store static metrics in the published example payload) before removing the shared builders. No network metrics request is made from the public landing preview. Keep `buildProgramDayOccurrences`, `getScheduledProgramDayCompletion`, `flattenProgramSessions`, and `buildProgramDaysMap` because calendar/block rendering still needs them.

### 5f. Empty / insufficient data (Q26)

Render the full frame plus `data_sufficiency.message` ("Needs 7 observed days — 2 so far"). Counts legitimately render as zero. Rates render as `—` when the denominator is zero, never `0%` or `NaN%`. Future programs say "Program has not started" and use upcoming heatmap states. Initial loading uses stable skeleton geometry; background range refetch preserves the previous frame with an `aria-live` updating status. Endpoint errors provide retry without replacing the calendar.

---

## Phase 6 — Rollout, compatibility, and observability

Ship in reviewable commits while Q24 remains one product pass:
1. Canonical scope + additive scope response fields + deliberate Create Session behavior migration.
2. Nullable session linkage migration, backfill, forward writes, and serializers.
3. Pure aggregation fixtures + metrics/comparison service + API.
4. Query identity/invalidation + strip/sidebar replacement + removal/isolation of legacy metric builders.
5. Insights, accessibility, responsive behavior, and comparison lazy loading.
6. Documentation, full verification, and production-readiness audit.

Deploy the additive migration before code that writes/queries the new columns. During a rolling deploy, new code must tolerate NULL columns on legacy rows through the relational/JSON fallback; old code continues to ignore additive columns and receives legacy response fields. Do not remove `program_goal_ids` or the JSON `program_context` in this pass.

Add structured timing logs for each metrics request: calculation version, program ID, effective display days, evidence row count, SQL statement count when instrumentation is enabled, compute milliseconds, and response bytes. Never log goal names, activity names, target names, or raw payloads. Record route error rate and latency in the existing service logging/monitoring path. A future cache is triggered by measured production behavior, not by speculative duplication.

Rollback order: revert application code first, then downgrade the additive migration only after no deployed instance reads or writes the columns. The JSON snapshot and `program_day_id` remain available, so rollback does not delete user-authored session/program context.

---

## Files

**New (backend)**
- `services/program_scope.py`
- `services/program_metrics_service.py`
- `migrations/versions/<rev>_add_session_program_columns.py`

**New (frontend)**
- `client/src/hooks/useProgramMetrics.js`
- `client/src/components/common/StatTile.jsx` (+ module CSS)
- `client/src/components/programs/ProgramMetricsStrip.jsx` (+ module CSS)
- `client/src/components/programs/ProgramInsightsView.jsx` (+ module CSS)
- `client/src/components/programs/insights/` — `AdherenceHeatmap.jsx`, `BlockComparisonTable.jsx`, `GoalCoverageTable.jsx`, `TemplateExecutionTable.jsx`, `VolumeTrendChart.jsx`, `WeekdayPatternChart.jsx`, `OutcomesPanel.jsx`, `ProgramComparisonTable.jsx`
- `client/src/utils/programScope.js`

**Modified (backend)**
- `models/session.py` — two columns + indexes
- `models/program.py`, `models/goal.py` and/or `services/serializers.py` — canonical soft-delete filtering for day-goal relationships/payloads
- `services/_program_crud.py` — bulk canonical scope injection plus timezone-aware list/detail serialization without N+1 queries
- `services/_program_helpers.py` — move the descendant walker out; delegate scope
- `services/session_lifecycle_service.py` — delete `_program_goal_ids`; write new columns in both branches; **preserve the `None` sentinel**
- `services/session_service.py` — delete the duplicate `_program_goal_ids`
- `services/_program_days.py` — verify lifecycle-populated columns in `schedule_block_day`; accept a resolved local date in `get_active_program_days`
- `services/effective_goal_activities.py` — add a bounded bulk resolver only if the existing resolver cannot meet the metrics query budget
- `services/serializers.py` — `_serialize_session_program_info` prefers new IDs; program serialization receives resolved `as_of`; additive canonical scope IDs
- `blueprints/programs_api.py` — two new routes + timezone on list/detail/active-days

**Modified (frontend)**
- `client/src/pages/ProgramCalendarPage.jsx` — strip insertion, third view mode, calendar range wiring
- `client/src/pages/ProgramCalendarPage.module.css`
- `client/src/components/programs/ProgramSidebar.jsx`
- `client/src/components/programs/ProgramCalendarView.jsx` — surface range selection to the page
- `client/src/components/analytics/visualizations/shared/StatCard.jsx` and `ProfileWindow.module.css` — delegate neutral tile structure/styles to `StatTile` while preserving analytics appearance
- `client/src/hooks/useProgramDetailViewModel.js` — drop local metric builders
- `client/src/utils/programViewModel.js` — delete authenticated-app metric builders after consumers migrate
- `client/src/components/landing/LandingFeaturePrograms.jsx` and/or `landingFeatureModel.js` — isolate static public-preview metrics before shared builder deletion
- `client/src/utils/programGoalWindow.js` — delegate expansion
- `client/src/pages/FractalGoals.jsx`, `client/src/hooks/useCreateSessionProgramContext.js` — canonical resolver
- `client/src/utils/api/fractalProgramsApi.js`, `client/src/hooks/queryKeys.js`, `client/src/utils/queryInvalidation.js`

**Docs**
- `index.md` — Programs and Templates section: new metrics engine, canonical scope rule, session program columns
- `planning/program-metrics-insights.md` — keep implementation status and final contracts synchronized during the pass

---

## Verification

**Migration**
```bash
alembic upgrade head && alembic check          # no drift
alembic downgrade -1 && alembic upgrade head   # reversible
```
Confirm backfill: no session with non-null `program_day_id` has null `program_id`; every `program_id` references a live program. Backend CI's existing gates (upgrade-to-head, drift, one-step down/up) must pass.

Seed migration fixtures for: relational day linkage, valid JSON-only program linkage, valid program+block JSON linkage, malformed JSON, stale IDs, cross-root program ID, and a block/program mismatch. Assert only relationally consistent pairs backfill. Re-run upgrade against a partially populated state to prove the data migration is idempotent at the SQL-result level.

**Backend tests**
- `tests/unit/services/test_program_scope.py` — seeds from all three attachment levels, descendant expansion, no ancestors in metric scope, ancestors in render context only, soft-deleted day links/goals excluded, cross-root/nonexistent seeds excluded, empty program, and deep nesting.
- Shared contract fixtures under `tests/fixtures/program_metrics/` — input graph/evidence and expected scope/day/aggregate JSON. Backend aggregation and client formatting tests consume the same JSON fixtures; do not call two independent scope implementations a parity test when the client normally consumes server IDs.
- `tests/unit/services/test_program_metrics.py` — display versus observation windows; active, future, completed, partial, and 366-day programs; future scheduled days not missed; scheduled and density modes; current/longest streak; binary day credit; effective direct/group associations; per-instance dedupe; instance versus session duration; equal multi-goal allocation summing to 1.0; zero-duration evidence; paused/completed-before-event/work-during-pause exclusion; other-work complement; timezone/DST boundaries; empty and single-day programs.
- Execution tests — linked versus unlinked sessions; program-linked/no-block bucket; block linkage; recurring-day occurrence matching via `session_start` and fallbacks; duplicate sessions capped at one completion with extras reported; incomplete/deleted sessions excluded; distinct session counts.
- Outcome tests — current persisted goal/target completion in-window, soft-deleted records excluded, uncompletion reflected, and response metadata/copy declaring current-state recomputation.
- `tests/integration/test_programs_api.py` — ownership 404; cross-root program/goal/activity/session/target fixtures never leak into payloads; timezone agreement across list/detail/active-days/metrics; invalid timezone; missing/reversed/non-overlapping/oversized range; clamping; response schema and numeric invariants; ETag/304 behavior; additive scope fields; comparison limit, owned-anchor inclusion/404, ordering, and batch behavior.
- Performance hard gates on a deterministic PostgreSQL fixture representing 366 days, 20 blocks, 100 program days, 5,000 sessions, 20,000 instances, 250 goals, and five comparison programs: single metrics ≤ 8 SQL statements, five-program comparison ≤ 10, no lazy-load SQL after the load phase, and serialized response < 1 MiB.
- Dedicated warmed-PostgreSQL benchmark target: single-program p95 ≤ 750 ms and comparison p95 ≤ 1.5 s over 20 runs on the CI performance runner. Wall-clock thresholds live in the dedicated job, not ordinary unit jobs; a regression blocks release until explained or budgeted.
- Existing `tests/unit/services/test_programs.py` and `tests/integration/test_sessions_api.py:113-146` must still pass — the latter pins `off_program_goal_ids`, so update its expectation deliberately if the widened scope changes it, and note the change in the commit message.

**Frontend tests**
- `ProgramMetricsStrip.test.jsx` — four tiles, density-mode label swap, `—` for null denominators, sufficiency message.
- `ProgramInsightsView.test.jsx` — all sections render; empty/future/error/loading frames; factual stable sorting; lazy and independently failing comparison.
- `AdherenceHeatmap.test.jsx` — five day states, block boundaries, non-color labels, keyboard semantics, and table/text equivalent.
- `programScope.test.js` — canonical server IDs are consumed unchanged; fallback expansion is restricted to full/static program payloads; render ancestors never enter metric scope.
- `useProgramMetrics.test.jsx` — full query identity, two-bound range request, program-change reset, background fetching, next-local-midnight invalidation, and timezone change isolation.
- Mutation invalidation tests cover every mutation family listed in Phase 4 and assert `programMetricsRoot(rootId)` invalidation.
- Existing `ProgramSidebar.test.jsx` updated for the new data source.
- Existing analytics `StatCard` / `ProfileWindow` tests pin visual semantics after the neutral `StatTile` extraction.
- Run axe/accessibility checks for strip, heatmap, tables, charts, range-clear action, and mobile rail. Verify light/dark/high-contrast themes and reduced motion.

**Manual (`/run`)**
1. Open a program with history → strip shows four tiles; numbers plausible against the calendar.
2. Click a block label → strip and Insights rescope; label reads the block name.
3. Select a multi-day range → same, label reads the date range.
4. Insights view → all seven sections render; heatmap day states match the calendar and future dates show upcoming rather than missed.
5. Complete a session on a scheduled day → adherence and streak increment after invalidation.
6. Complete a session on an unscheduled day → counts toward alignment, appears as unscheduled-with-evidence in the heatmap, does not change the adherence denominator.
7. Pause a scope goal, log work, resume → that work is excluded (confirms `resolve_contribution_goal` reuse).
8. Brand-new active program → zero-count frame + sufficiency message, no `NaN%`; future program → `—` rates and "Program has not started."
9. Program with no scheduled days → "Active days: N of M", no adherence percentage.
10. Completed program → retrospective + cross-program comparison.
11. Mobile → strip scrolls as a rail; Insights readable; side-pane sheet still layers above the strip.
12. Goal tree with an active program → scope still renders coherently after the ancestor-removal change (**the main regression risk from Phase 1**).
13. Keep the page open across a mocked local midnight → `as_of`, status, streak, and missed/upcoming states refresh once.
14. Edit an activity→goal association or move a goal → metrics invalidate and the retrospective-current-state notice remains visible.
15. Public landing program preview → still renders without authentication or a metrics API request after legacy builder removal.
16. Keyboard/screen reader → every visual has an equivalent label/table path; mobile horizontal regions remain operable at 320 CSS px and 200% zoom.

---

## Risks

| Risk | Mitigation |
|---|---|
| Ancestor removal orphans FlowTree nodes | Maintain separate metric/render scope sets from Phase 1; ancestors are context nodes and never enter metrics or Create Session filtering. |
| Scope widening changes Create Session and `off_program_goal_ids` | Treat as the explicit Q40 behavior migration; preserve the sentinel, update pinned tests deliberately, and verify program/block/day seeds end to end. |
| Server/client scope inputs differ | Server returns canonical scope IDs on full program and active-day payloads; client fallback is restricted to static/full fixtures. |
| Backfill accepts mismatched JSON IDs | Validate through program→block and program→root joins; leave NULL on malformed, stale, cross-root, or mismatched input. JSON remains the runtime/rollback fallback. |
| Future dates appear as failures | Observation window ends at local `as_of`; future days have an explicit upcoming state and are excluded from denominators/streaks. |
| Multi-goal work inflates coverage | Equal allocation partitions duration; dedupe goals per instance and assert effort shares sum to 1.0 within tolerance. |
| Current edits rewrite past retrospectives | Return calculation semantics/version and show a concise current-state recomputation note; immutable historical attribution is not claimed in v1. |
| Metrics endpoint slow on large programs | Hard query/response gates, dedicated latency job, 366-day cap, batched comparison, structured timings, and a cache-ready contract. |
| Metrics stay stale after indirect evidence changes | One root-prefix invalidation helper with mutation-family tests plus next-local-midnight invalidation. |
| Strip crowds the calendar | Bounded `flex-shrink: 0` height; step 12 checks the calendar still breathes. Q30 keeps the calendar primary. |
| Legacy builder deletion breaks public landing | Isolate a landing-only static preview builder/payload and test that it makes no authenticated metrics request. |
| Visual insights are inaccessible | Semantic/table equivalents, non-color labels, axe checks, reduced motion, keyboard testing, 200% zoom, and 320px manual verification. |

## Accepted constraints (not addressed)

- `Program.start_date/end_date` are `DateTime` while block/day dates are `Date`; `_date_part` normalization already handles it.
- Legacy overlapping programs may exist in old roots and are not auto-remediated. Q43 makes defaulting deterministic, and metrics remain per explicitly selected program.
- Drifted `is_completed` / `goals_completed` / `completion_percentage` columns are left alone (Q30) — metrics compute from source and never read them.
- Program scope, hierarchy, activity associations, pause history, and current completion fields are not immutable event snapshots. V1 completed-program retrospectives are transparently recomputed from current records (Q34).
- The additive `program_id` / `program_block_id` columns describe explicit session execution context; they do not attempt to infer a program merely because root work happened to align with its goals.
