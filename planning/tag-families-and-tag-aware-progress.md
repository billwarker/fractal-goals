# Plan: Universal tag catalog, tag families, and tag-aware progress

## Context

You asked for an audit of the tag and progress systems, with five improvements:

1. Prevent duplicate tags at creation instead of cleaning them up later in the tag manager.
2. Let any tag be used on any activity, with no per-activity availability.
3. Add **tag families**: ordered, named groups of tags that appear together in pickers.
4. The progress timeline filters automatically to past instances with the **same tag configuration**.
5. ▲/▼ progress hints use the instance's own tags by default, and the user can change the comparison per instance from the Timeline pane.

Your decisions:
- **Matching:** the predecessor has exactly the same instance tags. Each set compares with prior sets that have the same set tags.
- **Override:** a Timeline change is saved on that one instance only.
- **Families:** ordered groups, optionally "pick one".
- **Saved progress views:** retired.

---

## Audit and grade (current state)

### Tag system: **C+**

Strengths:
- Tags go through optimistic versions, DB ownership triggers, and a fractal-scoped catalog.
- Merge is careful.

Weaknesses:
- **Two identities for one tag.** `ActivityTagDefinition` (catalog) and `ActivityTag` (per-activity "binding") both exist. Instance tags, set tags, progress-view configs and planned tags all store *binding* ids. Circuits and the catalog use *definition* ids. Every surface has to translate between them.
- **Duplicates are allowed by design.** `uq_activity_tag_definitions_global_name` only covers `scope='global'`. `_conflicts` (`services/activity_tag_catalog_service.py:76-87`) checks only the requested activities. It also uses a different normalization (`lower`, with no whitespace collapse) from `normalize_tag_name` (`casefold` plus whitespace collapse) and from the DB trigger (`regexp_replace(lower(btrim))`). Archived tags still block new ones. The `b2c4d6e8f0a1` backfill created one definition per legacy row, so existing data has many duplicates.
- **Merge and hard delete leave dangling planned tags (bug).** They don't rewrite binding ids stored in prescription JSON: `session_templates.template_data`, `program_session_plans.plan_data`, `activity_instances.prescription` and `circuit_runs.prescription`. `load_planned_tags` then skips those ids silently.
- **Circuit scope tags duplicate catalog data.** `CircuitScopeTag` keeps its own copies of `name` and `color`, and `activity_tag_definition_id` is nullable. Uniqueness and the scope-removal guard match on `lower(name)`.
- **Leftovers and loose ends.** `ActivityDefinition.tags` has no `order_by`, so the picker order is undefined. The `['activity-tags', rootId]` query key is invalidated but nothing reads it. There is no grouping concept.

### Progress system: **B-**

Strengths:
- Predecessors are resolved with bounded SQL, with a canonical predicate shared by SQL and in-memory code.
- Good query-budget tests.

Weaknesses:
- **Comparison context is global.** It is one `active_progress_view_id` per activity. Picking a view in the Timeline (`TimelinePanel.jsx:108-124`) changes ▲/▼ hints in every session and in analytics. Browsing should not have that side effect.
- **The instance's own tags are ignored.** Both sides only need to pass the view's All/Any/None rules. That rule builder is powerful but hard to grasp.
- **Set pairing is by original index** (`_progress_sets.py:139-144`). Set 2 always compares with set 2, even when they are different kinds of work (warmup vs working).
- **Predicate mismatch (bug).** For an activity without `has_sets` whose instance has set rows, the in-memory check uses sets (`_progress_instances.py:49`) but the SQL uses instance tags (:123-139).
- **Inconsistent and redundant API.** The query parameter is `exclude_session` on progress-history but `exclude_session_id` on progress-timeline. `progress-history` overlaps the timeline. View-config ids have no FK, so merges have to rewrite JSON.

### Overall readiness for this plan: **C+**

The relational links and versioning are good foundations. Two things need structural work: the split identity, and storing ids inside JSON.

---

## S+ target architecture

### 1. One tag identity: definitions only

- **Remove the binding layer.**
  - `activity_instance_tags` and `activity_set_tags` reference `activity_tag_definitions.id` directly, with `ON DELETE CASCADE`.
  - Drop `activity_tags`, `ActivityTag`, `ActivityDefinition.tags`, the `scope` column, `create_binding_for_activity`, `_sync_bindings` and the `enforce_activity_tag_catalog_binding` / overlap triggers.
  - Replace the instance and set scope triggers with one simple trigger: the tag's `root_id` must equal the instance's `root_id`.
- **Any active tag can be assigned anywhere.** In `replace_instance_tags` / `replace_set_tags` (`services/activity_progress_view_service.py`, moving to `services/activity_tag_assignment_service.py`), the check becomes "the tag is in this fractal and not archived". A tag that is already assigned stays assigned after it is archived.
- **Circuit scope tags become pure references.**
  - `CircuitScopeTag.activity_tag_definition_id` becomes NOT NULL.
  - Drop the `name` and `color` copies; serialize them from the definition.
  - Uniqueness becomes `(run_id, definition_id)` and `(round_id, definition_id)`.
  - `_required_scope_tag_ids` and `_scope_removal_error` match by definition id.
  - `_ensure_activity_tags` is deleted, because no bindings are needed.
- **Planned tags store definition ids.**
  - `validators/prescriptions.py` docs and `services/prescriptions.py::_check_tag_ids` validate against active fractal definitions.
  - `load_planned_tags` reports ids that are no longer valid instead of skipping them silently.

### 2. Duplicates become impossible

- Add a stored generated column `activity_tag_definitions.normalized_name = regexp_replace(lower(btrim(name)), '\s+', ' ', 'g')`.
- Add a unique index `(root_id, normalized_name)` over **all** rows, archived included. One name maps to one tag for the life of the fractal.
- `normalize_tag_name` in Python and a new `client/src/utils/tagNames.js` both match that SQL. A shared fixture, `tests/fixtures/tag_name_normalization_cases.json`, is tested in Python and in Vitest, and against Postgres in an integration test (the codebase already uses this pattern for block weeks).
- **Create**, when the name matches an existing tag:
  - Active match: return 409 `tag_name_taken` with `existing: {id, name, archived:false}`.
  - Archived match: return 409 `tag_name_taken` with `archived:true`. The UI offers **Restore**.
- **Rename** to a taken name returns 409 `tag_name_taken`. The manager offers **Merge into "X"**.
- **Picker create box:** while typing, an exact normalized match turns the create row into "Select existing 'X'" (or "Restore 'X'"). The user cannot submit a duplicate.
- **Merge** stays as an explicit "Merge into…" action for semantic duplicates (for example "Rehab" and "Rehabilitation"). It no longer depends on `duplicate_groups`; that response field and the "Duplicates" filter are removed.

### 3. Tag families

- **New table `activity_tag_families`:**

  | Column | Notes |
  |---|---|
  | `id`, `root_id` | `root_id` FK CASCADE |
  | `name` | plus generated `normalized_name`, unique per root |
  | `sort_order` | ≥ 0 |
  | `single_select` | bool, default false |
  | `version` | |
  | `created_at`, `updated_at` | |

- **`activity_tag_definitions` gets** `family_id` (FK, `ON DELETE SET NULL`). Its existing `sort_order` now means the order within the family, or within "Other tags" when it has no family.
- **Each tag is in at most one family.** Deleting a family moves its tags to "Other tags".
- **"Pick one" families:**
  - The assignment service rejects two tags from the same single-select family on one instance's own tags, or on one set's own tags. It returns 422 `tag_family_single_select`.
  - Inherited (instance → set) tags are not counted.
  - When a circuit run or round scope is applied, an own sibling tag on a target is replaced. The replaced tag is recorded in the existing `preserved_target_keys` mechanism, so removing the scope tag restores it.
  - Turning on `single_select` when instances already hold several siblings is allowed. The response returns a `conflicting_assignments` count, and the UI warns. Historical data is never rewritten.
- **Endpoints** (`blueprints/activities_api.py`):
  - `GET/POST /<root>/activity-tag-families`
  - `PUT/DELETE /<root>/activity-tag-families/<id>` (versioned)
  - `PUT /<root>/activity-tag-families/order`
  - `PUT /<root>/activity-tags/order`, which takes `{family_id, tag_ids[]}` to place and reorder tags in one move
- **Catalog read:** `GET /activity-tags` returns `{families:[...], tags:[...]}`, already in sorted order.

### 4. Tag-aware progress comparison

- **Tag signatures.**
  - Add `activity_instances.tag_signature` and `activity_sets.tag_signature`. Each is text: sorted definition ids joined by `,`; empty string means untagged.
  - A Postgres trigger maintains them on insert and delete in `activity_instance_tags` / `activity_set_tags`, so every write path stays correct: UI, circuits, session creation, merge, offline replay.
  - Add an index on `(activity_definition_id, tag_signature)` for instances.
  - They are lookup keys only, not progress, so the "progress is never stored" rule still holds.
  - The set signature covers the set's **own** tags only.
- **Per-instance comparison context.**
  - Add `activity_instances.progress_compare_mode`: nullable, check `IN ('all','tags')`. NULL means **Same tags**, the default.
  - Add `activity_instances.progress_compare_version`.
  - Add table `activity_instance_compare_tags(activity_instance_id FK CASCADE, tag_definition_id FK CASCADE, PK)`, used when the mode is `tags`. Because it is relational, merge and delete need no JSON rewrites.
  - The target signature is:
    - the instance's own `tag_signature` (Same tags);
    - the signature of the chosen tags (`tags`);
    - no tag constraint (`all`).
- **Predecessor resolution** (rewrite `services/_progress_instances.py::_load_predecessor_ids`):
  - The rules stay: same activity and root, a different session, the `(effective_time, id)` ordering, and completed-first priority.
  - The tag filter is now `candidate.tag_signature = target_signature`. This replaces `_included_instance_clause` and `_matches_tag_config`, which also removes the `has_sets` mismatch bug.
- **Set-group comparison** (rewrite `services/_progress_sets.py` pairing):
  - Group the current instance's sets by set signature.
  - For each group, find the latest prior instance in the same comparison context that has sets with that signature. This is one LATERAL query per batch over the distinct `(target, set_signature)` pairs.
  - Pair the k-th set in the group with the k-th prior set that has the same signature. Untagged sets pair with untagged sets, so all-untagged history behaves exactly as today.
  - Instance totals, yield and best set compare whole instance against whole instance predecessor. All sets count, because the instance signatures already match.
- **Payload** (`services/_progress_comparisons.py`):
  - Remove `included`, `comparison_type:'excluded'`, `progress_view_id` and `progress_view_config`.
  - Add `comparison_context: {mode:'same_tags'|'tags'|'all', tag_ids, tags[]}` and `previous_instance_id`.
  - Each set comparison carries `previous_instance_id`, because a set group can come from a different prior session.
- **Override endpoint:** `PUT /<root>/activity-instances/<id>/progress-comparison` with `{mode, tag_ids?, version}`. It returns the recomputed `progress_comparison` so the card updates without a refetch. It is `@idempotent` and goes through the offline op queue as a new `SESSION_OP.PROGRESS_COMPARISON`.
- **Tag-assignment responses** (`PUT …/tags`) also return the recomputed `progress_comparison` for that instance.
- **Retire saved views:**
  - Drop `activity_progress_views` and `activity_definitions.active_progress_view_id`.
  - Delete `activity_progress_view_service.py` view CRUD, `_progress_config.py`, `ProgressViewConfigSchema`, `ActivityProgressQuerySchema`, the view events in `services/events.py`, and the endpoints `progress-views*`, `active-progress-view` and `progress-query`.
  - Remove `progress-history` too: it duplicates the timeline. Its client `getProgressHistory` and `progressHistory` keys are only invalidated, never read.

### 5. Timeline (Session Detail)

- **Endpoint:** `GET /<root>/activities/<id>/progress-timeline?instance_id=&limit=&offset=`.
  - The server resolves the instance's comparison context, excludes its session, and returns only **matching** past instances. It also returns `total_all` so the UI can show "8 of 30 sessions".
  - `mode` / `tag_ids` query parameters allow a read-only preview while the chooser is open, before it is saved.
- **`TimelinePanel.jsx` rewrite:**
  - Remove `ProgressViewControls` (the All/Any/None editor, Save/Save as/Rename/Delete).
  - At the top add a **Compare with** control with three options:
    - **Same tags** (default; shows the instance's tag chips)
    - **Specific tags…** (the family-grouped picker in controlled mode)
    - **All history**
  - Changing it calls the override mutation. That re-bases the card's hints for that instance only.
  - The card shows a small "comparing: All history" or tag-chip indicator next to the hints when an override is active, so a changed comparison is never invisible.
- **Rendering:** `ActivityTimelineList` drops the `timelineCardExcluded` styling. List items highlight the sets that were paired.

### 6. Pickers and manager UI

- **`ActivityTagEditor.jsx` (the shared picker):**
  - Options are the whole fractal catalog (`useActivityTagCatalog`), not `definition.tags`.
  - Sections are the families in order, then "Other tags".
  - Selected chips stay where they are, shown as selected, so positions don't jump. The "Assigned / Every activity / This activity" sections go away.
  - Single-select families show a "pick one" hint, and choosing a tag replaces its sibling on the client.
  - Search spans all families.
  - Remove the "Available to every activity" checkbox.
- **`CircuitScopeTagEditor.jsx`:** reuse the same family-grouped option builder instead of its own alphabetical sort. Extract that builder to `client/src/utils/tagPickerOptions.js`.
- **`ManageActivityTagsModal.jsx`:**
  - Tag rows are grouped under family headers, with family create, rename, delete and the "pick one" toggle.
  - Reuse the existing Earlier/Later controls for family order and tag order, and add a "Move to family" select.
  - Remove the scope and duplicates filters. Keep status, usage, search and "used on activity" (now derived from usage).
  - The rename conflict offers Merge.
- **Remove dead code:** the legacy `['activity-tags', rootId]` key, `reconcileMergedCatalog` binding rewrites, and catalog `activity_ids` / `bindings` fields.

---

## Data migration (Alembic, one revision per phase, all idempotent with a downgrade)

1. **`collapse_tag_bindings_and_dedupe`:**
   - Group definitions by `(root_id, normalized name)`. The survivor is chosen in this order:
     1. a global-scope tag;
     2. the tag with the most usage;
     3. the oldest tag.
   - Union instance and set links onto the survivor, repoint circuit scope tags, and log every merge.
   - Rewrite instance and set links from binding id to definition id, removing duplicate PK rows.
   - Rewrite planned-tag ids from binding id to definition id in `session_templates.template_data`, `program_session_plans.plan_data`, `activity_instances.prescription` and `circuit_runs.prescription`, using one SQL mapping table. Drop ids that can't be mapped, and log the counts.
   - Backfill `CircuitScopeTag.activity_tag_definition_id` from the run's root and the name (or create a definition), then set NOT NULL and drop `name` and `color`.
   - Add the `normalized_name` generated column and the unique index. Drop `scope`, `activity_tags` and the old triggers.
2. **`add_tag_families`:** create the families table and `definitions.family_id`.
3. **`tag_aware_progress_comparison`:**
   - Add the signature columns, triggers and a backfill.
   - Add the compare mode/version columns and the `activity_instance_compare_tags` table.
   - Drop `activity_progress_views` and `active_progress_view_id`.

Before release, run a dry run against a copy of the production backup in `backups/`, comparing link counts before and after.

---

## Phases (each ships green on its own)

| Phase | Scope | Key files |
|---|---|---|
| 1 | Single identity, no duplicates, universal assignment, planned-tag rewrite, circuit scope references | `models/activity.py`, `models/circuit.py`, `services/activity_tag_catalog_service.py`, new `services/activity_tag_assignment_service.py`, `services/circuit_tag_operations.py`, `services/prescriptions.py`, `services/_serialize_activities.py`, `validators/activities.py`, `ActivityTagEditor.jsx`, `PlanTagEditor.jsx`, `ManageActivityTagsModal.jsx`, `hooks/useActivityProgressViews.js` (renamed to `useActivityTags.js`), `utils/tagNames.js` |
| 2 | Tag families: model, endpoints, picker sections, single-select, manager UI | new `services/activity_tag_family_service.py`, `utils/tagPickerOptions.js`, `CircuitScopeTagEditor.jsx`, `ManageActivityTagsModal.jsx` |
| 3 | Signatures, same-tags predecessor, set-group pairing, per-instance override, retire views and progress-history | `services/_progress_instances.py`, `_progress_sets.py`, `_progress_comparisons.py`, `progress_service.py`, `blueprints/activities_api.py`, `services/events.py`, `offline/opKinds.js`, `offline/sessionOpHandlers.js` |
| 4 | Timeline "Compare with" UI, card override indicator, timeline highlighting | `TimelinePanel.jsx`, `ActivityTimeline.jsx`, `SessionActivityItem.jsx`, `SessionActivityProgressSummary.jsx`, `components/common/ProgressHint.jsx` |
| 5 | Docs | `index.md` (tags and progress sections, bounded history reads), `planning/ui-contracts-reference.md` (picker and timeline contracts), this plan copied to `planning/tag-families-and-tag-aware-progress.md` |

**Reused as-is:**
- Optimistic version and 409 `details.current` pattern
- `@idempotent` routes
- The offline op queue
- `preserved_target_keys` for circuit scopes
- The Earlier/Later ordering controls
- `ActivityTagBadges`
- `formatInlineProgressValue` and `ProgressHint`
- The `effective_time` ordering and completed-first predecessor priority

---

## Verification

- **Backend tests** (`./run-tests.sh backend`):
  - **Catalog:** create, rename and restore collisions, including whitespace and case variants and archived names; merge with prescription references; cross-fractal isolation.
  - **Families:** CRUD, ordering, single-select rejection (422), circuit-scope sibling replacement and restore.
  - **Progress:** same-tags predecessor across interleaved tagged and untagged sessions; completed-first priority; set-group pairing where a warmup group comes from an older session than the working group; `all` and `tags` overrides; override survives merge (FK repoint); signature trigger under every write path (assign, circuit scope, session creation from a template with planned tags, merge, hard delete).
  - **Migration test:** seed duplicates, bindings, prescriptions and views; upgrade; assert links, planned tags and circuit scopes are preserved; downgrade.
  - **Performance:** update `tests/performance/test_query_budgets.py` and `test_history_scaling.py`. The batch predecessor plus set groups must stay a constant number of queries per batch.
- **Frontend tests** (`./run-tests.sh frontend`):
  - The normalization fixture parity test.
  - Rewrite `ActivityTagEditor`, `ManageActivityTagsModal`, `TimelinePanel`, `SessionActivityItem.progress`, `CircuitTagControls` and `useActivityTags` tests.
- **End-to-end (Playwright):**
  - Extend `client/e2e/circuit-tags.spec.js` and add `tag-aware-progress.spec.js`:
    1. Tag set 1 "warmup" in session A.
    2. Repeat in session B and check that the hints compare warmup with warmup.
    3. Switch Compare with to All history; the hints re-base and an indicator appears.
    4. Reload; the override persists.
    5. Other sessions are unaffected.
    6. Create a duplicate-name tag in the picker; it offers "Select existing".
  - Run on desktop and mobile widths with no horizontal overflow.
- **Gates:** run the production build, type check, lint on changed files, and the backend type check on the touched services, then do a migration dry run against the backup copy.

---

## Implementation audit (2026-10-21)

### What shipped

- **One identity.** `activity_tags` (per-activity bindings) is gone. Instance, set and comparison
  links reference `activity_tag_definitions` directly, and circuit scopes are pure references.
  Database triggers keep every link inside its fractal and maintain `tag_signature`; they are
  installed by `create_all` (model DDL events) and by the migration, so tests exercise them.
- **No duplicates.** A generated `normalized_name` column has a unique `(root_id, normalized_name)`
  constraint that covers archived tags. Create and rename return 409 `tag_name_taken`. The pickers
  offer Add or Restore, and the manager offers "Merge into it". The Python, JS and SQL normalizers
  share `tests/fixtures/tag_name_normalization_cases.json`.
- **Families.** Families can be created, edited, deleted and reordered. Tags can be moved and
  reordered with `PUT /activity-tags/order`. "Pick one" is enforced at assignment (422); circuit
  scopes replace the sibling and restore it on removal; a newly "pick one" family reports its
  conflicting assignments.
- **Tag-aware progress.**
  - Predecessors are matched by instance tag signature in one batched SQL statement.
  - Set groups pair k-th set to k-th set by set-tag signature, each group with its own latest
    earlier instance.
  - Each instance has its own Same tags / Specific tags / All history override. It is versioned,
    goes through the offline queue, and is shown on the card.
  - The timeline lists only matching sessions ("N of M") and marks the paired sets.
  - Saved progress views and `progress-history` are removed.
- **Plan integrity.** Merge and hard delete rewrite planned-tag ids in templates, dated plans,
  session snapshots and instance prescriptions.

### Deviations from the plan

- All three backend phases landed together: progress views were retired anyway, so rewriting them
  for definition ids would have been throwaway work.
- There is one data migration (`f3a5c7e9b1d2`) instead of three. A follow-up (`a6c8e0f2b4d6`)
  corrects the normalization order to collapse whitespace first, then trim. Trimming first had let
  a trailing tab or newline slip past the unique index; this was caught by a new test.
- A new test also caught a correlation bug in the set-group `EXISTS` subquery. It was fixed before
  release.

### Verification

- Client: 1,998 unit tests pass; lint, build and the responsive audit pass. No changed file
  exceeds the maintainability limits.
- Backend: the new progress-comparison, catalog/family and circuit suites pass, and query budgets
  hold. basedpyright shows 15 errors, all pre-existing (18 at HEAD), so none were introduced.
- Migration: upgrade → downgrade → upgrade was exercised on a seeded copy holding duplicate names,
  bindings, set links, planned tags (stored both as a JSON string and as an object), saved views
  and circuit scopes.

### Remaining distance to S+

- No Playwright journey yet for "tag a warmup set → compare → override → reload". It is covered
  only by API and component tests.
- Per-set *yield* deltas in the history cards still compare by set position; per-metric set hints
  use tag-group pairing.
- Repository-wide gates still fail on unrelated, pre-existing items: maintainability for
  `CreateSession`, `Analytics` and `outbox`, plus the basedpyright baseline.
