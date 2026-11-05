# Yield per set as a goal threshold

## Context
Metric Trends' Yield line can plot each session's top set, average set or total, but a yield goal can only count a session's **total**. A goal set at 200 from a line reading 184 per set may already be met, because the session's total is far higher. Today a note in the popover warns about this. You asked for the real fix: yield per set as a threshold option, on the backend and in the goal form.

Assumption to check: alongside "one set reaches X", this includes "at least N sets reach X" and "the average set reaches X". The sets measure already has both ideas (`min_sets` and Best/Average), and they make all three modes of the Yield line map exactly onto a goal. Cut Average here if you'd rather keep this smaller.

## Grade of what exists today

| Area | Grade | Why |
|---|---|---|
| Database | **A** | `goal_completion_conditions` already has every column needed: `measure`, `min_sets`, `operator`, `target_value`, `set_aggregate`. Only three check constraints list what's allowed, so they need widening. No new column and no backfill. |
| Evaluator | **A** | Pure, well tested, and `set_yield()` already computes a set's yield. Tags already filter sets before evaluation. |
| Validation | **A** | Server and client validators share `goal_condition_validation_cases.json`, so they can't quietly disagree. |
| Goal form and text | **B** | The measure radio list and sentence builder extend cleanly, but `measure` checks are spread through `goalConditions.js`. |
| Goal marker accuracy | **C** | `goalConditionLines.js` puts any yield goal on the Yield line, whichever value the line is plotting. |

## Target (S+)
Each Yield line mode maps to a goal that measures exactly what the line shows, so the warning note can go. Existing goals behave identically. The migration only widens constraints, and is reversible while no `set_yield` goals exist.

## Behaviour

**New measure on Single session: "Yield per set"**

| Option | Meaning | Reads as |
|---|---|---|
| Best (default) | At least N sets each reach the yield | "Bench: at least 2 sets of yield ≥ 200 within one session" |
| Average | The average yield across at least N sets reaches it | "Bench: average yield ≥ 200 across at least 2 sets within one session" |

- The form's measures become **Sets meeting rules**, **Total yield** and **Yield per set**. It reuses the existing Best/Average toggle, sets count and operator.
- It's offered only for activities with a yield and sets, and tag filters apply as they do for other set goals.
- **Not included:** cumulative goals stay total-only, since a running total is already a sum. Consistency goals ("3 sessions with a 200 set") stay metric-only.

**Progress text:**
- One set required: "Top set 184 / 200".
- N sets required: "1 / 3 sets".
- Average: "Best average 150 / 200".

**Metric Trends' Yield line:**

| Line plots | Clicking sets | Marked when the line plots |
|---|---|---|
| Top set | Yield per set, Best, 1 set | Top set |
| Average | Yield per set, Average, 1 set | Average |
| Total | Total yield | Total |

The warning note is removed. A goal is only marked when its measure matches what the line plots, so a total-yield goal doesn't appear on a top-set line, where its position would mean nothing.

## Implementation

1. **Migration (new, after `f4b6d8e0a2c3`) and `models/goal.py`.** Drop and recreate these, following the pattern in `c1e3a5b7d9f0`, with the model docstring updated to match:
   - `ck_goal_conditions_kind_measure`: single session allows `set_yield`.
   - `ck_goal_conditions_min_sets`: `set_yield` requires `min_sets >= 1`.
   - `ck_goal_conditions_total`: `set_yield` requires `target_value` and an operator.
   - `ck_goal_conditions_set_aggregate`: `average` also allowed for `set_yield`.
   - Downgrade restores them. It fails on any `set_yield` row, which is the safe outcome; say so in the migration.

2. **`services/goal_condition_evaluator.py`.** Add `_evaluate_single_session_set_yield` (Best) and `_evaluate_single_session_set_yield_average`, both using `set_yield()`, and dispatch to them. Sets missing a yield metric aren't counted. Update the module docstring.

3. **`services/goal_condition_service.py`.** Add `set_yield` to `KIND_MEASURES`; validate `min_sets`, operator, `target_value`, and that the activity has both a yield and sets; allow `set_aggregate='average'` for it.

4. **`client/src/utils/goalConditions.js` and `goalConditionText.js`.** Add the measure, drafting, validation and payload; add the sentences and `describeProgress` text above. Add invalid cases to the shared fixture.

5. **`CompletionConditionEditor.jsx`.** Add the radio option and its row, reusing `SetAggregateToggle`, the sets count, `OperatorSelect` and the existing fields.

6. **Yield line.**
   - `chartGoalPrefill.js`: `goalFromYieldTrend` chooses the condition from `setsHandling` and drops the note.
   - `goalConditionLines.js`: match a yield goal to the line's mode. `MetricTrends.jsx` passes `setsHandling`.

## Risks to check while building
- **"Progress toward…" chart:** `services/progress_chart_spec.py` and `GoalConditionChart` must plot a `set_yield` goal per set against its threshold. I haven't read this path closely yet, and it may be the largest hidden piece.
- **Other readers of `measure`:** goal timeline text and agent-facing validators. Search again once the measure exists, so nothing falls into an "unknown measure" default.
- **Completion on existing data:** a new `set_yield` goal may complete immediately from past sessions, as other threshold goals already do.

## Verification
- **Evaluator unit tests:** Best with 1 and N sets; Average; `<=` goals; a set missing a metric; tags; split metrics using their largest value.
- **API (`tests/integration/test_goal_conditions_api.py`):** create, read and update; rejected for an activity without a yield or without sets; the shared validation fixture, on both server and client.
- **Migration:** upgrade and downgrade on the populated-database test (`test_populated_migration_upgrade.py`); existing yield goals unchanged.
- **Unit (client):** sentences, progress text, drafts and payloads; each line mode's condition; markers only on the matching mode.
- **e2e:** in `analytics-goals.spec.js`, create a goal from a top-set Yield line and see it open with its marker; create one from the form; confirm a completed session meets it.
- **Gates:** `npx eslint src e2e`, `npm run typecheck`, `node scripts/maintainability-audit.mjs`, related vitest, backend goal-condition tests, rebuild before e2e.

## After approval
1. Commit the current uncommitted work first, on its own (the one-metric Set goal rule, two-threshold marker hiding, and Yield line support). Remove this step if you'd rather hold it.
2. Save this plan to `planning/goal-yield-per-set.md`, per CLAUDE.md.
3. Build it. I won't commit this work until you ask.
