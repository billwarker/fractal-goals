> **Status: in progress (started 2026-11-25, branch `feat/device-sync-native-apps`).** All stages are being
> built in order; the owner waived the checkpoints between them.
>
> | Part | State |
> |---|---|
> | Phase 0.2 per-device sign-in (API and Settings → Account list) | Built |
> | Phase 0.3 client ids on creates | Built for goals, fractals, activities, groups, metrics, tags, families, circuits, templates, programs, blocks, days, calendar periods and sessions. Dashboards, note filters, surfaces and dated plans stay online-only |
> | Phase 0.4 version gate (server) | Built (`min_supported_build`; feed carries `protocol`) |
> | Phase S.1 change log, S.2 `snapshot` and `changes` | Built |
> | Phase S.3 offline writes: safe retries on every fractal write, field merging, conflict records | Built; Settings → Sync shows conflicts |
> | Web: open pages refresh on another device's changes | Built (`client/src/sync/changeListener.js`) |
> | Phase 0.1 OpenAPI | Built: `docs/api/openapi.json` lists every API route; what the apps read (sync, sign-in, goals, sessions, notes, programs, templates, activities) is fully described and checked against every response in the test suite; other responses are listed untyped. CI refuses a breaking change |
> | Phase 0.5 in-app storage consent | Built (`POST /api/storage/<provider>/complete`; the shell's `authorize` command) |
> | Phase 0.5 app links | Built; the association file is absent until `APPLE_APP_ID` is set |
> | Phase 0.5 reminders | Built as a read (`GET /api/reminders/upcoming`); notifications, and the Settings switches for `preferences.reminders`, come with the first app that shows them |
> | Phase S conformance fixtures and two-device chaos suite | Built against the real server (`tests/fixtures/sync_merge_cases.json`, `tests/integration/test_sync_two_devices.py`); the Swift engine runs the same cases later |
> | Phase W offline reading (every screen opened on the device) | Built (`client/src/offline/queryPersistence.js`) |
> | Phase W offline writes outside sessions | Built for creating and editing goals and goal notes from the Goals page and note dialogs; other editors and records need signal |
> | Phase W start a session offline | Built: templates and program days. A saved dated plan needs signal. If another session is in progress when it syncs it waits, and the sync indicator offers to finish the other |
> | Phase W platform seam | Built (`client/src/platform/`): the shell injects `__FRACTAL_SHELL__`; `e2e/native-shell.spec.js` runs the same build as a pretend Mac shell. Private media loads with a one-hour read-only media token; an outdated build shows an update screen and keeps its queue. Not done: the Drive picker, opening an attachment's original without a browser sign-in, in-shell storage consent |
> | Phase W offline: new activities, new templates, template edits | Built. A template edit made against an older revision is refused for review, online too |
> | Phase W WebKit test project | Built (`webkit` in `playwright.config.js`); offline reloads are skipped there, which Playwright's WebKit can't do |
> | Phase W browsers in the device list | Deferred: browser sessions are stateless tokens, and making each a revocable record changes sign-in for everyone and adds a lookup to every request. "Sign out everywhere" covers them |
> | Phase M Mac app | Built, unsigned (`desktop/`): Keychain sign-in, unsent changes in app-owned files, menus and shortcuts, menu-bar session timer, window kept on close, reminders as macOS notifications (Settings → General), `fractalgoals://` links, storage consent in the system sign-in window, save dialogs. `npm run smoke` drives the real app. Not done: Developer ID signing, notarization and the updater (need an Apple Developer account), universal links. Production `CORS_ORIGINS` allows `tauri://localhost` from the next deploy |
> | Phase I iPhone | Not started: needs full Xcode and an Apple Developer account |
>
> **Design changes while building:**
> - The log is positioned by transaction id, not a per-user `change_seq`. A sequence value is assigned before
>   commit, so a slow transaction could land behind a cursor and be lost; transaction ids read below
>   `pg_snapshot_xmin` cannot, and need no lock.
> - The feed is per entity (a session with its sets), in the canonical serializer's shape, not per row.
> - Log rows are pruned after 30 days (not 90), and deletions need no separate tombstone table.
> - No `/api/sync/ops`: devices replay the ordinary REST writes with `Idempotency-Key`, as the session outbox
>   already does. A second write path would have duplicated every route's validation.
> - Merging covers free-standing text and dates (`MERGE_FIELDS`); structural edits keep their existing 409s.
> - The web keeps read results, not a mirror of records: server-computed views can't be rebuilt on the device,
>   so each screen opened is stored as it was (400 reads, 25M characters, 30 days; sessions first).
>   A screen never opened on that device isn't readable offline. The iPhone still needs the record mirror.
> - Deleting stays online-only (a delete cascades to children another device may have added), and so does completing a
>   goal until the server accepts the time it was done. Offline, both fail at once; a browser test holds that.
> - The log's triggers look rows up by id array and plan each time (migration `e5d9b2a7f3c8`): with plain joins a
>   stale plan scanned whole tables.
> - Edits send only the fields that changed; a field resent unchanged is never an edit.
> - The Mac app keeps the screens it has read in the web view's IndexedDB, the same code as the web, rather than
>   SQLite. Its unsent-edit queue goes in a file the shell owns (Phase M), so macOS can't clear unsent work.
> - Online edits merge too: the goal form sends only what changed and what it held when the edit began, and stays
>   on that version while another device's changes arrive.
> - `platform.capabilities` lists what only the app does (menus, menu-bar timer, reminders); a browser simply goes
>   without each: its page already has shortcuts and a session timer.
> - The Mac app has no auto-updater yet: Tauri's updater needs signed, notarized releases to install over. Until then
>   `MIN_SUPPORTED_BUILDS` shows the update screen, and a new build is installed by hand.
> - Reminders are planned on the Mac from `GET /api/reminders/upcoming`, at 9:00 local time; a session left running is
>   reminded of from the app's own view of it, three hours after it began. They are switched on per Mac.
> - Unsent changes are one file per change, written beside and renamed over, with the folder synced, so a crash leaves
>   either version; the client sends them to the shell one at a time, in order.
> - Programs stay online-only offline: their calendar rules can refuse a change, and one refused days later
>   is worse than one refused now. Activity edits (not creates) too: their metrics can't be merged.
> - A queued change waits for any change, in any queue, that creates an id it mentions.
> - Set and value lists in a session merge: a save sends the list it began from (`base_sets`, `base_metrics`), so sets
>   logged on two devices are all kept. The same set edited on both keeps the last to arrive.
> - A native consent is finished by the signed-in app, never by the callback, so nobody's storage can be joined to
>   another account; `keep_alive` uses quiet grants so providers don't expire them.
> - No SSE stream: it would hold a Gunicorn worker per open tab. Visible clients poll every 15 s; one indexed read.
> - Transactions anywhere on the Postgres server hold the feed back until they finish (late, never lost).
> - After any database restore, `reset_sync_epoch` must run, because transaction ids restart.

# Native Apple apps with cross-device sync: native iPhone, wrapped-web Mac

## Context

Fractal Goals is a React/Vite web app with a Flask/Postgres API. You want the signed-in app (not the
landing page or the demo) on iPhone and Mac, and a user's data **synced across their devices**. Each
device should hold a full local copy that works offline. Changes made on one device while offline
should reach the others once it reconnects.

The approach follows Spotify's split:

- **iPhone: native SwiftUI for practice** (logging sessions, timers, notes, reminders, widgets).
  Other screens open the web app inside the iPhone app until there's a reason to build them natively.
- **Mac: the existing React app in a Tauri 2 shell.** The React code adds a native shell for Keychain
  sign-in, menus, a menu-bar timer, notifications and deep links, plus a **local SQLite copy** of the
  user's data.
- **Web and Mac are one client.** They use the same React bundle, routes, feature flags and sync engine
  (IndexedDB on the web, SQLite on the Mac), and run the same test suite. They differ only through
  `client/src/platform/` adapters and declared capabilities, and every desktop-only capability has a
  web fallback. One pipeline releases both, so they can't drift apart.
- **The server is the sync hub.** Devices never sync directly with each other. Every device pulls from
  one change feed, pushes through one operation log, and follows one set of conflict rules. A shared
  conformance suite keeps the Swift and JS sync engines in agreement.

Distribution: iPhone through TestFlight, Mac as a notarized DMG with auto-update. Public App Store
submission comes later.

### Size of the work

| Thing | Size today |
|---|---|
| Web client (reused on Mac, rebuilt for iPhone) | ~104k lines of JS/JSX, ~35k lines of CSS |
| API | 312 routes in 43 blueprints. No OpenAPI spec. Responses are untyped serializer dicts |
| Mirrored domain rules | 13 shared JSON fixtures in `tests/fixtures/` |

### Stages and checkpoints

The work runs in stages. Each stage ships on its own, and a checkpoint decides whether the next one
starts. Nothing past the current stage is committed to.

| Stage | Contents | Estimate (experienced / AI-assisted) | Ships |
|---|---|---|---|
| **1. Sync for everyone** | Phase 0 (contract, device sign-in, client UUIDs), Phase S (sync server and conformance), Phase W (shared web/desktop client, web fully offline) | 16–21 / 10–13 weeks | The web app, offline and synced across browsers and devices |
| **2. iPhone for practice** | Phase I-core: native sign-in, goals (browse, details, light edits), Create Session, Session Detail, notes, reminders, Live Activity, widgets, quick-log intents. Other screens open the web app | 16–20 / 10–13 weeks | TestFlight to beta users |
| **3. Mac shell** | Phase M: Tauri around the shared client | 3–4 / 2–3 weeks | Notarized DMG. Can run any time after stage 1, alongside stage 2 |
| **4. iPhone parity, on demand** | Phase I-later: native programs, analytics, settings depth, admin, agent, one screen at a time | Per screen | Only screens people ask for |

**Stages 1–3: about 8–11 months for an experienced engineer, about 5–7 months AI-assisted.** That is
before any stage-4 work, which is open-ended by design.

**Checkpoints:**

- **Before stage 1 (now). Look at the data you already have.**
  - In Admin → Usage, find the share of completed sessions on phone-sized screens, and the share of
    sessions with outbox retries (time offline).
  - This tells you whether stage 2's priority is right. It does not block stage 1, which pays off for
    every user either way.
- **Stage 1 → 2.** Sync has run in production for at least 4 weeks with:
  - integrity-check mismatches below 0.1% of syncs
  - no lost-data reports
  - conflicts and rejections per op type understood, with each rejection reason having a resolution
    path the user can act on
  - phone-sized screens accounting for at least 30% of completed sessions, or explicit user requests
    for an app (if not, pause native work and spend the time on product features)
- **Stage 2 → 4.** After 6 or more weeks on TestFlight with at least 10 beta users:
  - native users complete more sessions per week than they did on phone web (their own baseline)
  - 4-week retention is at least as good as web
  - Then build stage-4 screens ranked by how often iPhone users jump out to the web view (tracked as
    a `web_fallback_opened` event with the screen as an enum).
- **Stage 3.** Build the Mac app when a user asks for it, or when you want a menu-bar timer yourself.
  It is cheap once stage 1 exists.

**Cost per feature after stage 2.** Every practice-screen feature is built twice, in React and in
SwiftUI. Keeping the iPhone scope to practice screens limits that to the screens where native earns
it. Desk work (planning, analytics, admin) stays single-codebase on web and Mac.

Sync adds about 2 months compared with per-device caches. It is the part where mistakes lose user data,
so it gets the most testing.

---

## Grade: the codebase today, measured against this plan

| Area | Grade | Why |
|---|---|---|
| Cross-device sync | **D+** | Devices see each other's changes only by refetching while online. There is no change feed, cursor, or rule for resolving conflicting edits; writes simply apply in whatever order they arrive. Groundwork exists: sessions, notes, circuits and activity instances accept client UUIDs (`validators/sessions.py:125`, `notes.py:83`, `circuits.py:48`). Goals, programs and activities have `row_version` (`models/goal.py:221`, `program.py:60`, `activity.py:32`). In-session writes carry `Idempotency-Key` and `occurred_at`. But goal, program, template and tag creates take server-assigned ids, so they can't be made offline. Invariants such as "one unfinished session per fractal" have no story for two offline devices. |
| Offline design | **B+** | ADR 0004's outbox is excellent (per-session order, a watchdog, a chaos test) but is single-device and in-session only. The persisted cache holds only session, activity and template queries for 48 h (`offline/queryPersistence.js:9-20`). |
| API contract readiness | **D** | 312 routes and no machine-readable contract. Responses are hand-built dicts that the client normalizes (`utils/goalNodeModel.js`). |
| Auth for native clients | **C+** | Bearer tokens are accepted (`blueprints/auth_api.py:114`). But refresh only works through the `SameSite=Strict` HttpOnly cookie plus CSRF (`utils/api/core.js:204-261`, `AuthContext.jsx:88-148`). There are no device tokens and no device list. |
| Web client readiness for a desktop shell | **B-** | `API_BASE` is configurable (`core.js:7`) and WebKit already runs the app on iPhone Safari. But host logic reads `window.location` (`utils/marketingHost.js`, `public/boot/shell.js`). Storage connect relies on `window.open`, `BroadcastChannel` and `window.close()`. There is no platform-adapter seam. |
| Web ↔ desktop parity guardrails | **C** | There is a single React codebase and one route table (`FractalRoutes.jsx`), which is a strong start. But there is no notion of a platform or of declared capabilities. Browser assumptions are spread across components, and the release of the web build has no counterpart for a desktop build. Nothing would stop a desktop-only branch or an outdated desktop build. |
| Domain-logic portability | **A-** | Shared fixtures already pin client↔server parity for the mirrored rules. Server read models are authoritative. |
| OAuth & deep links | **D** | Storage OAuth state is bound to a browser cookie (`blueprints/storage_api.py:86-99`). Google Picker is web-only. There is no `apple-app-site-association` file. |
| Notifications / reminders | **F** | No push, APNs, reminders or device registry. |
| Release infrastructure for Apple | **F** | No Apple targets, signing, notarization, updater or macOS CI. Version skew between installed clients and the server isn't handled. |
| App Store groundwork | **B+** | Account deletion and data export exist. There is no third-party sign-in and no billing. |
| Test & quality culture | **A** | Fixture parity, a chaos test, the visual sweep and budgets. A strong base for a sync conformance suite. |

**Overall: C.** Sync is the largest gap. The idempotency, `occurred_at` and client-UUID groundwork
makes it achievable without redesigning the domain.

---

## Sync design (the core of this plan)

### Model

- **The server is the source of truth.** Each device holds a mirror of the user's fractals: SQLite on
  both iPhone and Mac.
- **Reads** come from the mirror, so every screen works offline.
- **Writes** apply to the mirror at once, as pending rows, and join an ordered operation log (the
  outbox, generalized from ADR 0004).
- **Pull:** `GET /api/sync/changes?cursor=` returns upserts and tombstones for every entity the user
  owns, ordered by a per-user monotonic `change_seq`.
- **Push:** `POST /api/sync/ops` accepts a batch of operations. Each one is idempotent by `op_id`,
  carries `occurred_at` and `device_id`, and has a `base_version` for edits. The response gives a
  result per op (`applied`, `merged` or `rejected` with a reason) and the new rows.
- **Poke:** when one device's change commits, the other devices are nudged to pull. The Mac (and web)
  hold an SSE stream `GET /api/sync/stream` that carries only "cursor advanced". iPhones get a silent
  APNs push (`content-available`). Every device also pulls on launch, foreground and reconnect.
  Pokes are hints; the feed is the only data path.

### Conflict rules, by kind of change

1. **Creates use client UUIDs. They never conflict.**
   - Sessions, instances, sets, notes and circuits already work this way.
   - Phase 0 extends it to goals, programs, days, plans, templates, activities, metrics, tags and
     dashboards.
2. **Appends merge.** Sets, notes, timer events and evidence from two devices are all kept.
3. **Field edits are merged field by field, with last-writer-wins by `occurred_at` and `row_version`
   to detect clashes.**
   - An edit sends `base_version` plus only the fields it changed.
   - If no one else changed those fields, it applies.
   - If someone did, the newer `occurred_at` wins. The losing value is kept in a `sync_conflicts`
     record so the user can see it ("Changed on your iPhone at 7:02 — kept the Mac's newer value.
     Restore?").
   - Text fields (descriptions, note bodies) never silently lose text. When both sides edited, the
     loser's text becomes a conflict copy the user can restore in one tap.
4. **Invariant clashes are rejected with a reason, and the user resolves them.**
   - These come from the server rules: one unfinished session per fractal, the calendar invariants
     (overlap, one day per date), unique tag names (409 `tag_name_taken`), the single activity group
     per goal, and scope rules.
   - Each rejection is a typed reason with the conflicting entity attached. The client shows a
     resolution sheet, for example: "A session was started on your Mac while this iPhone was offline:
     keep both (complete the older one) / merge into one / discard this one".
   - The existing 409 codes become the reason codes, so the server stays the single authority.
5. **Deletes are tombstones**, matching today's soft deletes.
   - An edit to a deleted row brings the row back only if the user confirms.
   - A delete never removes appends that arrived after it from another device.

**Server-computed views stay on the server.** The program calendar evaluator, metrics, goal condition
progress, timeline, heatmaps and analytics are fetched and cached per device. Offline, they show
"as of last sync" with pending local changes listed on top. Goal completion flips once the device
syncs. Porting the pure `goal_condition_evaluator` for live offline progress is a later option, with
fixture parity.

### Scope and safety

- Each user's mirror is separate: one database per user per device.
- It covers every fractal the user owns, minus media bytes. Attachments are online-only, with
  thumbnails cached.
- Device data is protected at rest: iOS Data Protection; on Mac, the app's container plus a
  database key held in the Keychain.
- Signing out, device revocation (a 401 on the next sync) and account erasure all wipe the mirror.
- First sync downloads a bounded snapshot page by page, with progress shown, then switches to the
  feed.
- If the cursor has expired (it falls behind a compaction horizon of, for example, 90 days), the
  device resyncs from a fresh snapshot.

---

## S+ plan

### Phase 0: contract, device sign-in, groundwork (4–5 weeks)

1. **OpenAPI 3.1 contract.**
   - Pydantic response models next to the serializers.
   - `scripts/generate_openapi.py` builds the spec.
   - A route-walk completeness test, following `tests/integration/test_demo_access.py`.
   - Response validation in integration tests.
   - The sync entity schemas are part of the spec. Swift and JS types are generated from it.
2. **Per-device sign-in.**
   - `POST /api/auth/token` and `POST /api/auth/token/refresh`, with opaque rotating refresh tokens.
     Reuse revokes the whole chain.
   - A `user_devices` table: platform, name, hashed refresh token, `session_version`, last seen,
     APNs token, sync cursor.
   - Revocation goes through `revoke_user_sessions`. Settings → Devices lists and revokes devices.
3. **Client UUIDs for every create.** Optional `id` fields, validated as UUIDs, on the goal, program,
   day, plan, template, activity, metric, tag, family and dashboard create validators. Duplicates are
   refused across tenants.
4. **Version skew.** Clients send `X-Client-Platform` and `X-Client-Build`. The server returns
   `min_supported_build` and a `sync_protocol` version. Below either, the client shows an "Update
   required" screen. Spec changes stay additive, with a CI diff check.
5. **Native OAuth, universal links, reminders and telemetry.**
   - A nonce-bound native storage connect via `ASWebAuthenticationSession`, replacing the browser
     cookie.
   - `/.well-known/apple-app-site-association` in nginx.
   - `services/reminder_service.py` computes goal reviews due, today's program day and unfinished
     sessions. It feeds APNs pushes on iPhone and local notifications on Mac.
   - `platform` and `app_build` added to `tracking_plan.json` and privacy.md §2.3.

### Phase S: sync server and conformance suite (6–8 weeks)

1. **Change capture.**
   - One migration adds `change_seq bigint` to every synced table, set by an insert/update trigger
     from a per-user sequence. Rows already carry their owner through the fractal root.
   - A `sync_tombstones` table, filled from the soft-delete paths and from hard deletes.
   - A classification gate in the style of `COPY_TABLES`/`EXCLUDED_TABLES`: every fractal-reachable
     table must be declared synced or excluded. The test fails otherwise.
2. **`services/sync_feed_service.py` and `blueprints/sync_api.py`:**
   - `changes`: paginated by cursor, bounded by size, using the canonical serializers.
   - `snapshot`: the first sync, paged.
   - `ops`.
   - `stream`: SSE that carries pokes only, through Redis pub/sub (already a dependency) or Postgres
     `LISTEN/NOTIFY`. Check that Cloud Run's request timeout suits a long-lived stream; clients
     reconnect with the cursor.
3. **`services/sync_ops_service.py`:**
   - Maps each operation type onto the existing domain services. Services remain the only way to
     change data, so every invariant, reconcile and domain event still runs.
   - Field merges use `row_version`, and `sync_conflicts` records the losing values.
   - Rejection reasons reuse the existing 409 codes.
   - Idempotency by `op_id` is recorded inside the write's own transaction, as `@idempotent` already
     does.
4. **Existing endpoints.** The REST endpoints remain for read models, admin, the agent and external
   API use. The web and Mac app move synced entities onto the protocol in Phase W.
5. **Conformance suite** (`tests/fixtures/sync/*.json`).
   - Each scenario lists the starting state, ops from devices A and B in a given order and connection
     timing, and the expected server state, conflict records and device mirrors.
   - Scenarios cover:
     - offline creates on both devices
     - the same field edited on both
     - text edited on both
     - two offline session starts
     - a delete vs an edit
     - a tag name clash
     - calendar overlap
     - resync after an expired cursor
     - replayed ops
   - The server runs it in pytest. The JS and Swift engines run it against a fake transport.
6. **Chaos test.** Extend `outbox.chaos.test.js` into a two-device, seeded random-fault simulation
   (drops, reordering, duplicate deliveries, clock skew in `occurred_at`). It asserts that the devices
   end up identical to the server and that no appended data is lost.

### Phase W: one client for web and desktop (6–8 weeks)

Everything in this phase ships to the **web app first**. The Mac shell in Phase M then only adds
adapters and native extras.

1. **Platform seam and capabilities.**
   - `client/src/platform/` exposes one interface: `tokenStore`, `openExternal`, `startOAuth`,
     `saveFile`, `notify`, `store` (the mirror database), `appInfo`, plus a typed `capabilities`
     object, for example `{ menuBarTimer, nativeNotifications, keychain, globalShortcuts }`.
   - It has two implementations: `platform/web` (today's behaviour) and `platform/desktop` (Tauri IPC).
     One is chosen once at boot.
   - These callers move onto it: `useStorageConnections.js` (popup and BroadcastChannel on web,
     `ASWebAuthenticationSession`-style on desktop), the export download
     (`useAccountSettings.js:133`), `marketingHost.js` / `boot/shell.js` (desktop always opens the app
     root), and `serviceWorker.js` (web only; desktop assets are bundled).
   - **Parity rules, enforced by the maintainability audit:**
     - No `isDesktop`/`__TAURI__` checks outside `platform/`. Components ask for a capability instead.
     - No direct `window.open`, Blob downloads or `Notification` outside `platform/`.
     - Every capability declares its web fallback in `platform/capabilities.js`. For example, the
       menu-bar timer falls back to the in-page timer and tab title, native notifications fall back to
       Web Push plus the in-app reminders inbox, and global shortcuts fall back to in-page shortcuts.
       A unit test fails if a capability has none.
2. **Shared sync engine** (`client/src/sync/`, grown out of `client/src/offline/`).
   - The outbox becomes the general op log: same watchdog, drain lock and `navigator.locks` /
     BroadcastChannel coordination across tabs.
   - It adds the feed puller, the SSE poke listener and conflict handling. The UI comes from
     `components/sync/ConflictSheet` and a sync status indicator that replaces `SessionSyncIndicator`.
   - Storage is one `store` interface with two adapters: **IndexedDB on the web** and **SQLite
     (`@tauri-apps/plugin-sql`) on desktop**. Both pass one adapter contract test suite.
   - **Data layer.** The change sits below the query layer, so ADR 0002 holds:
     - query functions for synced entities in `utils/api/*` read from the mirror
     - mutations become ops
     - mirror change events invalidate the matching query-key roots
     - pages and hooks are unchanged, and read models still come over the network
   - The conformance suite and the two-device chaos test run in Vitest.
   - **Moving existing web users over.** On first load of the new build, drain any pending ops in the
     old outbox (`fractal-outbox:<userId>`) through the old path, then switch. Never translate them in
     place. A test covers this.
   - **Web storage eviction.** Browsers may evict a web mirror; Safari, for instance, does so for a
     site left unused for 7 days, unless it is installed. That is safe: the mirror resyncs. Pending
     ops are the only data that must survive, and they keep today's `navigator.storage.persist()`
     protection. The sync indicator warns when persistence is denied and ops are pending.
3. **Reminders on every platform.** An in-app reminders inbox. Web Push (VAPID, opt-in) on the web,
   local notifications on the Mac and APNs on iPhone, all fed by `services/reminder_service.py`.
4. **Settings → Devices** lists browsers as well as apps, so web sessions are visible and revocable
   too.

### Phase M: Mac app, Tauri 2 shell (3–4 weeks)

**Why Tauri 2:** it uses the system WebKit (already proven on iPhone Safari), downloads at about 10 MB,
has first-party plugins for SQL, deep links, notifications, updater and dialogs, and can produce a Mac
App Store build later.

1. **Desktop adapter.**
   - `platform/desktop` signs in with `/auth/token` and keeps the refresh token in the macOS Keychain
     through a Tauri command (`keyring` crate). `core.js` refreshes through `platform.tokenStore`.
   - CORS allows the shell's origin, with bearer auth and no credentials.
   - The SQLite store's encryption key lives in the Keychain.
2. **Shell** (`desktop/`):
   - Bundles the **same** `client/dist` build as the web app. One build is shared and the platform is
     picked at runtime, so there are no separate desktop source branches. Landing and demo roots are
     never entered on desktop.
   - Native menus that call the same router actions as the in-page shortcuts.
   - A menu-bar timer.
   - Local notifications.
   - Deep links mapped onto router paths.
   - Remembered window state.
3. **Release in step with the web.**
   - The Cloud Build deploy that promotes a web build also produces the notarized desktop release from
     the same commit and publishes the Tauri update manifest.
   - The desktop app checks for updates on launch and every hour, and installs at the next quiet
     moment (no session running).
   - `min_supported_build` lets the server force an update when a release changes the protocol.
   - As a result, a desktop install is at most one release behind the web app, and never on an
     incompatible protocol.

### Phase I: native iPhone app, SwiftUI (stage 2 is I-core; stage 4 is I-later)

**Web fallback screen.** Any surface not yet native opens in an in-app `WKWebView` that loads the
shared React client from `my.fractalgoals.com` (routes only, with no landing and no demo):

- **Sign-in:** the app hands its session to the page with a one-time code, never through the URL.
  The code is claimed atomically, per the invariants.
- **Data:** the web view uses the sync protocol like any other client, so its edits reach the native
  mirror through the normal feed.
- **Returning:** a native "Done" bar takes the user back.
- **Tracking:** opening one emits `web_fallback_opened` with the screen as an enum. This is the stage-4
  priority signal.

```
apple/
  FractalGoals.xcodeproj       # iOS app + widget + Live Activity extensions
  Packages/
    FractalAPI/       # generated from openapi.json (swift-openapi-generator)
    FractalSync/      # GRDB mirror, feed puller, op log, conflicts, silent-push wakeups
    FractalDomain/    # ported pure rules, tested over tests/fixtures/*.json
    FractalDesign/    # colours/type generated from design-tokens.css
    FractalFeatures/  # Goals, Sessions, Programs, Notes, Analytics, Settings, Admin
  PARITY.md           # every web surface → native screen and status, CI-checked
```

**Stack and data flow:**

- Swift 6 strict concurrency, minimum iOS 18, `@Observable`, NavigationStack (split view on iPad).
- Views read only from GRDB observations.
- `FractalSync` implements the same protocol as `client/src/sync/` and passes the same conformance
  suite and chaos simulation.
- Background work: `BGAppRefreshTask` and silent pushes trigger a pull; `BGProcessingTask` drains the
  op log.

**I-core (stage 2): I1, I2 and the practice parts of I5.**

1. **I1, foundations (5–6 weeks).**
   - Generated API client, Keychain auth with single-flight refresh, Sentry Cocoa.
   - `FractalSync`, green on the conformance suite.
   - Domain ports, each tested over its fixture: goal conditions and their wording, deadline rules,
     block weeks, day schedule, program goal window, circuit ids, tag names, theme schedule, set
     aggregation, session time, note categories, media types, SMART.
   - Design tokens exported by `client/scripts/export-design-tokens.mjs`, with contrast checked.
2. **I2, practice core (8–10 weeks). First TestFlight build, syncing with web and Mac.**
   - Sign-in, invite and reset password, Selection, Getting Started.
   - Goals list and flow tree. The `flowTreeLayout.js` geometry is ported, pinned by a node-position
     fixture.
   - Goal Details: read, edit description/due date/status, complete, notes and the review prompt.
     Condition editing and sequences use the web fallback.
   - Settings: Account, Appearance, Notifications and Devices are native. The other sections use the
     web fallback.
   - The web fallback screen and the `web_fallback_opened` event.
   - Create Session (template, program-aware and quick).
   - Session Detail: timers, circuits, sets, tags, the Progress chart, pinned notes and one-off links.
   - The conflict resolution sheet.
   - Live Activity and Dynamic Island, and haptics.
3. **Practice parts of I5, in stage 2 (2–3 weeks).** Live Activity, widgets (today's program day,
   active session, reviews due), the "Start quick session" and "Log note" App Intents, Dynamic Type and
   VoiceOver on the native screens.

**I-later (stage 4): built one screen at a time, ranked by `web_fallback_opened`. Original estimates
for reference:**

4. **I3, notes, programs, settings (8–10 weeks).**
   - Notes feed, filters and markdown with media.
   - The Programs calendar (streaks from the server's `chain_role`), Days, plans and statuses.
   - Every Settings section, Devices included.
   - Activities, templates and prescription editors.
5. **I4, analytics, admin, agent, logs (6–8 weeks).** Admin, logs and the SQL console probably stay
   in the web fallback for good.
   - Swift Charts for every visualization, plus dashboards, saved views and goal charts. The SQL
     console sits behind its flag.
   - Admin, for the admin role only.
   - Logs, and the agent chat.
6. **Rest of I5.** Spotlight for goals and localization-ready strings.

### Quality gates (what makes it S+)

- **Sync correctness.**
  - One conformance suite runs in Python, JS and Swift.
  - A seeded two-device chaos simulation runs in JS and Swift, in CI on every change under `sync/`.
  - The feed replayed from zero must equal a full read.
  - The table-classification gate.
  - A periodic integrity check: each device sends a hash per entity type, and a mismatch triggers a
    targeted resync and a Sentry event.
- **Parity.** `apple/PARITY.md` lists every entry in `client/e2e/sweep/manifest.js` and every route in
  `FractalRoutes.jsx`, each marked *native* or *web fallback*. CI fails if a web surface isn't
  classified. A web-fallback row is allowed; a missing row is not.
- **Checkpoint evidence.** Admin → Usage gains a Platforms view: completed sessions by platform,
  web-fallback opens by screen, sync health (lag, conflicts, rejections, integrity mismatches) and
  4-week retention by platform. Each checkpoint above reads from it.
- **Contract.** Web, server and Swift all build against `openapi.json`. A breaking change, measured
  against the oldest supported build, fails CI.
- **Web ↔ desktop parity.**
  - The full Playwright suite runs three ways:
    - web on Chromium
    - web on WebKit
    - **desktop flavour on WebKit**: the same build with `platform/desktop`, whose Tauri IPC is
      replaced by `@tauri-apps/api/mocks` `mockIPC` and backed by an in-memory SQLite store
  - Any spec that passes on one and fails on another is a parity bug that fails CI.
  - `sweep:quick` captures web and desktop flavours side by side, and a pixel diff flags layout drift.
  - A route-manifest check proves both flavours register identical routes, apart from landing and demo,
    which are web only.
  - A smoke test of the real built `.app` covers launch, Keychain sign-in, sync, the menu-bar timer and
    the updater. There is no WebDriver for WKWebView, so this is a scripted AppleScript/XCUITest-host
    run.
- **Two-device sync, end to end.** A Playwright spec runs two browser contexts, one web and one desktop
  flavour, and checks offline edits on both converging.
- **iPhone.** Swift Testing, snapshot tests (iPhone SE and Pro Max, light and dark), and XCUITest
  journeys against `scripts/browser_test_server.py`.
- **CI/CD.** A macOS GitHub runner and Fastlane `match`. main → iPhone TestFlight and a notarized Mac
  release. Sentry tracks crash-free sessions and sync health: lag, conflicts and rejections per op
  type.
- **Docs.**
  - `docs/architecture/ADR_0005_DEVICE_SYNC.md`: protocol, conflict rules, the authority boundary,
    compaction. It supersedes the single-device scope of ADR 0004.
  - `ADR_0006_NATIVE_CLIENTS.md`: the Spotify split, the platform seam and capability fallbacks
    (the web ↔ desktop parity contract), lockstep releases, version skew.
  - Updates to `index.md`.
  - A delivery record at `planning/native-apple-apps-2026-11.md`.

### Later

- Ported goal condition evaluator for live offline progress.
- Before a public App Store launch: privacy labels and manifest, and a demo account for App Review.
- Decide between in-app purchase and an external purchase link if billing ships.
- Mac App Store build.

---

## Critical files touched (backend and web)

- **Auth:** `blueprints/auth_api.py`, `services/auth_service.py`, `config.py` (tokens, CORS for the
  shell, version gates)
- **Client UUIDs:** `validators/{goals,programs,templates,activities,fractal_metrics,dashboards}.py`
  and their services
- **New migration and `models/`:** `user_devices`, `change_seq` and its triggers, `sync_tombstones`,
  `sync_conflicts`, reminder preferences
- **New backend modules:** `services/sync_feed_service.py`, `services/sync_ops_service.py`,
  `blueprints/sync_api.py`, `services/reminder_service.py`, `services/push_service.py`,
  `scripts/generate_openapi.py`
- **Storage OAuth:** `blueprints/storage_api.py`, `services/storage_connection_service.py` (nonce
  OAuth)
- **Web client changes:** `client/src/offline/` → `client/src/sync/`, `platform/capabilities.js`, `utils/api/*` (mirror-backed
  query functions), `utils/api/core.js`, `contexts/AuthContext.jsx`, `hooks/useStorageConnections.js`,
  `hooks/useAccountSettings.js`, `utils/marketingHost.js`, `public/boot/shell.js`, `main.jsx`
- **Web client config:** `client/vite.config.js`, `client/playwright.config.js`,
  `client/scripts/maintainability-audit.mjs`
- **Ops:** `client/nginx.conf`, `services/tracking_plan.json`, privacy.md, `cloudbuild.yaml`
- **New client code:** `client/src/platform/`, `client/src/sync/`, `client/src/components/sync/`,
  `desktop/`, `apple/`, `tests/fixtures/sync/`

## Verification

- **Backend.** `./run-tests.sh backend` with the new tests:
  - spec completeness and response validation
  - the conformance suite
  - feed replay equals a full read, with the classification gate
  - op idempotency under replay
  - token rotation and reuse revocation
  - device revocation wiping sync access
  - nonce OAuth single use
- **Web and Mac (one client).**
  - `./run-tests.sh frontend`: the conformance suite, the two-device chaos test, the store-adapter
    contract (IndexedDB and SQLite), the capability-fallback test, and the move from the old outbox.
  - `./run-tests.sh browser` passes in all three projects: Chromium web, WebKit web and WebKit desktop
    flavour.
  - Rebuild `client/dist` before e2e.
  - Check by hand that the web app works fully offline after the switch to the mirror.
- **Mac.** `cargo tauri build` and a notarization check. Then, on the installed app:
  1. Sign in, quit and relaunch, and confirm you are still signed in.
  2. Check the menu-bar timer, a universal link and the updater.
- **iPhone.** `xcodebuild test` (conformance, fixtures, snapshots, XCUITest). Check that the web
  fallback opens signed in, that an edit made in it shows up natively after the next sync, and that
  the one-time code can't be replayed.
- **Cross-device, by hand on TestFlight and the Mac.** These are the acceptance tests for sync:
  1. Put both offline. Create a goal on the Mac and log a session with sets on the iPhone. Bring both
     online and confirm each shows both changes within a few seconds.
  2. Edit the same goal's description on both while offline, then reconnect. Confirm the newer text
     wins and the other version can be restored.
  3. Start a session on both while offline, then reconnect. Confirm the resolution sheet appears and
     nothing is lost.
  4. Delete a note on one device and edit it on the other while offline. Confirm you are asked to
     restore it.
  5. Revoke the iPhone from the Mac's Settings → Devices. Confirm the iPhone's local copy is wiped on
     its next sync.
