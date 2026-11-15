# Program Day Activity Conditions, Quick Session ×N, and Goal Completion Revisited

> Implemented 2026-11-15. Where the build differs from the plan below:
> - `completion_min_templates` keeps its name (it counts sessions and activities together); renaming it
>   would break saved analytics fields and the v1 agent proposal schema.
> - `activity_conditions` is on the app's day schemas only; agent proposals are unchanged.
> - The response field is `goal_changes: {completed, uncompleted}`, since `completed_goals` already means
>   "goals this session completed" on session payloads. Activity completion keeps its `completed_goals`.
> - The program day modal keeps its size; "expand" meant its function. Completion moved to its own component.
> - The Days workspace (plans) still lists template days only; plans are per template.

## Context

There are five requests.

1. **A program day can only be completed by session templates.** You can't say "today, do Front Lever (required, tagged Clean) and Mobility (optional)". That gets more awkward now that quick sessions log activities without a template. The program day modal needs that extra function: activity conditions next to its sessions.
2. **Each quick session gets its own row on the program calendar.** A day with three quick sessions shows "Quick Session" three times. They should read "Quick Session ×3", the same way repeated templates already group.
3. **Goal Detail doesn't say what a threshold goal needs.** The sentence from the threshold builder ("Full Front Lever: at least 1 set of Hold Time ≥ 5 Seconds and Form ≥ 9 Rating within one session") should appear under the goal's description.
4. **A goal completed by its threshold doesn't always get a toast.**
   - Inside a session, the toast only covers goals that are in that session's goal view.
   - A quick session (completed on Create Session) never gets one.
5. **A goal completed by its threshold never asks for a completion note.** Only the manual completion modal offers one.

Answers already given:
- Any completed activity on the date counts toward a day's activity conditions, whichever session it was logged in.
- "Expand the modal" means expand what it can do: add activity conditions.
- "At least N completed" counts sessions and activities as one pool.

## Grade of the current implementation: **B−**

| Area | Grade | Why |
|---|---|---|
| Day completion model | B | `evaluate_occurrence` is one clear, tested rule (required + "at least N"). But only templates can satisfy it. `completion_min_templates` names the old idea. The rule is copied by hand in 4 client places (`programViewModel`, `createSessionProgramDay`, `programCalendarFeed`, `ProgramDayPane`). |
| Program day modal | B | Required/optional templates and the minimum work well. It can't refer to activities or tags, though the goal threshold editor already has a tag filter it could reuse. |
| Calendar grouping | C+ | Sessions group by template, so quick sessions, which have no template, each get a row. The calendar feed doesn't send `session_type`. |
| Goal threshold legibility | B− | `describeCondition` is a pure function used in 3 places. Goal Detail hides the sentence once the progress chart shows, so the goal never says what it needs. |
| Completion feedback | C | The server records completions per request (`_track_goal_completion`), but only `complete activity` returns them. The client's toast works out completions from the session's goal view instead. Goals outside that view and quick sessions are missed, and toasts don't fire for changes that sync later. |
| Completion notes | C | A note can only be written in the manual completion modal. A goal completed by its threshold has no note and no prompt to write one. |

## Target design (S+)

### A. Program day activity conditions (backend)

1. **Model** (`models/program.py`; migration on head `aa1d1082d073`)
   - `program_day_activity_conditions`: `id`, `program_day_id` (FK, cascade), `root_id`, `activity_definition_id` (FK), `is_required` (bool, default true), `order` (int), `tag_match` ('contains' | 'exact', with a check constraint), `created_at`. A unique key on `(program_day_id, activity_definition_id, tag signature)` is enforced in the service, because the same activity with different tags is allowed.
   - `program_day_activity_condition_tags (condition_id, tag_definition_id)`, with the same-fractal trigger copied from `goal_condition_tags` (`models/goal.py:477-503`).
   - Rename `program_days.completion_min_templates` → `completion_min_items`, since it now counts templates and activities together. The migration can be reversed.
   - `ProgramDay.activity_conditions`, ordered by `order`. Add `get_program_day_activity_rules(day)`, the activity counterpart of `get_program_day_template_rules`. It skips deleted activity definitions, just as deleted templates are skipped.
2. **Validation** (`validators/programs.py`)
   - `ProgramDayActivityConditionSchema {activity_definition_id, is_required, order, tag_ids[], tag_match}` goes on the Create/Update base schemas as `activity_conditions`.
   - `completion_min_items` must be between 1 and the number of items (templates plus activities). The old key `completion_min_templates` is still accepted and mapped across, so older clients and agent proposals keep working.
   - Bump the agent operation version (`agent_operation_versions.py`) and update the proposal and preview fixtures.
3. **Service** (`services/_program_days.py`, `_program_helpers.py`)
   - Add `_normalize_activity_conditions` and `_apply_program_day_activity_conditions`. They follow the template versions: dedupe, check that tags belong to the fractal (reuse `goal_condition_service._condition_tags`), delete and reinsert, bump `row_version`.
   - Create, update and **duplicate day** copy the conditions. So do `client/src/utils/programDuplication.js`, `demo_snapshot_service`, `admin_service` and `tag_reference_rewrites` (tag merge and rename).
   - `serialize_program_day` adds `activity_conditions[] {id, activity_definition_id, activity_name, is_required, order, tag_match, tags[]}` and `completion_min_items`.
4. **Evaluation** (`services/program_day_occurrences.py`)
   - New loader `load_program_activity_evidence(root_id, activity_ids, date_range)` in `program_day_credits.py`. It returns completed, non-deleted instances in non-deleted sessions of any kind, grouped by the occurrence date. The date uses the same local-date helper the session credits use. It eager-loads instance and set tags the way `collect_goal_activity_instances` does.
   - Matching reuses the goal threshold code. `to_evidence(instance)` comes from `goal_condition_evidence.py`. `_counted` in `goal_condition_evaluator.py` is promoted to a public `counted_sets`, and goals keep using it.
   - A condition with no tags is met when any completed instance of the activity exists that day. A tagged condition is met when at least one set (or the instance itself) still counts after the tag filter.
   - `evaluate_occurrence(day, credits, activity_evidence)`:
     - The items are the template rules plus the activity rules.
     - Met = there is at least one item, every required item is done, and the number done is at least `completion_min_items` (when set).
     - With nothing required and no minimum, one item done is enough. This matches today's template rule.
     - The result gains `activity_condition_ids`, `required_activity_condition_ids`, `completed_activity_condition_ids` and `item_count` / `completed_item_count`. The template fields keep their names.
   - `evaluate_date` and `build_day_facts` pass the evidence through unchanged.
   - The callers get it from the new loader in one query per range: `ProgramDayReadModelService.build_range_facts`, `ProgramCalendarFeedService`, `program_metrics_service`, `program_rollups`, `list_program_occurrences`, and `get_active_program_days`.
   - **Days with only activity conditions:**
     - `list_program_occurrences` and the calendar and status reads now include days with *any* conditions; they used to skip days with no templates.
     - `get_active_program_days` returns them with `sessions: []` and their `activity_conditions`, so Create Session can offer them (see C).
5. **Freshness:** a day's status now depends on activity completions. After activity completion, quick-complete and session sync, the program day status, read-model and calendar queries are invalidated. This hooks into the existing `invalidateSessionAfterSync` and the quick completion `onSuccess`.

### B. Program day modal (client)

- `ProgramDayModal.jsx`: the "Sessions" block becomes **Completion**, with two lists that share one rule.
  - **Sessions:** the current rows (template, Required checkbox, ×), "+ Add Session Template" and "+ New".
  - **Activities** (new):
    - "+ Add Activity" opens `ActivityPickerModal` (`components/activityPicker`, `selectionMode="single"`, `allowCreateActivity`).
    - Each row shows the activity name, a **Required / Optional** toggle, ↑/↓ and ×.
    - A row also has an expandable "Only count when tagged" control, which reuses `ConditionTagFilter` (`components/goalDetail/ConditionEditorFields.jsx:93`, with `usesSets` from the activity's `has_sets`). Its tags show as `ActivityTagBadges` in the collapsed row.
  - **Rule:** "At least N of M completed" counts both lists. The summary hint (L212-222) is reworded, e.g. "Done when Upper Body and Front Lever (tagged Clean) are completed, and 3 of 5 items in all."
  - The modal moves to `size="lg"` because the rows now carry more controls. On phones it stays one column.
- `programDayModalState.js` adds `activityConditions[] {key, activityDefinitionId, isRequired, order, tagIds, tagMatch}` and `completionMinItems`. The save payload carries `activity_conditions` and `completion_min_items`.
- An activity whose definition has been deleted shows as "Deleted activity" with ×, matching how deleted templates are handled.

### C. Showing activity conditions where days are read

- **Day pane** (`ProgramDayPane.jsx`) and **Days tab** (`SessionPlanCard` neighbours): an "Activities" list with a ✓ for each condition met. The counts line ("X of N done; Y required") reads the server's `completed_item_count` and required ids.
- **Client copies of the rule:**
  - `programViewModel.js` (L85-96, 175-198), `createSessionProgramDay.buildTodayProgramDayView` and `programCalendarFeed.js:149` read the server's `requirements_met` and the counts instead of recounting templates.
  - Where an offline fallback still has to count, it goes through one shared `evaluateDayRules(rules, done)` in `utils/programDayRules.js`. Tests check that it agrees with the server.
- **Create Session:**
  - A program day's row lists its activity conditions under the template badge.
  - A day with only activities shows "Log with a Quick Session". Choosing it switches the source to Quick and fills the activities through the composer's `repeat`. Completing the quick session then satisfies the day.

### D. Quick sessions grouped on the calendar (×N)

- Backend: `_serialize_calendar_session` (`program_day_read_model_service.py:436`) and the feed's `_serialize_session` add `session_type`.
- `buildCompletedSessionEvents` (`utils/programDayState.js:82-87`): quick sessions get the key `quick`, so they become one event with `count`. `ProgramCalendarEventContent` already renders `title ×count`.
- The Goals page calendar widget's older path (`programViewModel.js:555-574`, `unlinkedSessions`) gets the same grouping, so both calendars agree.
- The day pane still lists each quick session, and each opens its own modal.

### E. Threshold sentence in Goal Detail

- Extract `ConditionSentence` from the editor preview (`CompletionConditionEditor.jsx:401-412`). It renders `describeConditionParts` with `ActivityTagBadges` between the two parts.
  - In `variant="preview"` it keeps the builder's accent box.
  - `variant="inline"` is plain, muted text.
  - The editor switches to it.
- `GoalSmartSection.jsx`: under the description and its attachments, add `<ConditionSentence variant="inline">` when `getGoalCompletionCondition(goal) === 'activity_threshold'`. It uses the live activity definition when the activities cache has it, and the serialized names otherwise.
- It shows in view mode and read-only (shared) views. It doesn't show in edit mode, where the editor already shows the sentence.

### F. Goal completion toasts from the server, everywhere

- **Server:**
  - `apply_evaluation` already calls `_track_goal_completion`. Add `_track_goal_uncompletion` for the revert path.
  - One `@app.after_request` hook in `app.py` adds `completed_goals` and `uncompleted_goals` (`[{id, name, type}]`) to any JSON object response from a write request when the request completed or reverted any goal. The context is still populated at that point, because teardown clears it later.
  - This covers activity complete (which drops its own ad hoc field), metric and set edits, session completion, quick-complete and tag edits.
  - `@idempotent` stores the decorated body. A replay returns the same list, and the client's dedupe below absorbs it.
- **Client:**
  - New `utils/goalCompletionAnnouncer.js`. `announceGoalChanges({completed_goals, uncompleted_goals})` shows "Completed: Skill: Full Front Lever" or "No longer complete: …" through `notify` (6s). It dedupes by `goal id + state` for 10s, and invalidates the goal queries.
  - It's called from:
    - The axios response interceptor for online writes, in `utils/api` (one place).
    - The outbox `ack` hub (`offline/sessionOpHandlers.js:300`), so changes made offline announce when they sync.
    - `useQuickSessionCompletion`, once the queued completion lands.
  - `useSessionAchievementNotifications` (which works it out from condition progress) is removed, along with its use in `ActiveSessionContext.jsx:199`. The server is now the only source, so goals outside the session's goal view and quick sessions are covered.
- The async completion mode (`async_completion=1`) returns an empty list today. It stays opt-in and unchanged; the goal queries refresh when evaluation finishes.

### G. Completion note prompt

- **Model:** `goals.completion_note_dismissed_at` (nullable DateTime), in the same migration. It's serialized with the goal and set through the existing goal update endpoint (`PUT /goals/<id>`, a new optional field).
- **When the banner shows:** the goal is completed, it has no completion note, it isn't read-only, and `completion_note_dismissed_at` is null or earlier than `completed_at`. A dismissal therefore covers only that one completion; if the goal is uncompleted and completed again, the prompt comes back. This applies however the goal was completed: by its threshold, by its children, or manually without a note.
- **UI:**
  - `components/goalDetail/GoalCompletionNoteBanner.jsx` reuses the `GoalReviewBanner` styles. It reads "Goal completed — add a note?" over "Record your thoughts on this achievement." with **Write note** and **Dismiss** (×).
  - It sits where `GoalReviewPrompt` sits, at the top of view mode. When both apply, it comes first.
  - Write note opens a `'completion-note'` view in GoalDetailModal. That view is a `GoalCompletionNoteComposer`: the note textarea and `AttachableField` taken from `GoalCompletionModal`, extracted as `CompletionNoteFields` and shared.
  - Saving calls the existing `createGoalNote({note_kind: 'goal_completion', …})` and returns to view mode, where the existing "Goal Completion Note" section now shows it.
- The completion toast (F) gets a **Write note** action that opens the goal at `initialView="completion-note"` (`ConnectedGoalDetailModal` already supports `initialView`).

### Out of scope
- Activity conditions on session plans (plans stay per template).
- Metric thresholds on day activity conditions. Done means completed, with optional tags; per-metric targets belong to goals.

## Critical files
- Backend:
  - `models/program.py`, `models/goal.py`, `migrations/versions/<new>.py`
  - `validators/programs.py`, `services/_program_days.py`, `services/_program_helpers.py`, `services/_serialize_programs.py`
  - `services/program_day_occurrences.py`, `services/program_day_credits.py`, `services/program_day_read_model_service.py`, `services/program_calendar_feed_service.py`, `services/program_session_plans.py`
  - `services/goal_condition_evaluator.py`, `services/goal_condition_service.py`, `services/_completion_context.py`, `services/tag_reference_rewrites.py`
  - `app.py`, `blueprints/timers_api.py`
- Client:
  - `components/modals/ProgramDayModal.jsx` + `programDayModalState.js`
  - `components/programs/ProgramDayPane.jsx`, `utils/programDayState.js`, `utils/programViewModel.js`, `utils/programCalendarFeed.js`, `utils/createSessionProgramDay.js`, new `utils/programDayRules.js`
  - `components/goals/GoalSmartSection.jsx`, `components/goalDetail/{CompletionConditionEditor,ConditionSentence,GoalCompletionNoteBanner}.jsx`, `components/goals/GoalCompletionModal.jsx`, `components/GoalDetailModal.jsx`
  - `utils/goalCompletionAnnouncer.js`, `utils/api` interceptor, `offline/sessionOpHandlers.js`, `hooks/useQuickSessionCompletion.js`, `contexts/ActiveSessionContext.jsx`
- Docs: `index.md` (Programs and Goals sections) and `planning/ui-contracts-reference.md` (day modal, Goal Detail banner, toasts).

## Verification
- **Backend** (`./run-tests.sh backend`):
  - Occurrence evaluation:
    - A day with required activities met by a quick session.
    - Tag contains and exact.
    - One shared pool for the minimum.
    - An activity-only day.
    - A deleted activity is skipped.
    - Overlapping definitions.
  - API: create, update and duplicate round-trip `activity_conditions`; the old `completion_min_templates` key still works; tags from another fractal are refused.
  - Migration: upgrade and downgrade.
  - Toasts: quick-complete, set edit and session update responses carry `completed_goals`; a revert carries `uncompleted_goals`.
  - The `completion_note_dismissed_at` update.
  - Query budgets for the evidence loader.
- **Frontend** (`./run-tests.sh frontend`):
  - ProgramDayModal: add, require, tag and remove activities, and the payload.
  - `programDayState`: quick sessions ×N.
  - `ConditionSentence` and the GoalSmartSection sentence.
  - The announcer's dedupe, and the outbox ack path.
  - The banner's show, hide and dismiss rules, and the composer save.
  - `programDayRules` agrees with the server's fixtures.
- **E2E** (rebuild the client first):
  - Create a day with a required activity, complete a quick session with it, then check the day shows done on the calendar and in the pane, and that the "Completed" toast fired for a threshold goal on that activity.
  - Open the goal, see the banner, write a note and check that it shows.
  - Run the sweep entries for the day modal, Goal Detail and the calendar in both themes. Run `./run-tests.sh lint`, `check:maintainability` and the basedpyright baseline.
