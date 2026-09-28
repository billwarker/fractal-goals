# Program Days tab and dated session plans

## Context

Programs decide **when** you train. Session templates decide **what** you train, but only as a structure: a list of activities with no numbers. Nowhere can a user write down "Upper A on Oct 13: Bench 5×105 kg, 5×105 kg, cue: pause at chest" in advance, and the session detail page has no idea what the user meant to hit.

This feature adds:
- a **Days** tab to the Programs page for pre-building dated sessions;
- **dated session plans**: per-occurrence snapshots of a template that carry planned values and notes per set and per metric;
- **plan indicators** on the session detail page, beside the existing progress indicators.

The aim is to let the user program a block week by week in one place, then execute against it.

### Decisions confirmed with you

| Topic | Decision |
|---|---|
| Version key | One plan per **(program day, template, occurrence date)** |
| Days tab layout | Left: the day list. Top: a date strip. Main area: that date's templates as **side-by-side cards** |
| Carry-over | A new plan is **seeded from the most recent earlier plan** of the same day and template, falling back to the base template |
| Link to the base template | **Independent snapshot**, plus a "Template changed" badge and an explicit "Pull template changes" action |
| What a plan can change | Add, remove, reorder or swap **activities and circuits within the template's sections**, plus values and notes. Sections stay fixed |
| Granularity | **Per set and per metric**, plus **notes per activity and per set** |
| In session | **Reference only.** Nothing is auto-filled. Show "plan 100" beside "(last 95)", coloured met or under |
| Off-date sessions | Create Session **offers the nearest unexecuted plan** for the template. The default is today's occurrence, otherwise the most recent unexecuted plan |
| Base template | Can also hold values and notes, using **the same editor**. These act as defaults outside programs and seed the first plan |
| Adherence metrics | **Not in v1.** Data is stored so adherence can be added later without a migration |

---

## Audit: is this worth building?

**Yes. It is the strongest remaining product gap in the Programs domain.** Programs already schedule days, evaluate completion, and track streaks, but a program day can't say what "done well" means. Structured-training tools (TrainingPeaks, TrueCoach, Hevy routines, RP) all centre on this "prescription → execution → comparison" loop. The app already owns the other two thirds: execution (sessions, sets, metrics) and comparison (progress indicators).

**Fit and risk notes (already built into the design below):**
1. **Keep plans separate from goal targets.** Targets are outcome goals that roll up the goal tree. Plans are session inputs. Plans should never create targets or count as target evidence. Mixing the two would corrupt goal progress.
2. **Use "Plan" in the UI, not "version" or "iteration".** The user thinks "what's planned for Oct 13". Revision numbers stay internal.
3. **Avoid row explosion.** An 8-week block with four days and two templates has 64 occurrences. Plans are *virtual* (seeded on read) until the user first edits one, so only real intent is stored.
4. **Keep history accurate.** At session creation, the plan's values are snapshotted onto each activity instance. Editing next week's plan, or the template, never rewrites what a past session was supposed to hit.
5. **Data-entry fatigue is the main UX risk.** Seed-from-previous handles most of it: opening week 3 starts from week 2's numbers. Bulk tools ("+2.5 kg on all", "+5%", copy to the rest of the block) are the obvious next step, but I've kept them out of v1 as you asked.
6. **Circuits:** plans can add and remove circuits, but **per-member circuit values are deferred to v2**. Circuit rounds and members have their own lifecycle, and prescribing them doubles the editor's scope.

---

## Grade of the existing system against this plan

| Area | Grade | Why |
|---|---|---|
| Program occurrence model and read models | **A** | `services/program_day_occurrences.py` (`program_day_scheduled_on`, `build_occurrences`) already gives canonical occurrence dates. The dormant-row pattern (credits) and row-version locking are ready to reuse. |
| Session templates | **D** | `template_data` is untyped JSON with structure only. Items have no stable identity (the validator even treats `item.id` as a legacy activity ID in `validators/core.py:~218`). There is no revision number. Two client serializers strip unknown fields (`templateBuilderItems.js:55 serializeTemplateItem` and `createSessionPayload.js:16 normalizeSection`). Instantiation copies nothing but structure (`_session_creation.py:369`). |
| Session detail progress UI | **B+** | `renderMetricProgress(metricId, {setIndex})` in `SessionActivityItem.jsx:488` is a clean per-metric, per-set slot, and `ActivitySet.status` already supports `'planned'`. However, `SessionActivityItem.jsx` (766 lines) and `SessionActivityItemView.jsx` (805 lines) are near the maintainability budgets. |
| Create Session program flow | **B** | Deep links and day options exist, but choices resolve to a template, not a dated plan. |
| **Overall readiness** | **C+** | Strong scheduling core, but templates need identity, revisions and a typed prescription schema before plans can be built on them safely. |

---

## S+ design

### 1. Data model (one Alembic revision, additive only)

**Template item identity and revision**
- Template items get **`item_key`** (a UUID string), assigned on write by the validator when missing. A data migration backfills `item_key` into every existing `session_templates.template_data` item. `id` is not used because it is already a legacy alias for the activity ID.
- Add **`session_templates.revision`**: an integer, not null, default 1, incremented by `TemplateService.update_template`. This follows the `CircuitDefinition.version` → `CircuitRun.source_version` pattern.

**Prescription schema.** The optional `prescription` key on an activity item is used in both base templates and plans:
```jsonc
{ "type": "activity", "item_key": "uuid", "activity_definition_id": "…", "name": "Bench",
  "prescription": {
    "schema": 1,
    "notes": "Pause at chest",                         // activity-level note, optional
    "metrics": [{ "metric_id": "…", "split_id": null, "value": 100 }],   // non-set activities
    "sets": [ { "metrics": [{ "metric_id": "…", "value": 5 }, { "metric_id": "…", "value": 105 }],
                "notes": "top set" } ]                 // set activities
  } }
```
- New module **`validators/prescriptions.py`** handles:
  - structural checks: type checks, at most 50 sets, note length caps, finite numbers;
  - `metrics` and `sets` are mutually exclusive, chosen by `ActivityDefinition.has_sets`.
- The service does a **semantic** pass, since it owns tenant checks:
  - every `metric_id` and `split_id` belongs to the item's activity definition and the root, and is not deleted;
  - values respect `FractalMetricDefinition` `min_value`, `max_value`, `input_type` and `predefined_values`.
- Wire the structural validator into `validate_session_template_data` (`validators/core.py:167`).

**New table `program_session_plans`** (model in `models/program.py`):
- `id`, `root_id`, `program_id` (FK, CASCADE), `program_day_id` (FK, CASCADE), `session_template_id` (FK, CASCADE), `date` (Date)
- `plan_data` (JSON: `sections` with the same shape as template `sections`, including `item_key` and `prescription`)
- `source_template_revision` (int), `seeded_from_plan_id` (nullable FK, SET NULL), `row_version` (`version_id_col`)
- `created_by_user_id`, `created_at`, `updated_at`, `deleted_at`
- a partial unique index on `(program_day_id, session_template_id, date) WHERE deleted_at IS NULL`, plus an index on `(root_id, session_template_id, date)` for Create Session lookups
- A plan whose date is no longer an occurrence (because the schedule changed) is **dormant**: kept, but not shown. This matches how `program_day_session_credits` behaves.

**Execution linkage**
- `sessions.program_session_plan_id`: nullable FK, SET NULL, indexed. A plan is "executed" when a non-deleted session references it.
- `activity_instances.prescription`: nullable JSON holding the snapshot copied at instantiation. This is the only thing the session detail page reads, so no plan lookups happen at render time.

### 2. Backend services

New **`services/program_session_plans.py`** (`ProgramSessionPlanService`), using thin routes in `blueprints/programs_api.py` and schemas in `validators/programs.py`:
- **`list_plan_occurrences(root, program, day, start, end)`**
  - Enumerates dates with `program_day_scheduled_on` / `build_occurrences`, bounded to 370 days.
  - Returns `[{date, templates: [{template_id, state: planned|seeded|executed, plan_id}]}]` for the date strip dots.
- **`get_day_plans(root, program, day, date)`** returns one entry per `get_program_day_template_rules(day)` link:
  - `plan`: the stored plan, **or** a *virtual* seed that is not persisted;
  - `source: plan|previous_plan|template`, `seeded_from_date`, `template_changed` (`source_template_revision < template.revision`), `executed_sessions`.
  - Seed resolution: the latest non-deleted plan of the same (day, template) with an earlier date, else the base template's sections and prescriptions.
- **`upsert_plan(…, plan_data, expected_row_version)`**
  - Materializes on the first save. Validates that sections match the base template's section names and order, so only items can change.
  - Stale row versions return 409. Emits `PROGRAM_SESSION_PLAN_UPDATED` after commit.
- **`reset_plan`**: soft-deletes the plan, so the date falls back to its seed.
- **`pull_template_changes`**: rebuilds sections from the current template. Prescriptions are kept for items whose `item_key` survives, and items the plan added are kept in their section. Bumps `source_template_revision`.
- **`plan_candidates(root, template_id, date, program_day_id?)`**
  - Returns today's occurrence plan (stored or virtual) plus unexecuted plans in the previous 14 days, newest first. This feeds Create Session.
  - `get_active_program_days` (`services/_program_days.py:571`) adds `plan: {id|null, date, source}` to each template option.

**Session creation** (`services/_session_creation.py`):
- `_apply_template` accepts `program_session_plan_id`. It checks that the plan's root, template and (when present) program day match. It then uses the plan's `sections` instead of the template's and sets `Session.program_session_plan_id`.
- A virtual plan chosen at creation is materialized in the same transaction, so the session always references a real row.
- `_instantiate_section_activities` copies each item's `prescription` into `ActivityInstance.prescription`. When the plan has N sets, it creates N **empty** `ActivitySet` rows with `status='planned'`, so the plan chips line up with set rows. Values stay blank, per "reference only".
- Base-template sessions get prescriptions from the template's items the same way.
- Items whose activity definition was deleted are skipped, as today.

**Serializers**
- `serialize_activity_instance` emits `prescription`.
- `serialize_session` emits `program_session_plan_id` and `plan_date`.
- `serialize_session_template` emits `revision`.

**Invalidation and events**
- Plan mutations and session create/delete invalidate plan read models.
- Template updates bump the revision only. They never touch plans.

### 3. Frontend

**Days tab**
- In `client/src/pages/ProgramCalendarPage.jsx:55`, set `PROGRAM_VIEW_ITEMS = ['calendar','blocks','days']`. `viewMode === 'days'` renders a lazily loaded `ProgramDaysView`.
- New folder `client/src/components/programs/days/`:
  - **`ProgramDaysView.jsx`**: owns the selection (`dayId`, `date`). It defaults to the program day with the nearest upcoming occurrence.
  - **`ProgramDaysNavigator.jsx`**: program days grouped by block. It reuses the block colors from `ProgramBlockView`. On mobile it becomes a select at the top.
  - **`PlanOccurrenceStrip.jsx`**: the chosen day's dates with ‹ › controls. Dot states are ○ template default, ● planned, ✓ executed, and today is highlighted.
  - **`SessionPlanCard.jsx`**: one card per template, laid out side by side and stacked on narrow screens. It contains:
    - a header with the template name and color, a source line ("Seeded from Oct 6" / "Template default"), a "Template changed" badge with a **Pull changes** action, a **Reset** action, and executed-session links;
    - the body: sections, then items, then `PrescriptionEditor`, with add, remove, reorder and swap activity or circuit controls that reuse the pickers from `TemplateBuilderModal`.
  - Saving is explicit per card: a dirty indicator plus Save. A 409 conflict shows a refresh prompt.
- The side pane (`ProgramDayPane.jsx`) gets an **"Edit plan"** link that switches to Days with that day and date selected. Its Start link (`ProgramDayPane.jsx:58`) adds `plan_date`.

**Shared prescription editor** in `client/src/components/prescriptions/`:
- **`PrescriptionEditor.jsx`**: set rows × metric columns (splits supported), per-set note, activity note, and add/remove set. Numeric inputs follow `MetricValueEditor` conventions (commit on blur or Enter, predefined values become a select).
- When editing a plan, each input shows the **previous plan's value as placeholder text**. The seed source travels with the `get_day_plans` payload.
- The same component is embedded in `TemplateBuilderModal.jsx` as a collapsible "Planned values" section per activity item.
- Fix the field-stripping bugs: `serializeTemplateItem` (`templateBuilderItems.js:55`) and `normalizeSection` (`createSessionPayload.js:16`) must keep `item_key` and `prescription`.

**Session detail**
- New pure module `client/src/utils/sessionPrescription.js`:
  - `getPlannedMetric(prescription, metricId, {setIndex, splitId})`;
  - `evaluatePlannedMetric({planned, actual, higherIsBetter}) → 'pending'|'met'|'under'`, where lower is better when `higher_is_better === false`.
- In `SessionActivityItem.jsx`, `renderMetricProgress` renders a `PlannedValueChip` ("plan 105") beside the existing "(last …)" or delta, coloured by the evaluator. It shows nothing for sets beyond the plan or when there is no prescription.
- Planned notes appear under the activity header and under each set row as muted text. They are never mixed with the user's actual notes.
- To stay within maintainability budgets, the plan rendering goes in a new `PlannedValueChip.jsx` and `usePlannedValues.js` hook rather than growing `SessionActivityItem` / `SessionActivityItemView`.
- The existing metric-default auto-fill (`SessionActivityItem.jsx:262-379`) must **not** fill `'planned'` empty sets with defaults when a prescription exists. Planned values must be the only guidance.

**Create Session**
- `useCreateSessionProgramContext.js` / `CreateSession.jsx`: when a template has plan candidates, show a compact "Plan: Mon Oct 13 (not yet done) ▾" chooser. The options are the candidates plus "Template only".
- The deep link from the day pane preselects the plan. `createSessionPayload.js` sends `program_session_plan_id`, or `plan_ref: {program_day_id, template_id, date}` for a virtual plan.

**API and query keys**
- `fractalProgramsApi.js` gets `getPlanOccurrences`, `getDayPlans`, `savePlan`, `resetPlan`, `pullPlanTemplateChanges` and `getPlanCandidates`.
- New `queryKeys.programSessionPlansRoot(rootId, programId)` with nested `occurrences(...)` / `dayPlans(...)` keys.
- New hook `hooks/useProgramSessionPlans.js`, following the `useProgramDayReadModel.js` pattern.

### 4. Out of scope for v1 (stored-data ready)
- Bulk progression tools (+X, +%, copy to the rest of the block)
- Plan adherence metrics
- Circuit member prescriptions
- Quick-template prescriptions
- AI-agent plan proposals (the agent template schema will keep `item_key` and `prescription` as passthrough)
- "Save session as template with values"

---

## Delivery phases (each one shippable and tested)
1. **Template foundation:** `item_key` backfill, `revision`, the prescription validator and semantic checks, the serializer fields, and the two client field-stripping fixes. Base template "Planned values" editor.
2. **Execution snapshot:** `activity_instances.prescription`, planned empty sets, plan chips, notes and the hit evaluator on session detail. Base templates with values work end to end at this point.
3. **Plans backend:** `program_session_plans`, the service, routes, the virtual seed, concurrency, dormancy, and session creation from a plan.
4. **Days tab UI:** the navigator, strip, cards, side-pane "Edit plan" link and Create Session plan chooser.
5. **Docs:** update `index.md` (Programs and Sessions sections, plus invariants: "plans are snapshots; instances snapshot prescriptions; plans never feed targets") and save this plan to `planning/program-days-session-plans.md`.

## Verification
- **Backend unit tests** (`tests/unit`):
  - Prescription validator: set/non-set mismatch, foreign metric ID, a split from another activity, out-of-range and non-finite values, oversized notes.
  - Seed resolution: no prior plan, prior plan, a prior plan that was deleted, and an earlier plan on a dormant date.
  - Template-changed flag.
  - `pull_template_changes` item_key merge.
  - The `item_key` backfill is idempotent.
- **Backend integration tests** (`tests/integration`):
  - Cross-tenant access is rejected on every route.
  - Upsert conflicts on a stale `row_version`, and sections cannot be renamed.
  - Creating a session from a stored plan and from a virtual plan (which materializes it) snapshots prescriptions and planned empty sets.
  - Editing a plan after execution does not change `activity_instances.prescription`.
  - Deleting a program day cascades its plans.
  - Candidates window boundaries: day 14 is included, day 15 is not.
- **Performance** (`tests/performance/test_power_account_budgets.py`): query-count and payload budgets for `get_day_plans` and a 370-day `list_plan_occurrences`.
- **Frontend (Vitest)** covers:
  - `sessionPrescription.js` (met, under and pending, lower-is-better, sets beyond the plan);
  - `PrescriptionEditor` interactions and the template builder round-trip, which keeps `prescription` and `item_key`;
  - the Days view's selection, seed placeholders and 409 handling;
  - the Create Session plan chooser.
- **Browser:** `./run-tests.sh browser` with a new desktop and mobile workflow. It programs week 1, opens week 2 (seeded, then bumped and saved), starts a session from the day pane, checks the "plan 105" chips turn green or amber on entry, and checks that week 1's session is unchanged.
- **Gates:** `./run-tests.sh all`, `lint`, `typecheck`, `maintain`, and migration health (`alembic upgrade head` on a copy of production-shaped data, then downgrade).

---

## Delivery notes (2026-09-27)

Implemented all five phases. Where this differs from the plan above:

- **Swap is remove + add.** Plan cards support add, remove, and reorder. Swapping an activity means removing it and adding the new one; there is no separate swap control.
- **Plan-added items are flagged.** Items added in a plan carry `added_in_plan: true`. That is how "Pull template changes" knows to keep them (see `merge_template_changes`).
- **Plan routes live in their own blueprint**, `blueprints/program_session_plans_api.py`, so `programs_api.py` stays under the size cap:
  - `GET  /api/<root>/programs/<program>/days/<day>/plan-occurrences`
  - `GET  /api/<root>/programs/<program>/days/<day>/plans?date=`
  - `PUT/DELETE /api/<root>/programs/<program>/days/<day>/plans/<template>/<date>`
  - `POST .../pull-template`
  - `GET  /api/<root>/session-plans/candidates?template_id=&date=`
- **Agent proposals keep the base contract.** `SessionCreateSchema` now extends `SessionCreateBaseSchema`, and the agent's strict schema extends the base, so the agent adapter's schema artifact is unchanged.
- **Storage quota** now counts `program_session_plans.plan_data` and `activity_instances.prescription`.
- **Browser fixtures.** They seed a separate "Browser Planning" fractal. The browser server now disables Flask-Limiter directly: the `RATELIMIT_ENABLED` environment variable was never read, and the extra login pushed the suite over the login limit.

Verification:
- **Backend:** the new unit, integration and performance tests pass, as does migration health (upgrade, `alembic check`, downgrade, upgrade).
- **Frontend:** the full Vitest suite passes (1,386 tests), and lint and `tsc` are clean.
- **Browser:** the new Playwright workflow passes on desktop and mobile.
- **Gate failures also on `main`, unrelated to this work:**
  - four backend tests assert day read model schema v5, but the model is v6;
  - three Playwright specs fail (agent connections on both viewports, program-day status on desktop);
  - 12 basedpyright errors;
  - frontend maintainability budgets were already exceeded on `main`. `TemplateBuilderModal.jsx` and `ProgramCalendarPage.jsx` grew by about 37 and 25 lines.

### Follow-ups (2026-09-27)

- **Circuits.** Legacy `activities` lists that mix typed circuits and activities now convert faithfully. They get positional `legacy-<section>-<item>` keys, and plan cards show each circuit's name and members. Circuit member prescriptions are still deferred.
- **Side pane.** On the Days tab the side pane shows a day/template navigator (`ProgramDaysNavigator`). Choosing a template scrolls to its card. Narrow screens get a compact select in the main view instead.
- **Status marks.** The date strip uses the canonical status marks. `plan-occurrences?timezone=` returns each date's `state`, `manual_status`, `closed`, `program_day_completed` and credited `sessions`, all from `build_range_facts`. Its window cap now matches the read model's 366 days.
- **Two columns.** The main area shows two date columns: the focused date and the occurrence before it. By default that is the latest program day (on or before today) and the next one.
  - Clicking a date in the strip focuses it on the right, with its predecessor on the left.
  - The first date shows alone.
  - Plan cards keep only unsaved edits locally, so an untouched seed refreshes when the plan it starts from is saved in the other column.
- **Latest completed column.** The left column is the latest *completed* occurrence before the focused date, falling back to the previous occurrence. Its caption reads "Last completed".
  - `GET .../plans?date=&timezone=` now returns `logged_sessions` per template: the sessions credited to that template on that date, with each activity's logged sets and metrics. It reuses the canonical credit facts and is only computed for today and earlier.
  - Cards with logged sessions are read-only. They show a logged-values table per activity, with planned values as met/under chips. Logged activities are matched to plan items in order, including circuit members; leftovers appear under "Also logged".
- **Date rails in the side pane.** Each program day in the side pane now shows its date rail (status marks, plan dot, selected and compared dates) under its name. The main area starts directly with the columns; narrow screens keep a day select and date strip in the main area.
  - The per-day occurrences endpoint is replaced by `GET /api/<root>/programs/<program>/plan-occurrences?timezone=`, which returns every plannable day's dates from one `build_range_facts` pass over the program span. Programs longer than 366 days are capped to a window around today. It is budgeted at 26 queries regardless of how many days the program has.
  - `useProgramDaysTab` owns the occurrences query and resolves the selection (`resolveDaysSelection`), so the rails and columns always agree.
- **Past days are read-only.** Save, reset and pull reject dates before today in the viewer's timezone (`?timezone=`) with 409 "Past program days can't be re-planned". The Days tab shows past and completed columns read-only: logged values when a session completed the day, otherwise the planned values as a table with a short note. Sessions can still execute an unexecuted recent plan.
- **Completed templates show their session.** A template completed on a date shows that session's section containers and recorded activity data (the Sessions page `SessionSectionGrid`, sharing the session detail cache) under a slim title row with an "Open session" link. The session metadata block is not shown. Sections stack in the narrow column (`session-sections` container query). Its sections and activities carry the same alignment keys as the plan card, so matching activities at the same index line up across the columns. The earlier logged-values view and matcher were removed; `logged_sessions` now carries only session identity. Past, un-logged days show their planned values read-only (`PlannedValuesTable`).
- **Circuit plans.** Circuit items in templates and dated plans can now carry a plan: `{schema, notes?, rounds: [{notes?, slots: [{slot_id, metrics}]}]}`.
  - `slot_id` is a circuit definition slot. The shape is validated in `validate_circuit_prescription` (reusing the circuit round and slot limits), and the service checks that slots belong to the circuit and metrics to each slot's activity.
  - Session creation starts the run with the planned number of rounds and snapshots the plan on `circuit_runs.prescription` (migration `e5a7c9b1d3f4`); client-sent plans are ignored.
  - Planned rounds start empty. Members show "plan" chips and round notes on the session page.
  - Editors: `CircuitPrescriptionEditor`, in the template builder and on Days plan cards. Past days show `PlannedCircuitTable`.
- **One layout for both columns.** Completed templates are shown in the plan card layout rather than the Sessions page grid, which is easier to program from. `CompletedSessionCard` renders the session's own sections; activities show logged sets (`ActivityValuesTable`) and circuits show logged rounds by slot (`CircuitValuesTable`), with the same alignment keys as plan cards. The Sessions page components are unchanged.
- **Scoped notes and planned tags.** Plan cards and the template builder's plan editor now scope like the session page.
  - Clicking an activity highlights it. Clicking a set (or a circuit round) narrows the scope to that set, clicking the set label again or the activity's own container scopes back to the whole activity. The per-set and per-round Note buttons and the separate note fields are gone.
  - A note composer at the bottom of the scoped item edits the scoped note ("Coaching note for X" or "Note for X · Set N"). Notes outside the current scope show as muted text.
  - Planned tags: `prescription.tags` and `sets[].tags` hold activity tag binding ids. The activity's tag button sits next to its remove button in the card header, and each set's tag button sits just left of its remove button. Picks go into the plan draft (`ActivityTagEditor` controlled mode); creating a new tag still adds it to the catalog.
  - The server validates tags (at most 50 per scope, active bindings of the item's activity) and applies them to the new activity instance and its planned sets at session creation (`load_planned_tags`). Past read-only plans list their tags by name.
  - The set table uses a subgrid, so the selected set's highlight is no longer clipped and columns stay aligned.
  - Section helpers moved from the plan service to `services/plan_sections.py` (backend file-size gate).

