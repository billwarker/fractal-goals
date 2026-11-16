# Quick Sessions without Templates: Create Session Rework

Status: delivered 2026-11-14 on `feat/beta-polish-2`. See **Delivery notes** at the end for where the
delivery differs from the plan.

## Context

Today a quick session is a *kind of template*. `template_data.session_type: 'quick'` holds a flat list of 1–5 activities. To log one, the user goes to Create Session → From Template, picks the quick template, and fills a modal (`QuickSessionModal`). That modal completes the session in one call (`POST /sessions/quick-complete`, saved on the device first through the outbox).

This causes four problems:
- The user has to build a template before they can log anything ad hoc.
- Templates carry two shapes, so the builder, validators, program-day filters and pickers all branch on type.
- Repeating a past quick session means editing a template.
- The completion endpoint creates and completes a session in several separate commits (`_session_creation.py:186`, then the instance updates, then `update_session`), so a failure partway through can leave a half-filled completed session.

**The outcome we want:**
- Templates have one shape.
- "Quick Session" is a third source in Step 0 of Create Session.
- The right column becomes a section-style container, like a Session Detail section: "Add activity" opens the selector, and the chosen activities appear as quick-entry cards (no timers, no per-card completion).
- Step 1 lists the user's 5 most recent quick sessions, each with "Repeat".
- The header button reads **Complete Session**.

## Grade of the current implementation: **C**

| Area | Grade | Why |
|---|---|---|
| Data model | C | The type is a JSON string copied into `Session.attributes`, and templates carry two shapes. There is no way to query for quick sessions (`session_filters.apply_filters` has no type filter). |
| Service correctness | C− | `create_completed_quick_session` is not atomic. It pairs instances to the payload by `activity_definition_id`, so a duplicated activity is silently dropped. It never checks that the template is quick. |
| Product usability | C | Logging ad hoc needs a template first. There is no way to repeat. A modal sits on top of a page that already has room. The 5-activity cap is arbitrary. |
| Frontend structure | B− | Good reusable parts: `QueuedQuickSessionProvider`, `quickMode` cards, `ActivitySelectorPanel`, the outbox `queueCompletion`. But add and remove are no-ops in the draft provider, and about 50 call sites branch on template type. |
| Offline | B+ | Drafts are saved on the device and completions go through the outbox with idempotent replay. |
| Tests | B− | The API and offline flows are covered. Not covered: program-day and plan rejection, the structure-edit guards, goal-link skipping, and the partial-failure case. |

## Target design (S+)

### Decisions
- **One template shape.** `session_type` is removed from templates. A migration converts each existing quick template into a normal template with one "Activities" section holding the same activities. The migration can be reversed through a marker.
- **Quick sessions come into being only when completed.** They are built on the device (a draft) and created already completed through `quick-complete`. `POST /sessions` never creates a quick session again. Quick sessions that already exist and were started some other way keep working in Session Detail.
- **No template behind a quick session.** The activities come straight from the payload. The limit is 1 to 20 instances, duplicates are allowed, and instances are matched to the payload by position.
- **Atomic.** One transaction creates the session, its instances, sets, metrics and completion. Domain events emit after the commit.
- **The session's marker stays where it is** (`session_data.session_type = 'quick'`). There is no schema change to `sessions`. A shared SQL expression keeps the new filter consistent with the read model.

### Backend

1. **Single-shape templates**
   - `validators/core.py:validate_session_template_data`:
     - Drop the quick branch.
     - Accept and strip a `session_type: 'normal'` sent by older clients and agents.
     - Reject `'quick'` with a 422: "Quick sessions no longer use templates — start one from Create Session".
     - Strip `converted_from_quick` on save.
   - Remove the type from:
     - `serialize_session_template` (`_serialize_sessions.py:485`).
     - The starter template (`template_service.py:23`).
     - `services/session_runtime.get_template_session_type`. Its callers should read the session's own marker.
   - `session_structure.build_template_data_from_session` and `build_duplicate_session_data`: saving a quick session as a template produces a normal template with one section. Duplicating a quick session is removed; duplication only happens on completed normal sessions in the UI anyway.
2. **Migration** (append-only, with SQL local to the revision, importing nothing from the app):
   - For rows where `template_data->>'session_type' = 'quick'`, rewrite to `{sections:[{name:'Activities', items:[{type:'activity', activity_id, item_key:<uuid>}]}], template_color?, converted_from_quick:true}`.
   - Downgrade restores the rows that carry the marker.
   - Log how many rows were converted.
   - In the same revision, add the partial index `ix_sessions_root_quick_recent` on `(root_id, session_start DESC) WHERE deleted_at IS NULL AND <quick predicate>`.
3. **Session creation** (`services/_session_creation.py`)
   - Delete the templated quick path: `_instantiate_quick_activities`'s template reading, the quick-template guards for program days and plans at L296–302, and `is_quick_template` in `_link_session_goals`.
   - `create_session` refuses a `session_type: 'quick'` sent by the client with 400 `quick_session_use_complete`. Agent sessions (`StrictSessionCreateSchema`) therefore can't create quick sessions either, which is correct.
4. **`quick-complete` rework**
   - New `QuickSessionCompleteSchema`, no longer extending `SessionCreateSchema`:
     - `id?` (UUID), `name?` (defaults to "Quick Session"), `session_start?` (when the draft started), `occurred_at?`, and `activity_instances` with 1 to 20 items.
     - Each item may now carry an `item_key` for position.
     - `template_id` is accepted and ignored, so outbox replays from older app versions still sync.
   - `create_completed_quick_session` is rewritten to:
     - Check that every `activity_definition_id` belongs to the root and is live.
     - Check the activity quota once.
     - Insert the session and its instances in order, then apply sets and metrics through flush-only variants of the existing `TimerService.update_activity_instance` and `SessionActivityService.update_activity_metrics` (add a `commit=False` seam).
     - Complete the session through the shared completion code (`_session_updates`: every instance completed, no duration).
     - Commit once, then emit events.
   - Clamp `session_start` with `services/occurred_at.py`.
   - Idempotent replay stays the same.
5. **Recent quick sessions read**
   - `GET /<root>/sessions?session_type=quick&limit=5&sort_by=session_start` via a new `session_type` filter in `session_filters.apply_filters`.
   - Move the `runtime_text` expression out of `session_list_read_model.py` into a shared helper in `session_runtime.py`, so the filter, the read model and the index predicate all use the same rule.
   - The client asks for `view=detail` (5 rows, with activities and values).

### Frontend

1. **Step 0, `SourceSelector`**
   - Add a third card: **Quick Session**, "Log activities as you go — no template needed".
   - Step 0 shows whenever there is more than one choice. With no program and no templates it still offers Template and Quick.
   - With several programs, the Program card leads to the existing `ProgramSelector` inside Step 1.
   - `sessionSource` gains `'quick'`, can be deep-linked with `?source=quick`, and the last source chosen is remembered in `useCreateSessionPreferences`.
2. **Right column, `QuickSessionSection`** (new, in `components/createSession/`). It reproduces the anatomy of `SessionSection`:
   - A header ("Activities", with a count).
   - A list of `SessionActivityItem quickMode` cards.
   - `SessionAddActivityButton` opens an inline `ActivitySelectorPanel` (activities only, `allowCreate`/`allowCopy`, no circuits, no type toggle, `closeOnSelect`).
   - Cards get a remove control in draft mode (a new `allowRemove` prop on the view; `quickMode` keeps timers and completion hidden).
   - The section is wrapped in `QueuedQuickSessionProvider`, where `addActivity` and `removeActivity` become real. They use a `buildDraftInstance(definition)` extracted from `utils/createSessionQuickDraft.js`.
   - It replaces `SessionGoalScopePanel` while the source is quick. `QuickSessionModal` is deleted.
3. **Left Step 1, `RecentQuickSessions`** (new)
   - Hook `useRecentQuickSessions(rootId)` with key `queryKeys.recentQuickSessions(rootId)` under the sessions root, so the existing invalidation after completion refreshes it.
   - Each row shows the date (relative), activity chips with their recorded values, a **Repeat** button and a **View** link (`/sessions?quickSessionId=`).
   - Repeat adds those activities to the draft with empty values. The previous values show as input placeholders, from a draft-only `repeatHints` field on each instance. If the draft already has input, Repeat asks whether to replace it or add to it.
   - The empty state reads "Quick sessions you complete will appear here."
   - A completion that is queued offline is inserted into this cache right away, marked "Waiting to sync".
4. **Header and footer action**
   - `CreateSessionActions` gains a quick mode: the label is **Complete Session**, disabled until at least one activity is added, with the summary "N activities".
   - It calls the existing `completeQueuedQuickSession` (device first, then the API fallback) with a new `buildQuickSessionPayload(draft)`.
   - On success it clears the draft, shows an inline "Saved" notice with a View link, and leaves the user on the page.
5. **Drafts**
   - The draft starts the first time an activity is added (`session_start` = that moment).
   - `hasQuickSessionInput` counts added activities, so a list of chosen activities survives a reload.
   - Drafts are versioned. An older template-based draft still loads, since it already holds instances.
   - The Resume/Discard notice stays.
6. **Mobile (768px and below)**
   - Quick mode renders `QuickSessionSection` inline as Step 1 under Step 0, and recent quick sessions become Step 2.
   - The selector opens as the bottom sheet `SessionSection` already uses.
   - The header's Session Goals toggle is hidden.
   - Complete Session goes in the sticky footer.
7. **Remove template quick-ness**
   - `TemplateBuilderModal` (the type toggle and quick list).
   - `templateBuilderState` / `templateBuilderItems` (quick fields, `MAX_QUICK_ACTIVITIES`).
   - `TemplateCard`.
   - `TemplatePicker` (type pill and label).
   - `SessionTemplateTypePill`: deleted if nothing else uses it.
   - `ProgramDayModal:85` (filter).
   - `SessionPlanChooser:35`.
   - `SessionGoalScopePanel:32`.
   - `useCreateSessionProgramContext:39`.
   - `createSessionPayload`'s quick branch.
   - `utils/sessionRuntime.getSessionRuntimeType` stops reading `template_data`. `isQuickSession` stays, for sessions only.
8. **Docs**
   - `index.md`: update the Sessions section and the interaction contracts line about quick sessions.
   - `planning/ui-contracts-reference.md`: add the Create Session quick contract.
   - Add a sweep manifest entry `create-session-quick` (`?source=quick`, with one activity added).

### Known limit (unchanged)
Create Session still redirects when a normal session is active. Quick-complete doesn't hold the active slot, so this could be relaxed later. It is out of scope here.

## Critical files
- Backend:
  - `validators/core.py`, `validators/sessions.py`
  - `services/_session_creation.py`, `services/_session_updates.py`, `services/session_runtime.py`, `services/session_structure.py`, `services/session_filters.py`, `services/session_list_read_model.py`, `services/template_service.py`, `services/_serialize_sessions.py`
  - `blueprints/sessions_api.py`
  - `migrations/versions/<new>.py`
- Client:
  - `pages/CreateSession.jsx` (+ `.module.css`)
  - `components/createSession/{SourceSelector,CreateSessionActions,QuickSessionSection*,RecentQuickSessions*}`
  - `contexts/ActiveSessionContext.jsx`
  - `components/sessionDetail/SessionActivityItemView.jsx`
  - `utils/createSessionQuickDraft.js`, `utils/createSessionPayload.js`
  - `hooks/useQuickSessionPersistence.js`, `hooks/useRecentQuickSessions.js`
  - `utils/queryKeys`
  - `components/modals/TemplateBuilderModal.jsx` + state/items

## Verification
- **Backend** (`./run-tests.sh backend`). Update or add:
  - `test_quick_session_completion_api.py`:
    - Completes without a template; keeps payload order including duplicates; rolls back fully when the 2nd instance fails (no session row); rejects foreign or deleted activities and more than 20; replays by `id`; an old payload with a `template_id` still syncs.
  - `test_templates_api.py`: `'quick'` is refused with 422; `'normal'` is stripped.
  - Migration test: converts, round-trips on downgrade, idempotent.
  - `test_sessions_api.py`: `POST /sessions` refuses quick; the `session_type=quick` filter, including old rows with `attributes.session_type`.
  - Performance budget for the recent query.
- **Frontend** (`./run-tests.sh frontend`):
  - `SourceSelector` (3 cards).
  - `QuickSessionSection`: add, remove, the selector opening and closing, mobile sheet.
  - `RecentQuickSessions`: repeat replace or add, hints, the queued row.
  - `CreateSessionActions` quick label and disabled state.
  - `CreateSession.test.jsx` quick flow rewritten (no modal).
  - Draft persistence with an activities-only draft.
  - Template builder tests trimmed.
- **E2E** (rebuild the client first; e2e serves the built dist):
  - Rewrite `quick-session-completion.spec.js`: Quick card → add two activities → enter values → Complete Session → 201 → appears in Recent → Repeat seeds the draft.
  - Update `offline-session.spec.js`'s quick path.
  - Update the fixtures in `scripts/browser_test_server.py` (remove the quick templates, seed one past quick session).
- `npm run sweep:quick` for the new surface in both themes at phone and desktop widths; `./run-tests.sh lint`.

## Delivery notes

- **Migration** is `aa1d1082d073_quick_templates_become_normal` (the planned id collided with an existing revision).
  It runs in the populated-upgrade gate; `tests/unit/test_quick_templates_become_normal_migration.py` covers
  conversion, idempotence and the downgrade.
- **No partial index.** The `session_type` filter reads the JSON through `session_runtime.session_runtime_text`, whose
  bound literals Postgres cannot match against a partial-index predicate, so an index would never be used. The
  recent-quick read is `LIMIT 5` over the root's sessions, newest first; it uses the existing root indexes.
- **The last source chosen is not remembered.** `?source=` deep-links a source, and a fractal with no program and
  no template opens on Quick Session. Remembering the choice would compete with the program-day auto-selection;
  left for a follow-up if wanted.
- **Atomic completion** needed two seams: `commit=False`/`pending_events` on `TimerService.update_activity_instance`
  and `SessionActivityService.update_activity_metrics` (events go to `pending_events` when given, else are emitted,
  like `update_session`). `create_session(commit=False)` now flushes before its refresh: the refresh used to drop
  the session's final `attributes` (its `activity_ids`) when the caller owned the transaction.
- **Quick-session duplication** is refused server-side ("Quick sessions are repeated from Create Session"); Repeat
  on Create Session replaces it.
- **Showcase seed** gains one quick session (`sweep-quick-session`), so the sweep's `create-session-quick` surfaces
  show a recent list and the demo snapshot copies a template-less quick session.
- **Known pre-existing failures** (also on `HEAD` before this work): `tests/performance/test_query_budgets.py`
  landing-publish budgets, and one basedpyright error in `services/landing_publish_service.py`.

### Follow-up (2026-11-15): plan components and a horizontal recent list

- The quick session's activities now use the program-day plan's components instead of Session Detail's
  quick-entry cards: `components/prescriptions/PlanItemRow` and `PlanSection` (extracted from the Days view's
  `SessionPlanCard` and `CompletedSessionCard`, which use them too, with their styles moved to
  `prescriptions/PlanItem.module.css`), `PrescriptionEditor` with `valueKind="logged"` and the new `allowTags={false}`,
  and `PlanItemPicker` (moved to `prescriptions/`, new `allowCircuits={false}`). Draft items hold their values in the
  plan editor's shape (draft version 3; older drafts upgrade). Last time's values are the editor's `previous`
  placeholders, so the "(last …)" chip and the draft-only `QueuedQuickSessionProvider` were removed.
- Set notes are logged too (`QuickSessionSetSchema.notes`); empty sets are not sent.
- Recent quick sessions are one horizontal, scroll-snapping row of fixed-width cards.
- Recent quick sessions show one card per distinct activity selection (the latest of each, from the last 30),
  activity names only; the card itself repeats the session (View and Repeat removed).
