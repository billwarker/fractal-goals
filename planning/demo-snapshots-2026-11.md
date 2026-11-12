# Demo snapshots: Admin publishes frozen copies of chosen fractals as the live demo

Branch: `feat/beta-launch-polish` · On approval, save as `planning/demo-snapshots-2026-11.md`.

## Context

The landing is now one hero, and the demo is the real app. But Admin and publishing still belong to the old landing.

- **The demo reads the owner's live fractal.** Anything the admin adds, edits or writes in a private note shows up in the public demo straight away. The demo also runs as the admin, which means admin-only feature flags show to visitors. It also follows the admin's account settings, which is why completed-goal colours needed a workaround.
- **Publishing builds a large JSON read-model nobody uses.** It holds the full tree with its history, the showcase sessions and programs, analytics instances and goal bullets: about 1,300 lines across `_landing_public_tree`, `_landing_showcase`, `landing_condition_analytics` and `landing_history_projection`. The landing downloads all of it just to draw two icons.
- **Admin still edits content for sections that were deleted.** That's the goal bullets, tree-view defaults, featured activity and analytics views. Empty bullets also block publishing.

**What you asked for:** Admin chooses which fractals are valid demos, and publishing **saves a snapshot** of each. The demo then shows that frozen copy, not the live fractal.

---

## Current grade, for this goal (F → S)

| Area | Grade | Why |
|---|---|---|
| Demo data isolation | **D** | The demo reads live, admin-owned data. Edits and private notes go public immediately, admin feature flags leak, and the account's preferences need special handling. |
| Publish pipeline | **C** | It's solid underneath: an advisory lock, a static GCS delivery written before commit, and revisions. But about 60% of what it builds is for deleted landing sections. |
| Admin UX | **D** | Editors for content that no longer appears, publishing blocked by invisible bullets, no idea what a demo visitor will see, and copy that only recently changed. |
| Landing payload | **C** | The full tree and showcase are fetched to render a label and an icon. |
| Copying a fractal | **F** | There's no clone or import anywhere. Only a hand-written hard delete exists (`AdminService._hard_delete_roots`). |
| **Overall** | **D+** | The demo works, but on the wrong data source, managed through a screen built for a page that no longer exists. |

## What S+ looks like

- **Publishing takes a faithful, frozen snapshot.** It's a full copy of the fractal: goals, levels, sessions, sets, metrics, programs, templates, notes, circuits, analytics dashboards, page layouts. The copy is owned by a dedicated **demo account** that can't log in, so the demo never touches a real person's data.
- **Demo URLs stay the same across republishes.** Each source fractal keeps the same snapshot root id, so `/demo/<id>/goals` links survive a refresh.
- **The copy can't silently go stale as the schema grows.** It's driven by the SQLAlchemy metadata, not a hand-written list. A test fails whenever a new table can be reached from a fractal and hasn't been classified as copied or excluded. A parity test checks that the API returns the same thing for the source and the snapshot, once ids are mapped.
- **An atomic swap.** Publishing snapshots everything under the existing lock in one transaction, writes the static delivery first, then commits. The old snapshot is removed in the same transaction. Unpublishing deletes the snapshot.
- **An Admin screen with one job.** Pick fractals, label and order them, and optionally choose the featured session and program for the tour. Publish. Each row shows when its snapshot was taken, its size, and "source changed since snapshot". "Open demo" shows exactly what visitors see.
- **A tiny public payload:** label, root name, icon, the tour's deep links and the appearance. Nothing else.

---

## Phase A: Snapshot engine (backend)

**New `services/demo_snapshot_service.py`: `DemoSnapshotService.snapshot(source_root_id, target_root_id, demo_owner) -> SnapshotResult(id_map, counts)`**

1. **Collect.** Walk `Base.metadata.sorted_tables`, adding rows until nothing new is found:
   - any row whose `root_id` is the source fractal, plus every goal in it;
   - any row in an association or child table whose foreign key points at a row already collected (for example `program_blocks`, `activity_sets`, `metric_values`, `session_goals`, `circuit_round_members`).
2. **Classify every table** in one explicit map, `COPY` or `EXCLUDE`.
   - **Excluded:** `agent_*`, `product_events`, `idempotency_records`, `media_assets`, `storage_uploads`, `goal_attachments`, `note_attachments` (the demo already serves no media), `users`, `app_settings`, audit and email tables.
   - **Foreign keys into excluded tables:** nullable ones become `NULL` (for example `notes.agent_run_id`), and a row with a non-nullable one is skipped.
3. **Remap.** Give every collected primary key a new UUID, except the root, which gets `target_root_id`. Then:
   - Any string column whose value is a collected id is rewritten. UUIDs are globally unique, so matching on the value is safe, and it also catches columns that hold an id without a declared foreign key.
   - JSON columns are walked deeply with the same rule (dashboard layouts, `template_data`, `plan_data`, note `content`, `query_spec`).
   - Owner and actor columns (`owner_id`, `user_id`, `created_by_user_id`, `set_by_user_id`) become the demo account.
   - Timestamps and soft-delete markers are copied as they are.
4. **Goal levels.** The app merges levels by name: system → the user's own → the fractal's own. So the snapshot gets the source's *effective* levels as **its own fractal-scoped levels**, from `GoalLevelService.list_goal_levels(owner, root_id=source)`, with only the ones the owner overrides copied. References to them are remapped; system levels keep their ids.
5. **Account-level data the fractal relies on.**
   - `analytics_query_profiles` referenced from the copied dashboards and views are copied to the demo account.
   - The owner's `completed_primary_color` and `completed_secondary_color` are saved in the published entry (see Phase B) and are not written to the demo account.
6. **Insert** with Core `insert()` in dependency order, in batches, bypassing quotas and services. Admins already publish under a lock, so it's one transaction.

- **Delete.** Move `AdminService._hard_delete_roots` into a shared `services/fractal_purge.py` and use it from both places, to remove a previous snapshot (`hard_delete_user` keeps working).
- **Demo account.** `DemoAccountService.ensure()` creates it on first publish:
  - `role='demo'`, username `fractal-demo`, an unusable password hash, no email delivery;
  - login is refused for `role == 'demo'` in `AuthService` (and tested);
  - Admin's user list and metrics leave it out;
  - feature flags see an ordinary non-admin user, which fixes the admin-flag leak.

## Phase B: Publishing on snapshots

- **Draft settings** (`LANDING_EXAMPLE_SETTINGS_KEY`): `[{source_root_id, label, sort_order, tour: {session_id, program_id}}]`, with session and program ids from the **source**. The source→snapshot id map is kept privately, under the same key, and never made public.
- **`LandingPublishService.publish_landing_examples`**, under the existing lock:
  1. Make sure the demo account exists.
  2. For each draft example:
     - purge the existing snapshot for that source, if there is one;
     - snapshot into the same target root id (a new one the first time);
     - map the tour picks through `id_map`, falling back to the most recent session and the first active program;
     - pick the tour's goal: the first Short, then Mid, then Long Term goal (this logic moves here from the client's `landingPageModel.findFirstGoalByType`).
  3. Purge snapshots of examples no longer in the draft.
  4. Build the **public manifest**, schema version 2: `{published_at, revision, examples: [{root_id (snapshot), label, root_name, icon: {shape, color, secondary_color, smart}, tour: {goal_id, session_id, program_id}, appearance: {completed_*}}]}`.
  5. Write the static GCS delivery (unchanged mixin), then commit. If GCS fails, roll back and leave the previous publish intact (the existing contract).
- **Demo session:** `appearance` now comes from the manifest. `root_appearance` and its query in `demo_access_service.py` are deleted. `published_root_ids()` and the rest of the boundary are unchanged, and now point at snapshots.
- **Admin status** (`GET /api/admin/landing-examples`): each draft row gets `snapshot: {root_id, taken_at, counts: {goals, sessions, notes, programs}, source_changed: bool}`. `source_changed` compares the source's latest `updated_at` across goals, sessions and notes with `taken_at`.
- **Delete:** `_landing_public_tree.py`, `_landing_showcase.py`, `landing_condition_analytics.py`, `landing_history_projection.py`, and the content, tree-view and analytics-view normalisers in `_landing_settings.py`. `AdminLandingExamplesUpdateSchema` is reduced to the new draft shape. The options endpoint returns only sessions and programs.
- **Migration:** none for the schema (`users.role` already exists). Existing settings carry over automatically: `root_id` → `source_root_id`, the showcase's `session_id`/`program_id` → `tour`, and other keys are dropped. The current cache stays live until the first publish.

## Phase C: The Admin screen, rebuilt (`Admin.jsx`, Landing Examples section → "Live demo")

- **Header.** "Live demo". One sentence: published fractals are copied as they are now; visitors explore the copy read-only, and later edits don't show until you publish again. "View landing page" and the published-at summary stay.
- **Add a demo.** Choose from admin-owned fractals not already added (existing eligibility).
- **Each demo row:**
  - the root icon, a public label (inline), order controls (`LandingExampleOrderControls`, kept) and Remove;
  - snapshot status: "Snapshot 12 Nov, 09:12 · 48 goals · 212 sessions", or "Not published yet", plus a "Source changed since snapshot" badge;
  - **Tour picks** (optional): featured session and featured program, each defaulting to "Auto";
  - **Open demo**, which links to `/demo/<snapshot root>/goals?tour=1` once published.
- **Footer.** Save draft, and **Publish demos** with a confirmation: "Copies N fractals as they are now and replaces the current demo." A progress state is shown while it runs. The only blocking issue is a missing label.
- **Delete:** `LandingGoalsEditor.jsx`, `LandingActivitySpotlightPicker.jsx`, the tree-view defaults fieldset and the content tabs; `utils/landingTreeViewSettings.js`; most of `utils/landingPageModel.js`. A new `components/admin/DemoExampleRow.jsx` keeps `Admin.jsx` from growing.

## Phase D: Client on the manifest

- **`Landing.jsx`:** icons come from `example.icon` (no `getGoalIconProps(tree)`), the root name from `example.root_name`, and the filter is on `root_id` instead of `tree`.
- **`demoTour.js`:** deep links come from `example.tour` (`goal_id`, `session_id`, `program_id`); the dependency on `landingPageModel` goes.
- **`landingPrefetch.js`:** `isLandingSnapshot` accepts schema version 2.
- **`DemoRoot` and `DemoGuide`:** filter on `root_id`; switcher icons come from `example.icon`.
- **`AuthContext` and the `DemoAuthProvider` appearance path:** unchanged; the data now comes from the manifest.

## Phase E: Verification

- **`tests/integration/test_demo_snapshots.py`:**
  - **Coverage guard:** every table reachable from `goals` through foreign keys is in `COPY` or `EXCLUDE`, so a new table fails the test until it's classified. This mirrors the blueprint guard in `test_demo_access.py`.
  - **Parity:** seed a rich fractal using the existing fixtures (levels with fractal overrides, sessions with sets and metrics, a program with blocks and days, templates, notes linked to sessions, goals and sets, a circuit run, a dashboard and analytics view, a completion condition with tags, a paused goal, soft-deleted rows). Snapshot it, then compare the source's and the snapshot's API responses once ids are mapped: goal tree, levels, sessions list and session detail, programs, notes, activities, analytics dashboards and page surfaces. They must match.
  - **Isolation:**
    - no copied row references the source owner, a source id, an agent row or media;
    - editing the source afterwards leaves the snapshot unchanged;
    - republishing keeps the snapshot root id and leaves no rows behind from the old copy (row counts return to the same level);
    - unpublishing deletes it.
  - **Demo account:** it can't log in, isn't in Admin's user list or metrics, and doesn't see admin feature flags.
  - **Publish failure:** if GCS fails, the previous manifest and snapshot are untouched.
- **Update existing tests:**
  - `test_demo_access.py` publishes through the real snapshot path, and the route matrix runs against a snapshot;
  - `test_admin_api.py` landing tests;
  - `test_landing_publish_lock.py`;
  - `test_query_budgets.py`, adding a publish budget for a fractal with about 500 sessions.
- **Fixture:** `scripts/browser_test_server.py` publishes through the snapshot path.
- **Vitest:** the Admin Live demo section (add, label, reorder, tour picks, publish confirmation, status, source-changed badge), plus `Landing` and `demoTour` on the v2 manifest.
- **e2e:**
  - `admin` sweep surface updated;
  - `demo.spec.js` and `landing.spec.js` pass unchanged against snapshot data;
  - a new admin spec publishes, opens the demo, edits the source, and checks the demo is unchanged until the next publish.
- **Full suites:** backend, Vitest, lint, typecheck, the responsive, maintainability and contrast audits, and the quick sweep.
- **Docs:** update `index.md`'s Landing and Live demo paragraphs (the snapshot contract, the demo account, the coverage guard) and write a delivery log.

## Critical files

- **New:** `services/demo_snapshot_service.py`, `services/fractal_purge.py`, `services/demo_account_service.py`, `tests/integration/test_demo_snapshots.py`, `client/src/components/admin/DemoExampleRow.jsx`
- **Changed:**
  - backend: `services/landing_publish_service.py`, `services/_landing_settings.py`, `services/admin_service.py`, `services/demo_access_service.py`, the auth/login service, `blueprints/admin_api.py` and its validators, `scripts/browser_test_server.py`
  - client: `client/src/pages/Admin.jsx`, `Landing.jsx`, `demo/demoTour.js`, `demo/DemoGuide.jsx`, `demo/DemoRoot.jsx`, `utils/landingPrefetch.js`
- **Deleted:** the four landing read-model services, `LandingGoalsEditor`, `LandingActivitySpotlightPicker`, `landingTreeViewSettings`, most of `landingPageModel`, and their tests.

## Reuse

- The advisory publish lock, revisions and GCS static delivery (`landing_publish_service.py`, `_landing_static_snapshot.py`)
- `AdminService._hard_delete_roots` (moved into the shared purge)
- `GoalLevelService.list_goal_levels`, for the effective levels
- `_list_admin_owned_roots` and `_validate_landing_example_roots`, for eligibility
- `LandingExampleOrderControls` and `LandingPublicationStatus`
- the whole demo boundary (`demo_access.py`), which now serves snapshots unchanged

## Assumptions (edit inline if wrong)

- Only admin-owned fractals can be demos, as now.
- Snapshots keep their original dates. "Age" and "3 weeks ago" drift until the next publish; the source-changed badge and a re-publish keep it current. Shifting dates to stay fresh could come later.
- Media isn't copied (the demo already shows no media).
- Publishing is synchronous. A fractal with about 500 sessions should copy in a few seconds; the query-budget test enforces this.

## Open items (unchanged)

- Cloud Run `min-instances 1` needs your go-ahead.
- `onboarding_v1` still needs turning on in Admin.

---

## Delivery log (2026-11-12)

All five phases delivered.

- **A. Snapshot engine:** done as planned, plus four things the plan didn't foresee, each found by copying real fractals in a rolled-back transaction:
  - generated columns (tag `normalized_name`) are left to the database;
  - unique values that aren't references (`event_logs.event_id`) get a derived value of their own;
  - the `activity_instances` insert trigger, which applies remembered progress defaults and compare tags, is undone after the insert (`INSERT_TRIGGER_EFFECTS`);
  - the link `UPDATE` keeps `updated_at` as copied.

  Ids are **derived** (uuid5 of the snapshot root and the source id) rather than random, so deep links into the demo survive a republish and the e2e specs can compute them (`client/e2e/demoIds.js`). Purge walks the same graph instead of moving `AdminService._hard_delete_roots`, so copy and delete can't drift apart. Saved analytics queries are account-level and referenced by no dashboard, so they're excluded.
- **B. Publishing:** the four landing read-model services are deleted (about 1,300 lines). Drafts saved under `showcase` carry over to `tour`. The demo session takes appearance from the manifest.
- **C. Admin:** `components/admin/LiveDemoPanel.jsx` and `DemoExampleRow.jsx` replace about 450 lines of landing editors in `Admin.jsx`. Each row shows the snapshot's age and size, "Source changed since snapshot", Open demo, and optional tour picks. Publishing asks first, and the only blocking issue is a missing label.
- **D. Client:** the landing, guide and tour read the manifest through `demo/demoExamples.js`. `landingPageModel.js`, `landingTreeViewSettings.js`, `LandingGoalsEditor` and `LandingActivitySpotlightPicker` are deleted.
- **E. Verification:**
  - `test_demo_snapshots.py` (9 tests) covers:
    - the coverage guard;
    - page-for-page parity over every allow-listed fractal page plus a session and a goal, ids mapped back;
    - levels;
    - the manifest;
    - isolation, including later source edits;
    - republish (stable links, no leftover rows) and unpublish;
    - purge guard, demo account and failed delivery.
  - `test_demo_access.py` now runs on a real snapshot.
  - Query budgets are set, and republishing a 500-session fractal costs only batch queries.
  - On the two real local fractals (8,742 and 5,989 rows), each copies in about 3 seconds with every column equal through the id map (`tag_signature` is recomputed from the copied tags), and purges in about 1 second to zero rows.
  - Fixed along the way: `GET /<root>/activity-instances` paginated without an `ORDER BY`; it is now ordered by `created_at, id`.

Corrections:
- The earlier audit's "admin-only feature flags could show in the demo" was wrong. Flags are global on/off switches with no per-user evaluation. Running as the demo account still keeps the demo away from the admin's account.

Not done / for later:
- There are no Admin surfaces in the visual sweep, so none were added.
- The e2e suite doesn't publish (republishing would swap the copy under the demo specs running alongside); publishing is covered by the backend tests.
- Snapshot dates drift between publishes, as planned.
- Your local dev database still serves the old published cache (your live fractals) until you press **Publish demos** once.
