# Activity threshold: tag filters, set-free wording, consecutive streaks

> **Status (2026-10-29): implemented.** Departures from the plan below:
> - Archived tags stay valid on a condition, whether new or retained. Archiving only hides a tag from pickers and never changes assignments, so rejecting archived tags would only make conditions harder to edit.
> - The editor's tag picker is `TagChipPicker` (read-only catalog hook, honors single-select families), not `ActivityTagEditor`, so the goal form doesn't pull in the offline outbox.
> - `condition/preview` evaluates the goal's **active period**, which is the same evidence saving would use, so "already meets this" is exact. Rule-value placeholders come from probing blank values as 0, because rule bests don't depend on the thresholds.
> - Wording moved to `client/src/utils/goalConditionText.js`, and rule rows and the tag filter moved to `ConditionEditorFields.jsx`, to stay under the 450-line maintainability limit.
> - Follow-ups (2026-10-31):
>   - The tag picker is the session page's pop-up `ActivityTagEditor`, shown behind an "Only count when tagged" checkbox, in a new stacked layout.
>   - Required tags appear as badges in the summary box.
>   - The "Your best so far" line was dropped; blank rule values still show the best as a placeholder.
>   - Added **Best / Average** (`set_aggregate`, migration `c1e3a5b7d9f0`). Average takes each rule's mean across *all* of a session's counted sets, at least `min_sets` of them, so tags are how warm-ups get excluded. It's offered on single-session and consistency thresholds, not on activities without sets. Consistency also gained "at least N sets" for Best (saved thresholds keep N = 1).
>   - Wording is now "at least N set(s)".
> - Tags can match **Containing** (every chosen tag, others allowed) or **Exactly** (`tag_match`, migration `d2f4b6c8e0a1`). The chosen tags appear only in the summary box, labelled "tagged" or "tagged exactly", not under the checkbox.
> - Shared validation cases: `tests/fixtures/goal_condition_validation_cases.json`.

## Context

The activity-threshold editor ([CompletionConditionEditor.jsx](client/src/components/goalDetail/CompletionConditionEditor.jsx)) can only describe a threshold in terms of metric values on sets. Three gaps:

1. **No tag scoping.** "5 clean handstand push-ups" can't say "only sets tagged *Strict* / *Freestanding* count", so tagged variants of one activity can't have their own goals.
2. **Set-centric copy.** "At least 1 set where…", "Sets meeting rules", "sessions with a set where", "2 / 3 sets" all show up for activities with `has_sets = false`, where the evaluator already treats the instance's own metrics as one implicit set ([goal_condition_evidence.py:186](services/goal_condition_evidence.py#L186)).
3. **No streaks.** Consistency counts N qualifying instances anywhere in the active period. Nothing requires N *in a row*.

Decisions confirmed with you:
- **Consecutive:** a streak of N logged instances of the activity that all qualify. A logged instance that misses the rules or tags breaks the streak. Days with nothing logged don't break it.
- **Tag match:** a set must have **all** of the chosen tags. Sets inherit their instance's tags ("effective tags", the same rule as [_serialize_activities.py:26](services/_serialize_activities.py#L26)).

## Grade of the current implementation: **A−**

| Area | Grade | Notes |
|---|---|---|
| Domain model / DB | A | One live condition per goal, rules in their own table, strong CHECK constraints, `Numeric(14,4)`, progress never stored |
| Evaluator | A+ | Pure, no DB access, deterministic ordering, split-aware semantics, documented |
| Client/server parity | A− | JS validation mirrors Python with the same wording, but nothing enforces the match (no shared fixtures) |
| Reconciliation | A | Event-driven, exact revert on evidence change, honors manual decline |
| Copy / product fit | C+ | Assumes sets everywhere, a blank value previews as "≥ – Count", the yield option shows disabled with an explanation even when it can never apply, "Count" unit is noise |
| Expressiveness | B− | No tag scoping, no streaks, no "per week" cadence, one activity only |

## S+ plan

### 1. Data model (migration, append-only)
- New table **`goal_condition_tags`** (`condition_id` FK → `goal_completion_conditions.id` ON DELETE CASCADE, `tag_definition_id` FK → `activity_tag_definitions.id` ON DELETE CASCADE, PK on both, index on `tag_definition_id`). Use the same root-consistency trigger pattern as `enforce_activity_tag_link_root` ([models/activity.py:610](models/activity.py#L610)) so a condition can't reference another fractal's tag.
- New column **`goal_completion_conditions.consecutive BOOLEAN NOT NULL DEFAULT false`**, with CHECK `consecutive = false OR kind = 'consistency'`.
- Model: `GoalCompletionCondition.tags = relationship(..., secondary='goal_condition_tags', order_by=TAG_ORDER)` in [models/goal.py](models/goal.py), and update the docstring.
- Cap at 10 tags (`MAX_CONDITION_TAGS`), mirrored client-side.

### 2. Evaluator ([goal_condition_evaluator.py](services/goal_condition_evaluator.py))
- `EvidenceSet` gains `tag_ids: frozenset[str] = frozenset()`. `ConditionSpec` gains `tag_ids: frozenset[str]` and `consecutive: bool`.
- Add one helper, `_eligible(row, spec) -> bool` (`spec.tag_ids <= row.tag_ids`), and apply it **at the set level in every kind**:
  - single_session/sets: only eligible sets count toward `min_sets` and the closeness score.
  - single_session/yield and cumulative (metric and yield): only eligible sets add to totals (`instance_yield` and `instance_metric_total` take the spec or a filtered set list).
  - consistency: an instance qualifies if some eligible set meets every rule. With no rules, it qualifies if it has any eligible set.
  - `_rule_bests`: only eligible sets, so "best so far" respects tags.
- **Consecutive:** in `_evaluate_consistency`, when `spec.consecutive`, a non-qualifying instance resets `count` to 0. `met` latches at the first instance where the streak reaches N, same as today. `current` reports the **current** streak (or N once met). Add `best_streak` to `ConditionEvaluation` and `to_dict` so the UI can show "best 4 in a row".
- Update the module docstring's "Kinds" section.

### 3. Evidence ([goal_condition_evidence.py](services/goal_condition_evidence.py), [goal_history_read_model.py](services/goal_history_read_model.py))
- `to_evidence`: each set's `tag_ids` = instance tags ∪ set tags. The implicit set built from instance-level metrics carries the instance tags. **Edge case:** an instance with no sets and no instance metrics produces no evidence sets today. Give it one empty set carrying its tags so tag-scoped, rule-free consistency still sees it. Check this doesn't change existing rule-free consistency results; the evaluator already counts such instances because `not spec.rules` short-circuits, so add a test that pins this.
- Add `selectinload(ActivityInstance.tags)` and `selectinload(ActivityInstance.sets).selectinload(ActivitySet.tags)` to both the direct query and `GoalHistoryReadModel.instances` (non-summary branch).

### 4. Service, validation, serialization
- [goal_condition_service.py](services/goal_condition_service.py) `normalize_condition_payload`: accept `tag_ids` (list of unique ids, ≤10, each a tag in this root; archived tags allowed only if they're already on the condition, following `_assignable_tags`' `retained_ids` pattern) and `consecutive` (bool, consistency only, otherwise rejected with "Only consistency thresholds can require a streak"). For activities with `has_sets = false`, coerce `min_sets` to 1.
- `write_condition`: persist tags and `consecutive`. `build_condition_spec`: pass them through. `live_condition`: also selectinload `tags`.
- Validator schema in `validators/` for goal create/update: add the two fields.
- [_serialize_goals.py](services/_serialize_goals.py) `serialize_goal_condition`: add `consecutive` and `tags: [{id, name, color, archived}]` (reuse `serialize_activity_tag`). `_activity_payload` in [goal_condition_reads.py](services/goal_condition_reads.py) already exposes `has_sets`.

### 5. Reconciliation triggers (tags now affect completion)
- In [completion_handlers.py](services/completion_handlers.py), subscribe to `Events.ACTIVITY_TAG_ASSIGNMENTS_UPDATED`. The payload already carries `root_id` and `activity_id` from both [activity_tag_assignment_service.py](services/activity_tag_assignment_service.py) and [circuit_tag_operations.py](services/circuit_tag_operations.py). Route it through `_handle_evidence_change(..., trigger='tag_assignments_updated')`. `activities_with_conditions` keeps it cheap: it no-ops unless a condition watches the activity.
- **Tag merge** (`activity_tag_catalog_service.merge`): repoint `goal_condition_tags` rows from the source tag to the target, de-duplicating, in the same transaction. Then reconcile affected goals. Without this, the CASCADE would silently drop the filter and make the threshold easier to hit.
- Archiving a tag doesn't change assignments, so no reconcile is needed. The serialized tag shows `archived: true` and the editor greys it out.
- Offline outbox tag writes end in the same assignment service, so they're covered. Confirm there's no separate offline tag write path while implementing.

### 6. Client utilities ([goalConditions.js](client/src/utils/goalConditions.js))
- Draft gains `tag_ids: []` and `consecutive: false`. Update `createConditionDraft`, `conditionToDraft`, `buildConditionPayload` (send `tag_ids`, and `consecutive` only for consistency), and `changeDraftKind` (clear `consecutive` when leaving consistency). `changeDraftActivity` keeps tags, since tags are fractal-wide.
- `validateConditionDraft`: ≤10 tags, using the same wording as the server.
- **Set-aware wording.** Add `const usesSets = activity?.has_sets !== false` (fall back to `condition.activity_has_sets` from the serializer for snapshot/read-only surfaces, which means adding that field) and branch the copy:

| Place | With sets | Without sets |
|---|---|---|
| Measure radio | Sets meeting rules | Meets metric rules |
| Single-session count row | At least [N] set(s) where | *(hidden; always 1)* "In one session:" |
| Consistency count row | [N] sessions with a set where | [N] sessions where |
| Preview, single | `3 sets of Reps ≥ 5 in one session` | `Reps ≥ 5 in one session` |
| Preview, consistency | `5 sessions with a set of Reps ≥ 5` | `5 sessions with Reps ≥ 5` |
| Progress label | `2 / 3 sets` | `0 / 1 session` → show the best rule value instead (see §8) |

- **Tags in copy:** `describeCondition` appends the tags after the activity name: `Handstand Push Ups (Strict, Freestanding): 1 set of Reps ≥ 5 in one session`. With sets, a tagged set reads "set tagged Strict". The parenthetical form stays short and is the same for both cases.
- **Consecutive in copy:** `5 sessions in a row with …`. The progress label reads `2 / 5 in a row (best 4)`.
- **Blank values:** `describeRule` renders a blank value as `…` rather than `–`. Omit the unit when it equals the metric name or is "Count".

### 7. Editor UI ([CompletionConditionEditor.jsx](client/src/components/goalDetail/CompletionConditionEditor.jsx))
- **Tag filter row**, shown under the measure and rules for every kind: label "Only count when tagged". Reuse `ActivityTagEditor` in controlled mode the way [PlanTagEditor.jsx](client/src/components/prescriptions/PlanTagEditor.jsx) does (`selectedTagIds` / `onChangeTags`, `triggerFirst`, `editable`). Catalog from `useActivityTagCatalog` (read-only hook, no outbox import). Helper text appears only when tags are chosen: "Sets need every tag; tags on the activity count for its sets." Without sets, it reads "The activity needs every tag."
- **Consecutive checkbox** under the consistency count row: `☐ In a row — a logged session that misses this resets the count`. Disable it with no tooltip clutter when `required_count` is 1.
- Branch the set-aware copy from §6.
- **Polish while here:**
  - Hide the yield radio entirely when the activity has no yield, instead of disabling it plus a permanent hint.
  - Use `useId()` for the radio `name` so two editors on one page don't share a radio group.
  - Placeholder on blank rule values: the activity's best so far, from §8.
  - Drop the redundant "Count" unit label.
- CSS: add `.tagRow` and `.checkRow` to [CompletionConditionEditor.module.css](client/src/components/goalDetail/CompletionConditionEditor.module.css) using existing tokens. Check that it works at phone width.

### 8. Live "where you stand" line (main product improvement)
Today the editor gives no feedback on whether the threshold is trivial or out of reach. `goal_condition_reads` already powers an "editor preview" evidence page. Add a debounced evaluation of the **draft** spec against the goal's contributing history (`within_active_window=False`) and show one line under the preview:
- "Your best: 3 reps (Oct 12). 0 sessions qualify yet."
- or "Already met by your session on Oct 12. This goal would complete on save."

Implement it as a POST `/goals/<id>/condition/preview` (or extend the existing preview read) that takes a draft payload, runs `normalize_condition_payload` + `build_condition_spec` + `evaluate_condition`, and returns `to_dict()` (with `rule_bests` and `best_streak`). Add a hook under the `goalCondition` query-key root. Reuse `rule_bests` for the rule-value placeholders in §7.

### 9. Tests
- **Evaluator** (`tests/unit/...goal_condition_evaluator`):
  - tag filtering in each of the 5 kind/measure branches
  - an inherited instance tag satisfies a set
  - a partial tag match fails
  - consecutive: a streak resets on a miss, `met` latches, `best_streak` is reported
  - a no-sets instance with tags and no metrics counts for rule-free consistency
- **Service:**
  - payload validation (foreign-root tag, >10 tags, `consecutive` on a non-consistency kind, archived-tag retention)
  - `min_sets` coerced for no-sets activities
  - a tag assignment change completes and reverts a goal through the event handler
  - tag merge repoints condition tags
- **Migration:** upgrade/downgrade on a populated DB, following [MIGRATION_POLICY.md](docs/architecture/MIGRATION_POLICY.md).
- **Client:** [CompletionConditionEditor.test.jsx](client/src/components/goalDetail/__tests__/CompletionConditionEditor.test.jsx) covers the no-sets copy, the tag row, the consecutive checkbox's visibility and payload, and the hidden yield option. `goalConditions` unit tests cover `describeCondition` and `describeProgress` across the sets/no-sets × tags × consecutive matrix.
- **Parity:** add a shared JSON fixture of invalid payloads → expected messages, run by both pytest and vitest, so the client and server validation can't drift apart.

### 10. Docs
- Update the "Goals and completion conditions" paragraph in `index.md` (tags and consecutive).
- After approval, save this plan to `planning/goal-condition-tags-consecutive.md`.

## Further improvements (not in this plan, ranked)
1. **Cadence streaks:** "3× per week for 4 weeks". The natural next step after instance streaks. Needs timezone-aware bucketing; it's the most common habit-goal shape.
2. **Activity group targets:** "any activity in *Push*" as the threshold activity. The association plumbing already resolves groups.
3. **Seed from personal best:** `prefillConditionFromInstance` exists. Offer "Start from my best (+1 rep)" in the editor, not only from an instance.
4. **Rolling window for consistency:** "5 of the last 7 sessions". Cheap once streaks exist.
5. **Split semantics hint:** when the activity has splits, note "every side must meet this", which the evaluator already enforces silently.

## Verification
- `pytest tests -k "goal_condition or completion_handlers or tag"`, then the full suite. Run `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` on a populated local DB.
- `cd client && npx vitest run src/components/goalDetail src/utils` and the lint/type check.
- Manual run through the app (`/run`):
  1. Create a goal on Handstand Push Ups with the tag *Strict*. Log a session with an untagged set that passes the rules and confirm the goal stays open. Tag the set *Strict* and confirm the goal completes live. Remove the tag and confirm it reverts.
  2. Pick an activity without sets and confirm no "set" wording appears anywhere: editor, preview, goal details summary, progress label.
  3. Consistency, 3 in a row: pass, pass, miss, pass. Confirm progress reads `1 / 3 in a row (best 2)`.
  4. Merge the *Strict* tag into another tag and confirm the condition now shows the merged tag.
