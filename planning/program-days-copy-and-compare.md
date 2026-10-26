# Program Days: copy left → right, plan deltas, and leaner completed headers

## Context

In the Programs **Days** tab with compare turned on, the left column shows an earlier date (by default the last completed one) and the right column shows the date being planned. The intended workflow is to program each week from what was done the week before. Right now the user has to retype every value from the left card into the right one, and nothing shows how much the new plan increases on the old one. The completed-session header also shows start, end and duration, which takes space and doesn't help with planning.

This change:
1. Removes the session start, end and duration metadata from completed-session cards.
2. Adds **Copy from {left date}** to the right plan card. It is allowed only when both cards use the same template and the right side is still plannable.
3. Shows **relative changes from left to right**: total yield per activity, and changes per set.

### Decisions confirmed with you
| Topic | Decision |
|---|---|
| Copy source when the left card is a completed session | **What was logged.** The copy is what the left card shows. |
| How the copy applies | **Replaces the right card's items and values as an unsaved draft.** You review it, then Save or Discard. Nothing is written until Save. |
| Total yield | **Per activity only.** No card-level summary and no sum across units. |
| Notes and tags | **Not copied.** Only items and values are copied. |

---

## Grade of the existing system against this plan

| Area | Grade | Why |
|---|---|---|
| Two-column layout and alignment | **A** | `ProgramDaysView` already renders both columns. `planAlignmentKeys` gives matching rows the same `<template>\|a:<activity>#n` key in both columns, and `useAlignedColumns` lines them up. This key is exactly what copy and comparison need to pair items. |
| Plan draft model | **A−** | `SessionPlanCard` keeps edits in a local `draftSections` until Save. Save checks `row_version` (409 on conflict), and the server validates that the sections match the template (`_validate_sections`). A copy can be a draft with no new endpoint. |
| Logged session → plan shape | **C** | The conversion from logged sets to the editor's value shape is inline JSX in `CompletedSessionCard.renderActivity` and `renderCircuit`. Nothing else can reuse it, so copying "what is shown" would mean writing it a second time. |
| Yield and delta logic | **C+** | There are two client yield helpers that disagree. `progressAggregations.canComputeYield` requires `is_multiplicative === true`, while `setAggregation.yieldMetricIds` accepts `!== false`. The delta formatting (`SummaryDelta`) is a component inside `SessionActivityProgressSummary.jsx` with no pure function behind it. |
| Completed header | **B** | It is simple, but the metadata it shows is noise in a planning view. |
| **Overall readiness** | **B** | The structure is strong. Two pieces of logic need extracting first so that copy and comparison stay consistent with what the user sees. |

---

## Copy logic (the rules)

**Where the button appears.** Copy is only offered with compare on (two columns). It goes in the header of the right column's `SessionPlanCard`, labelled **"Copy from Thu, Oct 16"**. If copy isn't possible, the button is disabled and its tooltip and `aria-describedby` text give the reason.

**Eligibility.** This is a pure function, `planCopyEligibility(...)`, which returns `{allowed, reason}`:
1. **Same template.** The left column must have an entry, either a loaded plan or a logged session, for the same `template.id`. Templates are compared by id, never by name. If they don't match, the button is not rendered at all.
2. **The right side is plannable.**
   - It is not a completed or logged session. In that case the right card is a `CompletedSessionCard`, so no button is shown.
   - Its date is not in the past (`readOnly`). The server rejects that case with 409 anyway.
   - It has no session started from it yet (`executed_sessions` is empty). That session already copied its own snapshot of the plan, so changing the plan now would quietly split the two. Reason shown: "A session has already started from this plan."
3. **The left side has content.** It has at least one item. An empty past date ("No sessions logged") has nothing to copy. While the left side is still loading, the button is disabled.
4. **Unsaved edits on the right.** If the right card is dirty, the user is asked "Replace your unsaved changes with the plan from Oct 16?" before anything is copied.

**Turning the left card into a source.** A new pure util, `utils/planCopySource.js`, normalises either kind of left card into the plan shape `[{name, items:[{type, activity_definition_id|circuit_definition_id, name, item_key?, prescription}]}]`:
- **From a plan:** the left entry's `sections` as they are.
- **From a logged session:** `loggedSessionPlanSections(session)`, moved out of `CompletedSessionCard`:
  - logged sets become `prescription.sets[].metrics` (keeping `split_id`);
  - flat metrics become `prescription.metrics`;
  - circuit rounds become `prescription.rounds[].slots[]`, using the same mapping that `renderCircuit` uses today.
  - `CompletedSessionCard` then renders from this same function, so the copy is always exactly what the card shows.

**Building the copy.** A pure function, `copyPlanSections({source, targetSections, templateSections, activityById, circuitById})`, returns `{sections, skipped}`:
- **Sections:** the target keeps its own section list, which the server requires to match the template. Each target section takes the source section with the same name. If no source section matches, the target section ends up empty, because the copy replaces it.
- **Source sections that aren't in the target** (for example, the template renamed a section after the left date): their items are dropped and listed in `skipped`.
- **Item identity:** each item keeps its link to the template so that Pull changes still works. Keys are resolved in this order:
  1. The source item's `item_key`, if that key is in the target or template sections.
  2. Otherwise, the `item_key` and `added_in_plan` flag of the target item with the same alignment key.
  3. Otherwise, a new UUID marked `added_in_plan: true`.
  - No key is used twice.
- **Values:**
  - Notes are removed at every level: the activity, each set, each round and the circuit. Tags are removed too.
  - Metric entries are limited to the definition's active metrics (`getPrescriptionColumns`).
  - Sets with no values at all are dropped.
  - Sets are capped at `MAX_PRESCRIPTION_SETS` and rounds at `MAX_CIRCUIT_PLAN_ROUNDS`.
  - The result goes through `normalizePrescription` / `normalizeCircuitPrescription`.
- **Deleted activities and circuits** are dropped and listed in `skipped`.

**After copying:**
- The right card gets the result as `draftSections`, so it is dirty and the usual Save and Discard buttons appear.
- The Copy button itself shows the copy (revised, no banner): it reads **"← Copied from Oct 16"** in the success colour until Save or Discard, adds "· N not copied" when items were skipped (reasons in its tooltip), and announces "Copied from Oct 16. Review, then Save." plus the skipped lines to screen readers. It still copies again.
- Save goes through the existing `mutations.save`, which still checks `row_version` and server validation. Discard returns to the stored plan.

**Copy and comparison together.** Deltas update live as the draft changes. Straight after a copy every delta reads `(0%)`. As the user edits values (for example +2.5 kg), the deltas show the step.

---

## Relative changes from left to right

**Pairing:**
- Items are paired by alignment key: `planAlignmentKeys` on both columns, plus a new `indexByAlignKey`.
- Sets are paired by index.
- Changes show on **every right card that has a matching left entry**, whether it is a plan or a completed session. Comparing one week's logged session with the next costs nothing extra and uses the same function.

**What is shown** (a pure function, `comparePrescriptions(current, previous, definition)` in `utils/planComparison.js`):
- **Yield-eligible activities** (two or more tracked metrics, all multiplicative, using `canComputeYield` from `progressAggregations.js` so the result matches the session page's "Total yield"):
  - **Per set:** a delta chip at the end of the set row with the set yield's % change, for example `▲4.2%`.
  - **Per activity:** a summary row under the set table, for example `Total yield 2,450 ▲4.3% vs Oct 16`.
- **Other activities:**
  - **Per set:** a chip with the % change of each metric that changed, for example `▲10% dur`.
  - **Per activity:** the % change of each additive total (`computeAutoAggregations().additive_totals`).
- **Flat activities** (no sets): per-metric changes on the flat row.
- **Unpaired rows:**
  - A set the left doesn't have shows a `new` chip.
  - Fewer sets than the left shows `−1 set` on the activity row.
  - An activity the left doesn't have shows a `New` badge.
- **Direction:**
  - Colours follow `higher_is_better`; yield is always higher-is-better.
  - A previous value of 0 shows an absolute change instead of a %.
  - No change shows a muted `(0%)`, so a fresh copy visibly reads as unchanged.
- **Style:** inline coloured text in parentheses, like the session page's progress (`(▲4.2%)`), not a badge. A value's change sits beside its own input and carries no metric name; a yield set's change sits at the row's end.
- **Circuits:** rounds pair by position and members by the circuit's slot id (a logged run's slot by its `source_slot_id`); each member value shows its change beside it (`compareCircuitSlot`), and a round the left lacks is marked `new`.

**Shared formula.** `relativeDelta(current, previous, {higherIsBetter})` returns `{delta, pct, improved, label}` and lives in `utils/planComparison.js`. `SummaryDelta` in `SessionActivityProgressSummary.jsx` is changed to call it, so the session page and the Days tab format changes the same way.

---

## Implementation steps

### 1. Remove the completed-session metadata
- `client/src/components/programs/days/CompletedSessionHeader.jsx`:
  - delete `fields`, the `<dl>`, `timestamp`, and the imports for `useTimezone`, `calculateSessionDuration`, `formatDateTimeParts` and `formatClockDuration`;
  - keep the name badge link and the completion check.
- `CompletedSessionHeader.module.css`: delete the `.metadata*` rules and the mobile media block.
- `__tests__/CompletedSessionCard.test.jsx`:
  - replace the two metadata tests with one test that checks the header has no start, end or duration text;
  - keep the badge-navigation test.

### 2. Extract shared logic (pure, tested)
- **`utils/loggedSessionPlan.js`:**
  - move `sessionSectionItems` and `activityIdOf` here from `CompletedSessionCard.jsx`;
  - add `loggedSessionPlanSections(session, activityById)`.
  - `CompletedSessionCard` imports these and renders from the result. Keep re-exporting `sessionSectionItems` if tests import it.
- **`utils/planComparison.js`:** `relativeDelta`, `indexByAlignKey`, `comparePrescriptions`.
- **`utils/planCopy.js`:** `planCopyEligibility`, `copyPlanSections`.
- **Shared query options:** `sessionDetailQueryOptions(rootId, sessionId)` (key `queryKeys.session`), used by `CompletedSessionCard` and by the comparison-source hook so they share one cache entry.

### 3. Comparison source hook
- New file `hooks/usePlanComparisonSource.js`:
  - `(rootId, programId, dayId, compareDate, timezone, activityById)` → `Map<templateId, {date, kind: 'plan'|'logged', sections, isLoading}>`.
  - Reads `useProgramDayPlans` for the compare date. This is the same key the left column already uses, so it comes from cache.
  - Fetches logged sessions with `useQueries(sessionDetailQueryOptions)`. For a template with several logged sessions, it uses the first, matching how `CompletedSessionCard` uses `alignmentPrefix`.

### 4. Wiring
- `ProgramDaysView.jsx`:
  - when `compareDate` is set, call `usePlanComparisonSource` once;
  - pass `comparison={sourceByTemplate}` and `comparisonDate` only to the right column (`value === date`).
- `PlanDateColumn.jsx`: pass `comparison={comparison?.get(entry.template.id) || null}` to both `SessionPlanCard` and `CompletedSessionCard`.
- `SessionPlanCard.jsx` (399 lines, so keep its growth small):
  - **Copy:**
    - a header button driven by `planCopyEligibility`;
    - `copyFrom()` runs `copyPlanSections` and calls `setDraftSections`;
    - a `copyNotice` state that turns the button into "Copied from …" with the skipped list.
  - **Comparison:**
    - build `previousByAlignKey` once with `indexByAlignKey(comparison.sections)`;
    - pass `comparison={previousByAlignKey.get(alignKeys.items[s][i])}` and `comparisonDate` to `PrescriptionEditor`;
    - show a `New` badge on unpaired items.
- `CompletedSessionCard.jsx` (right side): pass `comparison` to its read-only `PrescriptionEditor` in the same way.
- `components/prescriptions/PrescriptionEditor.jsx`:
  - new optional props `comparison` and `comparisonDate`;
  - render a `<PlanDeltaChip>` inside `.setExtras` for each set, and on the flat row;
  - render `<PlanActivitySummary>` after the set table, with `data-align-key={planRowAlignKey(alignKey, 'summary')}`. (Revised: the summary always shows, as on the session page; the comparison only adds its changes.)
  - Without `comparison` nothing changes, so the base template editor and the left column are unaffected.
- **New components:**
  - `components/prescriptions/PlanDeltaChip.jsx` (and `.module.css`): small tabular-number chip using improved and regressed tokens, with an `aria-label` such as "Set 2 yield up 4.2% from Oct 16";
  - `components/prescriptions/PlanActivitySummary.jsx`: the session page's summary rail (additive totals, total yield, best set, built by the shared `components/common/activitySummaryMetrics.jsx`), with deltas when compared.
- `components/sessionDetail/SessionActivityProgressSummary.jsx`: `SummaryDelta` calls `relativeDelta`. Its output must not change; the existing tests confirm this.

### 5. Docs
- Update `planning/programs-domain-reference.md` (Days tab) with the copy rules and the comparison semantics.
- This plan is saved as `planning/program-days-copy-and-compare.md`.
- `index.md` doesn't change, because ownership and invariants stay the same.

---

## Verification
- **Unit tests** (`client/src/utils/__tests__/`):
  - `planCopy.test.js`:
    - **eligibility:** template mismatch, past date, executed session, empty or loading left side;
    - **copy:** plan→plan keeps `item_key`s; logged→plan reuses target keys by alignment key; a duplicate activity gets its `#n` pairing right; unknown items get `added_in_plan`;
    - **values:** notes and tags are removed; empty sets are dropped; the set cap holds;
    - **skipped:** a missing section or a deleted activity ends up in `skipped`.
  - `loggedSessionPlan.test.js`: typed items, legacy `exercises`, circuit rounds, split metrics.
  - `planComparison.test.js`:
    - yield vs non-yield;
    - `higher_is_better: false`;
    - previous of 0 shows an absolute change;
    - unequal set counts;
    - no change renders nothing;
    - the rounding of `relativeDelta` matches `SummaryDelta`.
- **Component tests:**
  - `SessionPlanCard.test.jsx`:
    - the copy button shows, is disabled, or is hidden as the eligibility rules say;
    - after a copy the card is dirty and the notice shows;
    - with a dirty card, the user is asked to confirm;
    - Save sends the copied sections.
  - `PrescriptionEditor` shows chips and the summary only when it gets a `comparison`.
  - `ProgramDaysView.test.jsx`: only the right column gets the comparison and the copy button.
  - `CompletedSessionCard.test.jsx`: no metadata, and it still renders logged sets from the extracted function.
- **Regression:** the existing session-detail `SessionActivityProgressSummary` tests still pass.
- **Commands:** `cd client && npm test -- programs/days prescriptions planCopy planComparison loggedSessionPlan SessionActivityProgress`, then `npm run lint`.
- **Manual check** (`/run`): go to Programs → Days with compare on, left = last week's completed Upper Body – Heavy, right = next week.
  1. Click Copy. The draft matches the left card's values.
  2. Bump the bench weight. The set chips and Total yield show ▲.
  3. Save, then reload. The values persist.
  4. Choose a past date on the right. Copy is not offered.
  5. Check that alignment between the two columns still holds.
  6. Check the completed header shows only the badge and the check.
