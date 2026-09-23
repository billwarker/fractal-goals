# Program Day Review: Activity Summary, Goal Alignment, and Off-Plan Session Credit

**Implementation status (2026-09-23):** Implemented. The backend evaluator, credit table and
migration (`c7d9e1f3a5b8`), credit endpoint, read model v4, metrics calculation v5, and the review-first
client pane are complete with unit, integration, query-budget, and component tests. Measured budgets:
the detail day request stays constant at ≤32 statements as sessions grow; metrics and comparison each
add one bounded credit query. Browser/manual acceptance below is still outstanding.

**Review follow-up (2026-09-23):** Future dates return `summary: null` and never render a summary.
Off-plan sessions render as a group inside the first program-day card (date-level, beside its status
menu) rather than a separate card; unscheduled dates keep a plain "Sessions" card. The day-scope
header drops the program-name back button (background click still returns to program scope) and
places Collapse on the same row as the previous/next arrows and date.

**Second follow-up (2026-09-23):** The whole-date Day summary card and its `detail.summary` projection
(goals/targets completed, day-level alignment) were removed; per-session alignment remains. Past
unscheduled dates with no sessions show "No sessions logged on this day." Each range-summary day now
carries `completed_sessions` (`id`, `name`) for completed sessions in any program,
loaded in one bounded query. Dates with a selected-program ribbon show only that ribbon (session dots
were tried and removed); dates without one list each completed session name as plain text with no background.
Each ribbon ends with the day pane's status symbol (check met, X missed, blue circle scheduled),
from one shared `getProgramDayStatusSymbol` rule and `ProgramDayStatusMark` component.

## Context

The Programs day pane is built for planning: if nothing is scheduled on a date, it shows **Plan this day**, even for dates in the past. On past dates the useful question is *what happened, and did it serve this program's goals?* The pane can't answer that today:

1. **Sessions go missing.** A session linked to this program but not to a program day scheduled on that date appears nowhere. `ProgramDayReadModelService._detail` only shows sessions matched to a scheduled occurrence. `_load_other_sessions` only returns sessions from *other* programs (`program_id != program`).
2. **Completed work is hidden on partial and missed days.** `ProgramDayPane` only renders session rows when `requirements.requirements_met`.
3. **There is no alignment view for a day.** Every completed activity instance already resolves to `in_scope_ids`/`out_scope_ids` (`ProgramMetricsService._resolve_evidence`). The day pane never shows it.
4. **Completion requires exact linkage.** A day only counts as complete through sessions linked to that exact program day and date. If the user runs a scheduled template from the Sessions page without the program link, the day is marked missed.

**Intended outcome (decisions confirmed):**
- Any date up to today shows a **day summary**: sessions, time, activities, goal alignment, and goal/target outcomes.
- **Automatic credit:** a completed session whose template is scheduled on that date counts toward the day automatically, even without an exact program-day link.
- **Manual credit:** an off-plan session whose template isn't scheduled on that date is shown with its alignment and a one-click **Count as ‹template›**. Automatic credits can be excluded with **Don't count**.
- **Past dates are review-only.** "Plan this day" appears only for today and future dates. Retroactive scheduling stays in the Blocks view.

---

## Grade of the current implementation against this plan: **B−**

| Area | Grade | Why |
|---|---|---|
| Canonical domain model | **A−** | One evaluator (`program_day_occurrences.py`), date-level dedup, manual overrides table, bounded chain window, timezone-safe dates. A strong base to extend. |
| Session visibility / correctness | **D** | Program-linked sessions that don't match a scheduled occurrence silently disappear from the day detail. Completed sessions are hidden on partial and missed days. |
| Credit / occurrence write model | **C** | There is nowhere to record occurrence-level intent such as "this session counts for that day". The legacy `ProgramDaySession` ledger is duplicate-prone and unusable for this. Completion requires an exact link the user may not have made. |
| Alignment evidence | **B+** | Per-activity in-scope and out-of-scope resolution already exists and is governed. It isn't projected per day or per session. |
| Day-pane usefulness | **C−** | Planning actions show on past dates. There's no summary, no alignment, and no explanation of why a day was missed. |
| Performance / contracts | **A−** | Schema versioning, query budgets, cursor paging. Must be preserved. |

**S+ target:** one canonical credit rule, used by the calendar, metrics, day options and the pane, that is explainable (every credited session carries its source) and reversible (every automatic credit can be excluded). Plus a review-first pane that answers *what did I do* and *did it serve this program* without recomputing on the client.

---

## 1. Canonical credit semantics (backend, `services/program_day_occurrences.py`)

For each scheduled occurrence `(program_id, program_day_id, local_date)`, the credited sessions are:

| Source | Rule |
|---|---|
| `linked` | Existing rule: `session.program_day_id == day.id` and the session's effective local date equals the date. |
| `template_match` | **New.** Completed, non-deleted session on that local date; `template_id` is in the date's scheduled template set; `program_id` is null **or** equals this program. Sessions explicitly linked to a *different* program are not auto-credited, so one session never silently satisfies two programs. |
| `manual` | **New.** A stored credit row maps the session to a scheduled `template_id` on that date. The session counts as that template, whatever its own template is. |
| `excluded` | **New.** A stored exclusion removes an automatic (`linked` or `template_match`) credit for that date. |

Rules:
- Precedence per `(date, session)`: `excluded` > `manual` > `linked` > `template_match`.
- A session contributes **one** template per date: its credited template (manual) or its own `template_id`. Date-level dedup and the strongest `completion_min_templates` threshold are unchanged.
- When overlapping definitions both schedule the matched template, the session attaches to every such occurrence for attribution. The date is still evaluated once, as today.
- A credit applies only when the session's effective local date in the requested timezone equals the credit date. Otherwise it is **dormant**, the same way overrides on unscheduled dates are today. Soft-deleted sessions make credits inactive.
- In-progress and paused sessions never count toward completion. They still appear in the pane.

Implementation:
- Replace `bucket_sessions` with `resolve_occurrence_credits(occurrences_by_date, sessions, credits, zone)`. It returns, per occurrence, a list of `{session, credited_template_id, source}`.
- `evaluate_occurrence` consumes credited template IDs instead of raw `session.template_id`.
- `build_day_facts` gains a `session_credits=` argument alongside `status_overrides=`.
- Add a shared loader, `load_program_credit_candidates(db, root_id, owner_id, program, utc_start, utc_end)`, in a new `services/program_day_credits.py`. It runs one query: `program_id == program OR (program_id IS NULL AND template_id IN program_template_ids) OR id IN manual_credit_session_ids`, non-deleted, and it loads credits in a second query. **All three evaluator callers** use it: `program_day_read_model_service.py`, `program_metrics_service.py` (replacing `_load_program_sessions`) and `_program_days.py` (day options). This keeps calendar, metrics and Create Session in parity.
- Bump `CALCULATION_VERSION` 4 → 5 (adherence semantics change). Bump the client constant in `client/src/hooks/useProgramMetrics.js`.

## 2. Data model

New table `program_day_session_credits` (Alembic migration, additive):

```
id PK, program_id FK programs ON DELETE CASCADE, date DATE, session_id FK sessions ON DELETE CASCADE,
disposition TEXT CHECK IN ('credit','exclude'), template_id FK session_templates NULL
  (CHECK: credit ⇒ template_id NOT NULL; exclude ⇒ template_id NULL),
set_by_user_id FK users SET NULL, created_at, updated_at
UNIQUE (program_id, date, session_id); INDEX (program_id, date)
```

Model it next to `ProgramDayStatusOverride` in `models/program.py`. This is the occurrence-aware write model the earlier plan required before `ProgramDaySession` could be retired. Record in the retirement table that `ProgramDaySession` removal is now unblocked, but it stays out of scope here.

## 3. Credit mutation

`PUT /api/<root_id>/programs/<program_id>/day-session-credits`

```json
{ "date": "2026-09-02", "session_id": "…", "timezone": "America/Toronto",
  "disposition": "credit" | "exclude" | "automatic", "template_id": "…" }
```

- New service `services/_program_day_session_credits.py`, following the `_program_day_statuses.py` pattern: lock the program row, validate, upsert or delete, emit the event after commit. Route and schema go in `blueprints/programs_api.py` and `validators/`.
- Validation:
  - The session belongs to this root and owner, is not deleted, and is completed.
  - Its effective local date equals `date`.
  - `date` is scheduled and `<= local today`.
  - `credit` requires a `template_id` from that date's scheduled template set.
  - `exclude` requires an existing automatic credit.
  - `automatic` deletes the row.
- Idempotent. Returns the refreshed day `detail` so the client can replace its cache without a second round trip.
- Inaccessible programs return 404 without revealing whether they exist.

## 4. Day-detail read model v4 (`ProgramDayReadModelService`)

Bump `SCHEMA_VERSION` to 4 and the client constant in `client/src/hooks/useProgramDayReadModel.js`. Put the new projection in a new pure module, `services/program_day_summary.py`, so the service stays under the 800-line maintainability cap.

`detail` adds:

```json
"summary": {
  "session_count": 3, "completed_session_count": 3,
  "total_duration_seconds": 5400, "activity_count": 14,
  "alignment": { "aligned_seconds": 4200, "total_seconds": 5400, "aligned_ratio": 0.78,
                 "aligned_activity_count": 11, "basis": "duration" | "count" },
  "goals": [ { "goal_id": "…", "seconds": 1800, "activity_count": 5 } ],
  "off_scope_goal_ids": ["…"],
  "goals_completed_ids": ["…"],
  "targets_completed": [ { "id": "…", "name": "…", "goal_id": "…" } ]
},
"sessions": [ { …existing session fields,
  "relation": "credited" | "off_plan" | "other_program",
  "credit": { "source": "linked|template_match|manual", "template_id": "…", "program_day_ids": ["…"] } | null,
  "excluded": false,
  "alignment": { "aligned_seconds": 1200, "total_seconds": 1500, "goal_ids": ["…"] },
  "credit_options": [ { "template_id": "…", "name": "…", "color": "…" } ] } ]
```

- **One session list** replaces the gap between `occurrences[].sessions` and `other_sessions`. It covers every non-deleted session on the date for this owner, in any program. `occurrences[].sessions` becomes `session_ids` referencing it. `other_sessions` is removed; its only consumer is `ProgramDayPane`.
- Alignment evidence: load the date's resolved evidence **once** (all completed activity instances, not only aligned ones) by splitting `load_aligned_evidence` into `load_resolved_evidence` + filter. Aggregate per session and per goal with the same equal-split allocation the metrics goal breakdown uses. Extract that allocation into a shared helper rather than duplicating it.
- `basis: "count"` applies when no timed durations exist, so untimed activity still shows a meaningful ratio.
- Goals completed and targets completed come from `completed_at` on the local date, restricted to the program scope. Use one bounded query each.
- `summary` always covers the whole date. Only `sessions` is paginated (existing cursor).
- `credit_options` is non-empty only for completed off-plan sessions, on dates that are scheduled and `<= today`. It lists the scheduled templates not yet completed that day.
- Query budget: keep the detail-day test. Allow at most +3 statements (evidence, goals completed, targets, credits), then lock the measured value.

## 5. Client: review-first day pane

Split `client/src/components/programs/ProgramDayPane.jsx` into focused components, all styled in `ProgramSidePane.module.css`:

| Component | Shown when | Content |
|---|---|---|
| `ProgramDaySummaryCard` | date ≤ today | Stats row (sessions · time · activities), an aligned-vs-other bar with an `aria-label` (e.g. "78% of time aligned to program goals"), and goals completed / targets hit. Empty state: "No sessions logged on this day." |
| `ProgramDayGoalAlignment` | summary has goals | Program goals touched, sorted by time, with `GoalIcon`. Clicking one calls the existing `onGoalClick`. Off-scope goals collapse into "+N other goals". |
| `ProgramDayOccurrenceCard` | scheduled | Existing card and status menu. Template rows show status. Credited sessions are **always** listed on observed dates (this removes the `requirements_met` gate), each with a small source label: *Linked*, *Matched template*, *Counted manually*. |
| `ProgramDaySessionRow` | every session | Extends the existing `SessionSummary` with a per-session alignment micro-bar and an overflow menu: **Count as ‹template›** (one click when there's a single option), **Don't count**, **Use automatic**. |
| `ProgramDayOffPlanSection` | off-plan / other-program sessions exist | Heading "Off-plan sessions", plus an explainer saying these don't count toward the day unless credited. |
| `ProgramDayPlanCard` | date ≥ today and nothing scheduled | Existing "Plan this day" actions. Never shown for past dates. |

- New mutation hook `useSetProgramDaySessionCredit` in `client/src/hooks/`, with an API method in the programs API module. On success it writes the returned detail into the day-detail cache. It then invalidates `programDayReadModelRoot`, program metrics, and program calendar data, the same set used by the day-status mutation. Its pending state disables the row menu; no optimistic update, per the existing cache-coherence rule.
- The status menu (`ProgramDayStatusMenu`) is unchanged.
- Future dates: plan card only; no summary.
- Today: summary, then occurrences, then the plan card when unscheduled.

## 6. Documentation

- Update `index.md` (Programs section): the credit sources and precedence, the new table, the day-summary projection, read model v4, and calculation v5.
- Link this plan from `index.md` and the retirement table in `planning/programs-scoped-sidepane-chain-calendar.md`.

---

## Verification

**Backend** (`tests/unit/services/`, `tests/integration/test_programs_api.py`, `tests/performance/test_query_budgets.py`):
- Credit sources:
  - `template_match` credits an unlinked session.
  - It does **not** credit a session linked to another program.
  - It credits a session linked to this program's *other* program day when the template matches.
- Precedence: `excluded` > `manual` > `linked` > `template_match`.
- Counting:
  - A manual substitution counts as its credited template.
  - Two sessions of one template count once.
  - Overlapping definitions attach one session to both but evaluate the date once.
- Credit validity:
  - Credits go dormant across a timezone or date shift and when the session is soft-deleted.
  - In-progress and paused sessions never credit.
- Neighbouring boundaries: exactly `completion_min_templates` vs one below, and local midnight at DST boundaries.
- Parity: metrics `days[]` and read-model day facts give identical states and counts under automatic and manual credits.
- Day options: reflect `template_match` credits.
- Mutation:
  - Rejections: future date, unscheduled date, off-date session, incomplete session, template not scheduled, `exclude` without an automatic credit, cross-tenant request (404).
  - Idempotency.
  - The response carries the refreshed detail.
- Summary:
  - Alignment on the duration basis and the count basis.
  - Per-goal allocation matches the metrics helper.
  - Goals and targets completed on the local date only.
  - `summary` covers the whole date across paginated sessions.
- Contract: schema v4 snapshot. Query budget for the detail day.

**Client** (`client/src/components/programs/__tests__/ProgramDayPane.test.jsx` plus new component tests):
- Past unscheduled date shows the summary and no plan card.
- Future date shows the plan card only.
- Today shows both.
- Partial or missed day lists its completed sessions.
- Source labels.
- Credit menu flows: single-option one click, multi-option choice, Don't count, Use automatic.
- Pending and error states.
- Cache write plus invalidation.
- Accessible labels on the alignment bars.
- Schema/version rejection for v3/v4 metrics mismatch.

**Commands:**
```bash
fractal-goals-venv/bin/pytest tests/integration/test_programs_api.py tests/unit/services/test_program_metrics_service.py tests/performance/test_query_budgets.py tests/unit/services -k "program_day"
./run-tests.sh lint && ./run-tests.sh frontend
cd client && npm run build
```

**Manual (run the app):**
1. On a past unscheduled date with sessions, confirm the summary, alignment bar and goals, and that there's no plan card.
2. On a scheduled Tuesday, run the scheduled template from the Sessions page without a program link. The day turns met, and the session shows *Matched template*.
3. Run a different template, choose **Count as ‹template›**, and confirm the calendar, overview metrics and streak update. Then choose **Use automatic** and confirm they revert.
4. Choose **Don't count** on an auto-matched session and confirm the day goes back to partial or missed.
5. Check mobile bottom-sheet layout, keyboard use of the row menu, and light and dark themes.
