# Notes update: dated program-day notes, pin options and carry-forward, guided goal reviews, note context

Branch: `feat/notes-update`. Confirmed 2026-11-09.

## Context

Notes work across goals, sessions and programs, but four gaps make them hard to use day to day:

- **Removed:** the Notes page's "Write note" creates loose fractal (`root`) notes plus an "Associator" link panel. This idea is half-built and we will revisit document-style notes later.
- **Program notes have no home.** The `program` context type exists, but no UI has created those notes since `a015d475`. A note can't target a dated program-day occurrence. `ProgramDay.notes` (`definition_note`) is display-only.
- **Goal reviews expose markdown.** `buildReviewTemplate` (`client/src/utils/goalReview.js:104`) pre-fills the composer with `## Review:` / `**What went well**` scaffolding the user edits by hand.
- **Pinning only sorts.** `pinned_at` sorts a note to the top. Nothing carries a note to the next time an activity is done. Plan notes render as small, unrelated text on the activity card. Session Detail never wires pin/unpin, and `PreviousNotesSection` and the `previousNotes` query are dead.
- **Feed cards lack context.** An activity-instance note shows only the activity name: no session link, no set values, no way to see the instance.

**Decisions so far:**
- Program notes attach to a **calendar date in the program** (revised from "dated occurrence"), are written at the bottom of the program day sidebar, and show **only in program views and the Notes feed**.
- Pin becomes a **dropdown of pin options**: "Pin to top" (today's behaviour) and "Pin to next <Activity>". A next-time pin shows on the next instance and is consumed when that instance completes.
- Plan notes and carried notes share one **pinned strip** on the activity card. Plan notes stay plan data and never enter the Notes feed.
- Goal reviews become a **guided form plus a read-only context panel**. Answers are stored as structured data, and the user never sees markdown.
- Feed cards get a **context line plus an expandable instance view**.
- **Notes page siderail design is deferred.** Rail layout is out of scope.

## Grade of the current implementation against this plan

| Area | Grade | Evidence |
|---|---|---|
| Note schema | **C+** | Polymorphic `context_type`/`context_id`, with values enforced only in Pydantic (`validators/notes.py:21`): there is no DB CHECK. No program/day/date columns. `pinned_at` is overloaded as the only "pin" concept. |
| Program notes | **D** | Category, type and label exist, but there is no write path in the UI. Nothing is per-date. `ProgramDay.notes` has no editor. |
| Pin semantics | **D+** | Sort-to-top only. Session Detail drops `pinNote`/`unpinNote` (`useSessionDetailController.js:184`). Activity history notes are fetched (`useSessionNotes.js:115`) but never rendered. `PreviousNotesSection.jsx` is dead. |
| Plan notes on cards | **C** | Shown correctly (`SessionActivityItemView.jsx:556, 622`), but visually unrelated to notes. |
| Goal reviews | **C-** | Rules engine is solid (`goal_review_rules.py`). Authoring is a markdown template. Reviews are unstructured, so they can't be rendered or charted. |
| Feed context | **C** | `serialize_note_display` has names only. Cards have no links (`NoteCard.jsx:240-284`). |
| Notes page composer | **C-** | The composer plus the Associator rail account for about a third of `Notes.jsx`'s state. `ComposeLinkPanel` is dead outside it. |
| **Overall** | **C** | Solid CRUD, feed and filter engine. The workflow features are missing or half-built. |

## S+ plan

### 1. Remove "Write note" from the Notes page

- `client/src/pages/Notes.jsx`:
  - Drop `composing`, the `compose*` state, `resetComposeLinks`, `handleCompose`, the "+ Write Note" action, the composer branch, `composeLinkPanel`, and the "Associator" labels.
  - Edit switches to NoteCard's inline editor (`onEdit={updateNote}` instead of `onEditRequest`).
  - Update the stale header comment at lines 4–5.
- `NotesMobileSheet.jsx`: drop the `composing` prop and the Associator title.
- Delete `ComposeLinkPanel.jsx` and its CSS in `NoteComposer.module.css` (`.standaloneLinkPanel` … `.activityEmpty`, `.linkTabs`, `.goalTree`).
- `NoteComposer`: remove the controlled-link props (`selectedGoal*`, `selectedActivity*`, `onGoalSelect`, `onActivitySelect`, `bare`). It keeps serving `GoalNotesView`. `GoalReviewView` stops using it (see §5).
- `useNotesPageQuery`: drop the now-unused `createNote` mutation from the page hook.
- Keep `root`/`fractal_note` display and filtering so existing fractal notes still show under General. Keep the API's `root` context for the agent. Empty-state copy points to where notes are written (sessions, goals, program days).
- Tests:
  - `Notes.test.jsx`: drop the root-note creation case and add "no write action".
  - `NotesMobile.test.jsx`: drop the associator case.
  - `NoteComposer.test.jsx`: drop the ComposeLinkPanel mock.
  - `e2e/note-media.spec.js:52`: move "explain unavailable cloud storage, preserve draft" to the goal notes composer.

### 2. Schema (one append-only migration after `a7c9e1f3b5d7`)

Columns added to `notes`:

| Column | Purpose |
|---|---|
| `program_id` FK programs `ON DELETE CASCADE`, null | Owning program for program and program-day notes. Backfilled `= context_id` for `context_type='program'`. |
| `calendar_date` DATE, null | The program calendar date (§3). |
| `carry_forward_at` TIMESTAMP, null | "Pin to next instance" is active (pending or consumed). |
| `carried_into_instance_id` FK activity_instances `ON DELETE SET NULL`, null | The instance that consumed the pin. |
| `review_data` JSONB, null | Structured goal-review answers (§5). |

Constraints and indexes:
- `ck_notes_context_type`: `context_type IN ('root','goal','session','program','program_date','activity_instance','activity_definition','circuit_run','circuit_round')`. This closes the missing DB CHECK; the migration aborts, listing them, if any row holds another value.
- `ck_notes_program_date_shape`: `context_type <> 'program_date' OR (program_id IS NOT NULL AND calendar_date IS NOT NULL)`.
- `ck_notes_carry_forward_shape`: `carry_forward_at IS NOT NULL OR carried_into_instance_id IS NULL` (only a pin can be consumed; "needs an activity" is enforced in the service, since `activity_definition_id` is `SET NULL` on delete).
- `ck_notes_review_data`: `review_data IS NULL OR note_kind = 'goal_review'`.
- Partial index `ix_notes_pending_carry` on `(root_id, activity_definition_id)` where `carry_forward_at IS NOT NULL AND carried_into_instance_id IS NULL AND deleted_at IS NULL`.
- Index `ix_notes_program_calendar_date` on `(program_id, calendar_date)` where `deleted_at IS NULL`.
- Index on `carried_into_instance_id`.

`models/common.py` Note gets matching columns and relationships. `program_date` joins the Programs category in `note_filter_spec.CATEGORY_CONTEXT_TYPES`, `utils/noteTypes.js`, and `tests/fixtures/note_categories.json`. A new note type `program_date_note` is labelled "Program Date Note".

### 3. Program calendar-date notes (revised 2026-11-09)

*Revision:* notes belong to a **calendar date in the program**, not to a program day. The quick-note
widget sits at the bottom of the day sidebar, not inside the program-day card.

**Backend**
- `context_type = 'program_date'`, `context_id = program_id`, plus `program_id` and `calendar_date` on
  the note (`ck_notes_program_date_shape`, index `ix_notes_program_calendar_date`). No `program_day_id`.
- `services/note_program_dates.py`: `validate_program_date_note` (program in this fractal, date inside
  the program span, no goal/session/activity links) and `load_date_notes`.
- Notes stay on their date whatever is scheduled, moved or unscheduled there.
- The day read model (schema v9) returns `detail.notes` for the detail date. The feed adds `program_name`.

**Client**
- `components/programs/ProgramDateNotes.jsx`: a "Notes" card at the bottom of `ProgramDayPane`, with
  `NoteTimeline` plus `NoteQuickAdd` ("Add a note for Nov 12…"). Past dates stay writable.
- `hooks/useProgramDateNotes.js`: create, update, delete and pin; refetches the day read model and the Notes feed.

### 4. Pin options and carry-forward

**Pin dropdown.** `NoteOptionsMenu` replaces "Pin note / Unpin" with a **Pin ▸** submenu:
- **Pin to top**: today's `pinned_at`.
- **Pin to next <Activity>**: shown only when the note has an `activity_definition_id`, i.e. activity-instance, set, circuit member, and activity-definition notes. A pending next-time pin shows "Unpin from next <Activity>".

Both can be active at once. The card badge reflects each: a pin icon for top, and "Next <Activity>" for carry.

**Backend**
- New `services/note_carry_forward.py`, the canonical owner:
  - `set_carry_forward(db, note, on)`: sets or clears `carry_forward_at`. It refuses to change a pin that is already consumed (409 `note_carry_consumed`).
  - `pending_for_session(db, root_id, session)`: returns pending notes whose `activity_definition_id` is among the session's instances, excluding notes written in this session. It is grouped by definition and comes from one query on `ix_notes_pending_carry`.
  - `consume_for_instances(db, instance_ids)`: sets `carried_into_instance_id` on the matching pending notes in the same transaction. It is called from the activity-instance completion path (`services/timer_service.py`) and from the session completion path (`services/_session_updates.py`, covering bulk/quick completion). If the same activity appears twice in a session, the first instance to complete consumes the pin.
- `NoteUpdateSchema` gets `carry_forward: bool`, so the existing outbox `NOTE_UPDATE` op carries it and no new op kind is needed. `occurred_at` ordering already holds.
- Session read: a new `GET /<root>/sessions/<sid>/carried-notes` returns `{pending: [...], delivered: [...]}`:
  - `pending` is used for open sessions.
  - `delivered` holds notes with `carried_into_instance_id` in this session, so completed sessions show "Carried from Nov 2" as history.
  - The query key is `sessionCarriedNotes`, under the session-notes root so the outbox's post-drain refetch picks it up.
- `serialize_note` adds `carry_forward` (`'pending' | 'delivered' | null`) and `carried_into_instance_id`.

**Client: Session Detail**
- `useSessionDetailController.js:184`: pass `pinNote`, `unpinNote` and `setCarryForward` through, which fixes the missing pin wiring.
- New `components/sessionDetail/ActivityPinnedStrip.jsx`, rendered at the top of the card content in `SessionActivityItemView.jsx`, replacing the standalone activity `planNote` at line 556. Items:
  - **From plan**: the activity-level prescription note (`usePlannedValues.activityPlanNote`).
  - **From <date>**: carried notes for this definition. Set notes are labelled "Set N". The source session date links to that session.

  Items are read-only, and each carried item has a "Dismiss" control that unpins it.
- Set-level plan notes stay under their set rows (lines 622–623), because their position is the information. Circuit round plan notes are unchanged.
- Remove the dead `PreviousNotesSection.jsx` and its export, and the unused `previousNotes` query in `useSessionNotes.js:115-129` along with its controller plumbing. The carried strip replaces the "last time" need with an explicit, user-chosen mechanism.

### 5. Guided goal reviews

**Storage**
- `review_data` on the `goal_review` note: `{schema: 1, status: 'on_track'|'at_risk'|'off_track', went_well: str, change: str, next_focus: str}`.
- `validators/notes.py`: `GoalReviewDataSchema` caps each field at 2000 characters, and at least one field must be non-empty. It is allowed only with `note_kind='goal_review'`.
- The server derives `content` from `review_data` as plain labelled lines (`services/goal_review_content.py`), so search, the heatmap and quick-search keep working. The client never sends content for a structured review.
- Updates re-derive `content`. Old markdown reviews (`review_data IS NULL`) keep rendering as markdown.

**Client**
- `GoalReviewView.jsx`: rewritten as `GoalReviewForm`.
  - **Context panel** (read-only):
    - the description
    - `CompletionConditionSummary` for the goal's condition
    - child goals complete since the last review
    - activity days since the last review, from the existing goal timeline heatmap summary (`goalTimeline` root, no new endpoint)
    - due status (`describeGoalDue`)
    - the last review's answers, collapsed
  - **Form**:
    - a three-way status segmented control
    - three plain textareas with prompts: "What went well?", "What would you change?", "Focus until the next review"
    - attachments via `AttachMenuButton`
- `useGoalReviewActions.js` sends `review_data` and drops `content`.
- New `components/notes/ReviewNoteBody.jsx` renders structured reviews in NoteCard (status chip plus the labelled answers) everywhere cards appear.
- Delete `buildReviewTemplate` and its tests.

### 6. Note context in the feed

- `services/note_display_context.py` batch-enriches each feed page (≤100 rows; fixed query count, asserted by a performance test):
  - **Activity instance or set notes**:
    - `session_started_at`
    - `session_template_name`
    - `instance_completed`
    - `set_summary`: the noted set's formatted metric values, using the existing metric formatting
    - `instance_set_count`
  - **Goal notes**: `goal_path`, the ancestor names up to two levels.
  - **Program-date notes**: `program_name` (and `calendar_date` from the note).
- `NoteCard` gets a **context line** with real links:
  - Session notes link to Session Detail.
  - Goal notes use `utils/goalDeepLink.js`.
  - Program notes go to the program calendar at that date.
- **Expandable instance view**: a "Show activity" toggle on instance and set notes lazy-loads `GET /<root>/notes/<id>/context`. That route returns the instance's sets (the noted set highlighted), the plan, and tags, rendered with the existing read-only set table used by `CompletedSessionCard`. The query key is `noteContext`, and it is cached and fetched only on expand.
- The feed's existing card context shown in session groups (`suppressSessionContext`) is kept, to avoid repetition.

### 7. Docs

- `index.md` Notes section: dated program-day notes, pin options and carry-forward ownership (`note_carry_forward.py`), structured reviews, and the new CHECKs.
- `planning/ui-contracts-reference.md`: the pinned-strip and pin-menu contracts.

## Critical files

- **Backend:**
  - `models/common.py`
  - `migrations/versions/<new>_notes_program_day_carry_review.py`
  - `validators/notes.py`
  - `services/note_service.py`
  - `services/note_carry_forward.py` (new)
  - `services/goal_review_content.py` (new)
  - `services/note_display_context.py`
  - `services/_serialize_notes_misc.py`
  - `services/note_filter_spec.py`
  - `services/_program_days.py`
  - `services/program_day_read_model_service.py`
  - `services/timer_service.py`
  - `services/_session_updates.py`
  - `blueprints/notes_api.py`
- **Client:**
  - `pages/Notes.jsx`
  - `components/notes/{NoteCard,NoteOptionsMenu,NoteComposer,ReviewNoteBody}.jsx`
  - `components/programs/ProgramDayPane.jsx`
  - `components/sessionDetail/{SessionActivityItemView,ActivityPinnedStrip}.jsx`
  - `components/goalDetail/GoalReviewView.jsx`
  - `hooks/{useSessionNotes,useSessionDetailController,useProgramDayNotes,useGoalReviewActions,useNotesPageQuery}.js`
  - `hooks/queryKeys.js`
  - `utils/noteTypes.js`

## Verification

- **Backend** (`./run-tests.sh backend`):
  - **Migration:** upgrade and downgrade, the CHECK pre-check, and the program backfill.
  - **Program-day note validation:** scheduled date, unscheduled date (409), foreign day, and a date outside the program.
  - **Move and unschedule:** a moved occurrence carries its notes; an unschedule keeps them and flags them.
  - **Carry-forward:**
    - setting a pin
    - pending notes listed for the next session but not the source session
    - consumption on instance completion and on session completion
    - the same activity twice in one session
    - unpin before consumption
    - a consumed pin can't be toggled
    - a deleted instance
    - tenant isolation
  - **Reviews:**
    - `review_data` validation
    - derived content is searchable
    - the review cadence restarts
    - legacy markdown reviews are untouched
  - **Feed context:** the fixed query count for a 100-row page (`tests/performance`).
- **Frontend** (`./run-tests.sh frontend`):
  - The Notes page has no write action and edits inline.
  - The pin submenu shows the right options by note type.
  - `ActivityPinnedStrip` renders plan and carried notes, and Dismiss works.
  - The program day pane notes block.
  - `GoalReviewForm` submits structured data, and `ReviewNoteBody` renders it.
  - The NoteCard context line links work and the expand toggle loads lazily.
  - The category fixture includes `program_date`.
- **e2e** (`./run-tests.sh browser`):
  - Write a note on a program day in the side pane, then find it under Programs on the Notes page.
  - Pin an activity note "to next"; it appears in a new session's strip and is gone after that instance completes.
  - Write a guided review and see it rendered on goal details.
- **Manual:** run the app on desktop and mobile widths. Check the pinned strip on a narrow card, the pane notes on the mobile sheet, and the review form on a mobile goal modal.
- Run `./run-tests.sh lint` and `./run-tests.sh maintain` (file budgets for `Notes.jsx`, `NoteCard.jsx` and `SessionActivityItemView.jsx`).

## Open points to settle while iterating

- Whether review status should feed anything (e.g. a goal badge) or stay on the note only. The default is note only.

## Delivery notes (2026-11-09)

- **§3 revised:** notes are on a program's calendar date (`program_date`), not on a program-day
  occurrence, and the quick-add sits at the bottom of the day sidebar.
- **Carry-forward consumption** runs in one ORM `before_flush` hook (`services/note_carry_forward.py`),
  not in each completion path. A DB trigger was rejected because quick sessions, which never show notes,
  are identified in JSON attributes. Completing a session also consumes, so untimed activities in a
  finished session don't keep a pin forever.
- **Program-date writes** refetch the day read model rather than patching it optimistically.
- **Program notes link** to the program, not the date, because the calendar has no date deep link yet.
- **Feed N+1 fixed along the way:** set notes lazy-loaded `Note.activity_set` one by one; the shared load
  options now batch it. A test pins the feed's query count to page size.
- **Contracts regenerated:** `client/src/offline/serverContract.json`,
  `agent_adapter/agent_proposal_schema_v1.json` and `tests/fixtures/analytics_catalog_fields.json`. The new
  note columns hold only the owner's data.
- **§6 revised:** the activity context is always shown when the instance has recorded values. The feed
  embeds each instance's sets and plan note, so there is no toggle and no per-note `/context` request
  (that endpoint was removed). "Open session" sits on the session group header. Consecutive notes on
  one instance group under one activity header.
- **Pinning revised:** "Pin to top" is retired: no menu item, pinned section, "pinned only" filter or
  pinned-first ordering, and the pin/unpin routes are gone. Old saved filters with `pinned_only` still load;
  a queued offline `pin` is ignored. The `pinned_at` column is kept but unread; dropping it is a separate,
  backed-up decision. Session notes can be pinned to the next session (`carried_into_session_id`, migration
  `d4f6b8a0c2e3`). Pending pins show only in open sessions.
- **Not yet done:** the three browser (e2e) journeys in Verification, and the manual mobile pass.
  The pinned strip covers standalone activity cards; circuit members keep their round plan notes.
