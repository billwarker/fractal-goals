# Fractal Goals - Codebase Index

> Read this file first for a high-level map of the repo.
> Update it when the architecture, major workflows, or core tooling meaningfully change.

## Overview

Fractal Goals is a full-stack goal and practice-tracking application built around a hierarchical "fractal" model of work:

- Goals flow from `Ultimate` down through `Immediate`
- Sessions capture real execution work
- Activities, templates, and programs structure recurring practice
- Analytics, dashboards, annotations, and logs explain what happened over time
- The analytics engine direction is now a user-wide semantic query layer: users can run structured queries against governed datasets, save query profiles, and power dashboard charts from those profiles while the backend enforces tenant isolation.
- Auth, admin tooling, quotas, storage limits, and tier limits provide the current SaaS account boundary
- Admin-managed feature flags hide high-complexity surfaces until explicitly enabled, currently goal surface configuration/widgets and SQL-facing analytics exploration.

The codebase is now organized around two main ideas:

1. The backend owns business rules in service modules, not in route files.
2. The frontend is query-first, with TanStack Query as the main source of truth for remote data.

## Runtime

- Backend: Flask on port `8001`
- Frontend: Vite + React on port `5173`
- Database: PostgreSQL only
- Schema management: Alembic migrations

Development note:

- Local startup now auto-applies pending Alembic migrations by default in development.
- This is meant to protect long-lived local databases from drifting behind the current model/schema.

## Current Architecture

### Backend shape

The backend is split into:

- `blueprints/`: thin HTTP route layers
- `services/`: business logic, orchestration, domain rules, serialization, and shared query helpers
- `models/`: SQLAlchemy models and session/engine management
- `validators/`: request validation schemas and decorators, split by domain with package-level re-exports for existing `from validators import ...` imports
- `migrations/`: Alembic schema history

The intended backend flow is:

`request -> blueprint -> validation -> service -> serializer -> response`

Important backend design choices:

- Services are the canonical boundary for validation, ownership checks, and transaction behavior.
- Payload normalization is centralized.
- Serialization is separated from business logic.
- Main domain events are emitted from services after successful commits.
- Soft-delete behavior is standardized across the main app surfaces.
- Ownership checks are centralized around user-owned roots/fractals and shared query helpers.
- Quota checks are enforced in service write paths for SaaS resource limits.

### Frontend shape

The frontend is split into:

- `client/src/pages/`: route-level screens
- `client/src/components/`: reusable UI and feature components
- `client/src/hooks/`: query hooks, orchestration hooks, and feature helpers
- `client/src/contexts/`: auth, header, selection, theme, and lightweight mutation/selection facades
- `client/src/utils/`: API modules, goal-tree normalization, optimistic helpers, formatting, and low-level utilities

The intended frontend flow is:

`page/component -> query hook or mutation hook -> shared query key -> API module`

Important frontend design choices:

- TanStack Query is the canonical remote-data layer.
- The public landing page lives at `client/src/pages/Landing.jsx`; its editable messaging source is `client/src/content/landing.md`, parsed by `client/src/content/landingContent.js`. The root route serves it only on `fractalgoals.com` / `www.fractalgoals.com` (`client/src/utils/marketingHost.js`); `my.fractalgoals.com` keeps the authenticated app at `/`, `/landing` redirects to `/`, and local dev can preview the same landing page at `/landing-preview` while keeping `/` as the fractal-selection root. On desktop widths (≥981px) the landing page is a segmented one-section-at-a-time horizontal experience: `main.page` is itself the scroll container (filling the shared `.content-container`) with CSS `scroll-snap-type: x mandatory`, wheel and trackpad gestures advance one horizontal section at a time unless a nested panel can scroll vertically, and four full-viewport snap sections sit left-to-right — hero (persistent header above, root-icon example picker between the headline and bordered explainer panel whose hover/focus state temporarily replaces the headline with the root goal name and whose click loads that example before auto-scrolling sideways to the goals view with reduced-motion-aware behavior), goals explorer (`#examples`, a two-column layout: a left sidebar holding the section header plus four interactive highlight cards — lineage scoping, evidence fading, metrics overlay, tree/hierarchy layout — that demo their feature live on the tree and whose copy comes from `###` cards in the `landing.md` Examples section, with the explorer panel filling the rest), features (`#features`), and a private beta CTA (`#beta`) that merges the former audience/"who it is for" cards above the email signup. The persistent header is the section navigation rail: internal header items scroll sideways to their sections and highlight via `aria-current` when `client/src/hooks/useActiveLandingSection.js` reports that section at the page container's horizontal center. Once the active section is past the hero, an example-fractal icon rail (`client/src/components/landing/LandingExampleRail.jsx`) appears as a fixed bottom-centered overlay; rail example clicks flip the active example in place — no scrolling — so the goals view and feature stage can be compared across examples without returning to the hero picker. Below 981px the page keeps a normal continuous vertical scroll. The landing example explorer is a full mirror of the authenticated goals page: it reuses the real `FlowTree` (with its fade/scope-transition animations), the full `FlowTreeOptionsPane` view widget (tree/hierarchy toggle + fade/hide-inactive, hide-completed, metrics overlay), and the shared `.details-window.sidebar.docked` slide-in detail panel. Its FlowTree viewport is interaction-locked by default on landing (scroll zoom and drag pan disabled) so page scrolling cannot accidentally zoom the graph; clicking/focusing the viewport unlocks graph interaction, while changing examples or leaving the goals section locks it again. Clicking an example goal filters the tree to that goal's lineage and re-centers it. The read-only `GoalDetailModal` exposes the full Details / Timeline / Activities / Notes tab set with edit affordances removed and a stop-sign cursor over inert controls. Below the explorer, a Features section (`client/src/components/landing/LandingFeaturesSection.jsx`) mirrors the goals-view layout: a left sidebar holds a fixed section message, a compact 2x2 feature selector (Sessions, Activities, Programs, Analytics), and markdown-editable per-feature detail cards parsed from `####` blocks under each feature in `landing.md`; the right-side viewport renders the active full-page-style example surface: a featured session-detail preview built from the published snapshot, featured activities in a two-column activity-card plus `GoalHierarchyList` goal-inheritance lineage demo, a featured full program-page preview with Calendar/Blocks toggle and hideable details/goals sidebar, and published analytics views selected from single-chart saved views. Featured picks come from the published snapshot's `showcase` object (schema v5) with auto-derived fallbacks for older snapshots (`landingFeatureModel.js`). An inline script in `client/index.html` starts a landing examples fetch at HTML parse on landing entry paths and stashes the promise on `window.__fgLandingExamplesPreload`: if `VITE_LANDING_EXAMPLES_STATIC_URL` is configured it fetches that static snapshot first, otherwise it fetches `/api/public/landing-examples`; `client/src/utils/landingPrefetch.js` consumes the preload once, retries the configured static snapshot if needed, and falls back to the API on any static/preload failure. `main.jsx` still prefetches at JS boot so the query is warm either way. In production the frontend Nginx edge-caches the API endpoint (`client/nginx.conf` `landing_cache` zone), the backend warms it on publish, and publish can also materialize the same snapshot to an atomic filesystem path or GCS object via `LANDING_EXAMPLES_STATIC_PATH` / `LANDING_EXAMPLES_STATIC_GCS_BUCKET` for zero-API landing hydration. The endpoint/static object uses short public cache lifetimes, and both the example explorer and feature stage hold their footprint with shimmer skeletons while published data is pending. A built-in demo snapshot keeps the sample goal view and feature showcase visible on the public landing entry if no examples are published; published snapshots replace the fallback when present. No authenticated API calls are made. For shareability, `client/index.html` carries static (crawler-visible) SEO/social meta — description, canonical `https://fractalgoals.com/`, Open Graph, and `summary_large_image` Twitter tags pointing at `/og-cover.png` — kept in sync with the `landing.md` SEO block; the runtime meta injection in `Landing.jsx` only matters for in-app navigation. The Open Graph image is committed at `client/public/og-cover.png` and regenerated from `client/scripts/og-cover.svg` via `npm run generate:og-image` (uses `@resvg/resvg-js`). `client/public/robots.txt` and `client/public/sitemap.xml` are served as static files through the Nginx `location /` `try_files` fallback.
- Query keys are centralized in `client/src/hooks/queryKeys.js`.
- Shared typography tokens live in `client/src/design-tokens.css`; technical/configuration UI should use `--font-family-config` or the `ConfigText` atom from `client/src/components/atoms/Typography.jsx`, which intentionally follows the mono metadata style used for session section duration averages.
- The authenticated goals page now uses a persisted page surface layout (`PageSurfaceLayout` via `/api/roots/<root_id>/page-surfaces`) for the background grid. `client/src/components/surface/PageSurface.jsx` reuses the shared `GridLayout` engine from analytics and has two explicit modes: overview gives the tree/widgets the full surface, while scoped mode flex-splits the grid region and a surface-local goal detail region. A single saved surface now stores separate `view_configs.overview` and `view_configs.scoped` layouts, so adding/resizing widgets in overview does not mutate scoped, and vice versa; legacy configs migrate their existing widget layout into overview while scoped starts as a clean tree/detail workspace. The scoped detail split persists as whole-surface grid cells (`detail_panel.w` out of `detail_panel.cols`), not as a percentage of the shrinking hierarchy grid, so expanding the detail panel takes space from the hierarchy without rubber-banding; the splitter overlays the grid-snapped left edge of the `.surface-detail-window`, whose perimeter gets the configure-mode blue highlight, and the scoped hierarchy panel can be intentionally left narrower than the left grid region to expose real grid space between the FlowTree window and detail window. Overview configure mode never shows a goal-detail placeholder; users resize the Goal Hierarchy grid window and hover/click exposed background grid cells outside that hierarchy window to add widgets such as Last Session, Calendar, Metric Card, and Analytics Panel. The Calendar widget is a thin compact/read-only adapter around the shared `ProgramCalendarView`, fed by the same `buildProgramsCalendarEvents` and `buildProgramBlockLabels` helpers as the Programs page, opens on the current date/month, and keeps program/block backgrounds, block labels, scheduled program-day events, completed program-day sessions, and goal events in the canonical calendar styling instead of a separate surface-only renderer; compact mode expands the FullCalendar month rows and paints layered full-cell program/block fills from the shared background events. The Analytics Panel chrome hosts the saved-view picker only in configure mode, otherwise baking the selected saved view into the title as `Analytics Panel - <view name>`, and lists saved analytics views (single portable chart profiles) rather than multi-chart dashboards; overview renders them whole-fractal, while scoped mode intersects compatible goal-based charts with the currently visible selected-goal subtree and keeps empty scoped results as stable no-data states. The hovered background cell gets a light configure-mode highlight; while the add-widget menu is open, hovering a widget type previews the minimum grid footprint (`minW`/`minH` from `widgetRegistry`) that widget will occupy, and selecting it spawns the widget at that same minimum size. The transparent hierarchy viewport itself remains exclusively for goal-tree interaction and is not a widget placement target. Configure mode gives every surface panel a blue editable outline and visible resize handles, and the FlowTree options pane is rendered as inline text and marks aligned to the 20px surface grid while showing a live cell tracker, desktop/mobile target, active editing state badge (`Overview` or `Scoped`), and explicit `Save`/`Cancel` edit-session controls; `Save` persists the current desktop/mobile JSON config and exits configure mode, `Cancel` reloads the active/default surface draft without writing, and `Save as...` opens an inline name field inside the options widget rather than a browser prompt. Saved layouts store `layout_bounds` per view config and are fitted to the current desktop/mobile grid before rendering or editing, so cell-relative sizing scales across screen sizes; mobile loads/edits the separate `mobile_config`. The goals route must render selected-goal detail in the surface-owned `.surface-detail-window`, not the legacy global `.details-window.sidebar.docked` floating sidebar classes, so the tree and detail panel share space instead of overlapping.
- Feature flags are stored in `app_settings` under `feature_flags`, read by authenticated users through `GET /api/feature-flags`, and administered in the Admin `feature flags` tab through `GET/PATCH /api/admin/feature-flags`. The `goal_surface_configuration` flag hides the goals surface selector/configure controls and prevents surface-layout queries while keeping the default tree surface active. The `analytics_sql_explorer` flag hides the Analytics Query Console mode plus chart SQL inspector/open-console/copy affordances; saved dashboard charts can still render from the analytics engine.
- Broad invalidation should use centralized query-key prefix helpers, not ad hoc raw arrays.
- Repeated invalidation clusters should use shared helpers in `client/src/utils/queryInvalidation.js` so query churn remains visible and easy to tune.
- Account-owned homepage data must be scoped by the authenticated user id or cleared on auth transitions; auth changes clear the query cache to prevent cross-account data bleed.
- Auth bootstrap attempts a cookie refresh when `/auth/me` is stale. Production frontend builds must call same-origin `/api`, with Cloud Build passing `VITE_API_URL=/api` and Nginx proxying to the backend through runtime `BACKEND_URL`, so remembered-device cookies remain first-party on mobile browsers.
- The selection page consumes `/api/fractals` summaries directly, including effective `display_level` metadata, rather than issuing per-fractal goal-level fetches.
- The authenticated app header also consumes the same user-scoped fractal summaries cache (`queryKeys.fractals(userId)`) for its root-goal switcher, so users can change fractals from the nav while preserving the current high-level section when possible.
- Older hand-managed fetch state has largely been removed.
- Large multi-mode components were decomposed into coordinators plus focused subcomponents/hooks.
- Modal behavior and state reset patterns are more standardized than before.
- Backdrop dismissal for modals and mobile sheets is centralized through `client/src/components/atoms/ModalBackdrop.jsx` and guarded while text inputs, textareas, or contenteditable fields are focused so accidental outside clicks do not discard in-progress typing.
- The app shell exposes `--app-viewport-height`, using dynamic viewport units when available, so mobile browser chrome does not hide headers or bottom content.
- Canonical UI primitives are documented in `client/src/components/README.md`. New compact controls should use the atom/common map rather than local copies: `Button` for text commands, `IconButton` for icon-only controls, `CloseButton` for dismissals, `RemoveButton` for collection-item removal, `DeleteButton` for labeled destructive actions, `Badge` for badges/pills/chips/tags, `Spinner` via `LoadingState` for loading states, form atoms for inputs, and `Tooltip` for hover/focus help. `Modal` now composes `CloseButton`, so modal close affordances share one hover/focus implementation.

## SaaS And Account Layer

The app has a real account boundary rather than a purely local/single-user model.

Current SaaS/account pieces:

- JWT auth with HttpOnly cookie support, including explicit session-cookie vs remembered-device login behavior
- CSRF double-submit protection for cookie-authenticated mutating requests
- role-backed admin accounts
- invite-key gated tester signup
- transactional email is centralized in `services/email_service.py`, using `EMAIL_PROVIDER=test|disabled|resend`; production Resend sends use `RESEND_EMAIL_API_KEY`, `EMAIL_FROM`, and `APP_BASE_URL`, and each attempt is recorded in `email_delivery_events` without storing bodies, raw reset tokens, raw invite keys, or API keys. Email-touching surfaces have explicit rate limits plus workflow cooldowns: password reset request/reset routes are limited to 5/minute and count invalid payloads, reset emails are suppressed per account for `PASSWORD_RESET_EMAIL_COOLDOWN_MINUTES`, admin beta invite sends are admin-only plus 10/minute and per-signup `BETA_INVITE_EMAIL_COOLDOWN_MINUTES`, public beta signups are 12/hour, and Resend webhooks are signature-verified plus 120/minute. Resend delivery callbacks are accepted at `POST /api/public/webhooks/resend`, verified with `RESEND_WEBHOOK_SIGNING_SECRET`, idempotently stored in `email_webhook_events`, and used to update delivery status (`delivered`, `bounced`, `complained`, opened/clicked telemetry) on the matching email delivery event.
- public private-beta request collection through `/api/public/beta-signups`, stored separately from invite keys in `beta_signup_requests`; the public landing form collects email plus an optional free-text "what goal are you trying to achieve" answer (persisted as `use_case`), while the API still accepts optional name/note fields for compatibility; `name`/`use_case` are nullable and no longer backfilled with placeholder strings, and resubmitting an email-only signup preserves any previously supplied values. Admins triage captured signups in the Admin `beta signups` tab: `GET /api/admin/beta-signups` (status filter, email/goal search, status_counts), `PATCH /api/admin/beta-signups/<id>` (new/invited/dismissed), `POST /api/admin/beta-signups/<id>/send-invite` (creates a fresh one-time invite key, emails it through the email service with both a `?invite_key=&email=` signup link and a visible fallback key, binds that invite key to the beta signup email at account creation, and marks the request invited only after send success), and `GET /api/admin/beta-signups/export.csv`, plus copy email actions in the UI
- self-service password reset is available through `POST /api/auth/password/forgot` and `POST /api/auth/password/reset`; reset tokens are single-use, expire by `PASSWORD_RESET_TOKEN_TTL_MINUTES`, and are stored only as hashes in `password_reset_tokens`
- admin-controlled public landing examples: admins select admin-owned root fractals in the Admin `landing` tab, which includes a direct `View landing page` link for checking the public result, save draft labels/order plus per-example `showcase` picks (featured session, up to 4 featured activities, featured program with a clipped date window, and up to 3 saved analytics views; picker lists come from `GET /api/admin/landing-examples/options`) in `app_settings.landing_example_settings`, and manually publish a sanitized cached snapshot to `app_settings.landing_example_cache`; `/api/public/landing-examples` serves only that cache without auth, with short public Cache-Control since it changes only on publish; the frontend Nginx proxy-caches the endpoint per instance, and publish ends with best-effort delivery side effects: `LANDING_CACHE_WARM_URL` warms the frontend edge cache (bypass header `X-Landing-Cache-Warm`) and `LANDING_EXAMPLES_STATIC_PATH` or `LANDING_EXAMPLES_STATIC_GCS_BUCKET` can write the same snapshot as a static JSON artifact. Publish reports both `cache_warm` and `static_snapshot` as `ok`/`skipped`/`failed`, and failures never block the database snapshot. The published snapshot is a versioned (`schema_version: 8`), self-contained read model: each goal node embeds its targets, authenticated-parity activity association payloads (direct, inherited-from-children, inherited-from-parent, and linked group metadata), a bounded production-parity timeline page, and bounded notes, and each example also carries the resolved `showcase` object (stale ids are dropped at publish with warnings), root-scoped `evidence_goal_ids`, a whole-fractal `metrics_summary`, serialized `programs`, bounded `sessions` (always including the featured session), session-facing `activity_definitions`/`activity_groups` (always including featured activities and activities referenced by published analytics view filters), serialized `analytics_views`, analytics-ready `analytics_activity_instances` with metric values and progress comparisons required by those views, and `session_templates` — so the read-only landing explorer and feature showcase render from the cache/static artifact alone
- user profile, password, email, username, and preferences endpoints
- membership tiers and quota limits for free/paid/legacy users
- per-user app-data storage limits and usage reporting
- quota usage reporting in account settings
- admin user management, invite-key generation, support access into user fractals, and grouped admin user actions for tier/quota updates, temporary passwords, suspend/reactivate, unlock, role changes, soft delete, and hard delete
- admin quota editing consumes backend-owned tier default metadata so reset-to-default behavior stays aligned with quota enforcement
- admin tier quota management persists default free/paid resource quotas and storage limits in `app_settings`; changes can apply to existing tier users or preserve existing users for new-user-only rollout
- admin feature flag management persists rollout switches in `app_settings`; new flags should be added through `services/feature_flag_service.py` definitions and exposed in the Admin `feature flags` tab
- user-scoped selection-page cache and recent-fractal localStorage keys
- production security checks for JWT secrets, CORS, and cookie settings
- production security checks for debug mode, shared rate-limit storage, and secure auth cookies
- rate limiting on sensitive auth and selected write endpoints
- frontend production serving uses security headers and immutable caching for built assets

Key backend pieces:

- `services/auth_service.py`
- `services/admin_service.py`
- `services/public_service.py`
- `services/user_service.py`
- `services/quota_service.py`
- `blueprints/auth_api.py`
- `blueprints/admin_api.py`
- `blueprints/public_api.py`
- `models/user.py`

Key frontend pieces:

- `client/src/contexts/AuthContext.jsx`
- `client/src/pages/Admin.jsx`
- `client/src/components/admin/BetaSignupsPanel.jsx`
- `client/src/components/admin/TierQuotasPanel.jsx`
- `client/src/components/modals/AuthModal.jsx`
- `client/src/components/modals/SettingsModal.jsx`

Performance and production-hardening notes:

- Backend responses include `X-Response-Time-Ms`; slow requests are logged using `SLOW_REQUEST_THRESHOLD_MS`.
- API request bodies are capped by `MAX_CONTENT_LENGTH`.
- SQLAlchemy pool sizing is environment-driven via `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT`, and `DB_POOL_RECYCLE_SECONDS`.
- Goal tree/detail, activity-definition, activity-group, program, fractal-summary, session `goals-view`, goal-activity association, and goal-timeline endpoints intentionally batch the relationships or aggregates consumed by their serializers to avoid N+1 round trips against remote Postgres.
- Session detail add/remove activity and timer start/reset mutations keep response serialization on the already-loaded instance path and have query/latency budget coverage.
- Fractal-route header root-goal lookups request `include_children=false`; full goal-tree consumers should use the dedicated tree query instead of duplicating root detail fetches.
- Goal detail timeline data remains lazy-loaded by the frontend; the backend timeline endpoint uses the shared eager goal-tree loader once the user opens the Timeline tab.
- Goal detail time/session metrics and the daily duration graph intentionally use the same evidence semantics as the goal timeline: completed activity instances from direct activity associations, activity-group associations, descendant goals, and enabled parent-activity inheritance are deduplicated before totals or graph buckets are computed. This keeps the Timeline tab summary and Time Spent graph aligned with visible timeline evidence instead of only counting manually linked `session_goals` rows.
- Clicking Time Spent from the goal detail Timeline tab opens a page-level, registry-backed graph profile modal (`client/src/components/analytics/graphs`), currently using the `goalDuration` profile fed by the evidence-consistent daily-duration endpoint. The modal is portaled outside the goal detail shell and preloaded when the Timeline tab is active so the click gives immediate feedback; the former one-off `GenericGraphModal`/`useGoalDurationModal` path was removed so new standalone graphs are added through the graph profile registry instead of ad hoc modal components.
- Goal detail manual completion/uncompletion confirmation is part of the normal detail shell: the persistent goal header remains visible, confirm/cancel actions render through `GoalDetailModalFooter`, and the confirmation body/actions stay on the goal level color until the completion mutation actually changes the modal into the Completed color state. Completed goal detail and uncompletion views use the Completed color for date, target, note, and action accents, while program rows preserve their user-chosen program colors. The frontend derives the displayed program impact via `client/src/utils/goalCompletionPrograms.js`: completing lists only currently active scoped programs, while uncompleting lists scoped programs whose date window contained the previous completion timestamp. The completion confirmation view can also create a special goal-scoped note with `note_kind: "goal_completion"`; the Details tab shows that completion note above the description, and the uncompletion confirmation shows it after date/program/target impact and removes existing goal completion notes before clearing the completion.
- Goal detail header metadata owns timing information: Created always comes first when present, incomplete goals show Due next, completed goals replace Due with the completed datetime, and Age appears after Due/Completed using the same shared `getAgeLabel` formula as FlowTree nodes. The footer completion control remains action-only (`Mark Complete` / `Mark Incomplete`) rather than carrying the completed timestamp.
- Note markdown video embeds use provider-specific loading: YouTube/Instagram stay as click-to-load facades, direct video files use native `<video>`, and Google Drive files mount the sandboxed `/preview` iframe immediately so Drive can show its own first-frame preview before playback.
- Browser CSRF handling shares a single in-flight `/auth/csrf` fetch across concurrent writes, reads the token from the response body/header for cross-origin production API calls, retries once on stale-token CSRF 403s, and emits a session-expired auth event when token recovery fails so the app can notify the user and return them to login.
- Frontend API contract tests cover mutating helpers across goals, programs, sessions, notes, and analytics to catch CSRF regressions and endpoint path drift.
- Backend performance tests include query-count, response-size, and latency budget checks for core endpoints.
- Large-account budget tests cover goal-tree, sessions search, notes pagination, and admin user-list paths.
- Frontend performance coverage includes a large session-goals view-model budget test.

Analytics engine build-out:

- The target architecture is captured in `docs/analytics-engine-plan.md`.
- Current service ownership is captured in `docs/architecture/ADR_0003_ANALYTICS_SERVICE_TOPOLOGY.md`.
- The engine is intended to be user-wide rather than root-only: every query runs within the authenticated user's owned roots, with optional root/fractal filters.
- V1 uses a structured query spec compiled by a backend semantic catalog, not raw SQL. Catalog datasets expose user-facing analytics objects and inject tenant policies server-side.
- The analytics query console is SQL-editor first: users browse actual queryable database table objects/columns in the analytics page, write read-only PostgreSQL `SELECT`/`WITH` queries with table/column/function autocomplete, and the backend executes those queries against tenant-filtered catalog CTEs. This supports normal SQL shapes such as `SELECT *`, joins, aliases, expressions, grouping, nested selects, and aggregates while keeping user SQL away from raw app tables. The backend catalog includes direct user/root-scoped tables, selected stats tables, analytics profile/dashboard tables, and tenant-safe junction tables with join-through policies; auth/system tables remain outside the user catalog. Mutating statements, multiple statements, comments, and schema-qualified bypasses such as `public.sessions` are rejected.
- Saved query profiles are separate from dashboard layout state so the same query can power the console, dashboard windows, and future chart profiles.
- Saved analytics objects now carry `kind: "view" | "dashboard"` while keeping the legacy `/api/roots/<root_id>/dashboards` route for compatibility. A single configured chart saves as a portable `analytics_view` profile payload; multiple configured charts save as an analytics dashboard layout. Existing rows are backfilled by configured chart count.
- Each configured chart has a query inspector affordance backed by an explicit per-visualization query explanation builder; registered chart profiles cannot silently fall back to generic raw-table SQL. Chart explanations now use catalog-backed/direct-lineage SQL, including goal activity/session lineage and governed `sessions.attributes` JSON for session sections, so they can remain runnable in the SQL console instead of relying on read-model-only explanations.
- The SQL query console infers compatible visualization recommendations from result column names/types, lets users adjust simple x/y/group mappings, and can save a recommended SQL visualization as an analytics view referencing the saved query profile.
- Core handcrafted analytics charts should continue being rewritten onto the engine as equivalent query-backed profiles, then retired to avoid competing implementations.

Remaining SaaS build-out to know:

- Stripe/customer-portal/webhook integration is not yet wired as a full billing system.
- Email verification, billing notices, quota warnings, and marketing/bulk mail are not yet present; password reset and beta invite email are the current transactional email workflows, with Resend delivery webhook ingestion wired for those sends.
- Admin force-password-change is currently an account marker, not an enforced login-time password-change gate.
- Admin support access is explicit and scoped by `admin_user_id` plus `admin_mode=read_only|read_write`; it is not full impersonation.

## Core Domain Areas

### Goals

Goals are the core domain object. The app supports a 5-level hierarchy:

- `UltimateGoal`
- `LongTermGoal`
- `MidTermGoal`
- `ShortTermGoal`
- `ImmediateGoal`

Goal active/inactive status and activity evidence:

- A goal renders as "active" when a completed activity instance linked to it (or a descendant) has an effective completion timestamp inside the root's `progress_settings.active_goal_window_days` window (default 7, max 90). This is computed on demand, never stored.
- `services/goal_contribution.py` is the single chokepoint that decides whether an activity at a given timestamp counts toward a goal. `resolve_contribution_goal(goal, timestamp)` excludes goals that are currently paused, goals completed *before* the activity (so completing a goal stops accruing new evidence; pre-completion evidence still fades naturally as it ages out of the window), and activity performed during any past pause window.
- Pause state is durable: the `paused`/`paused_at` columns on `goals` capture the current flag, and the `goal_pause_intervals` table (model `GoalPauseInterval`) records each pause window (`paused_at`/`resumed_at`, open interval = still paused). `GoalWorkflowService.toggle_pause` opens an interval on pause and closes it on resume. The evidence rule reads these intervals so activity done while paused never counts, even after resume.
- All evidence/metrics paths share this rule: `SessionAnalyticsService.get_recent_evidence_goal_ids` (drives the tree flip), `get_flowtree_session_metrics` (metrics overlay), and `GoalTreeService` session goal-scope resolution. `goals_by_id` consumers eager-load `Goal.pause_intervals` via `goal_serializer_load_options` to avoid N+1.
- The pause concept is named `paused` end-to-end (DB → serializer → API `/pause` → frontend `goal.paused`); the legacy `frozen`/`/freeze` vocabulary has been removed.

Targets and the target analytics experience:

- Targets (`Target` + `TargetMetricCondition`) are measurable thresholds on a goal (e.g. *Playback Speed ≥ 100%*). They have full per-target CRUD: `POST /api/goals/<goal_id>/targets`, `PATCH /api/goals/<goal_id>/targets/<target_id>` (single-target in-place update), and `DELETE .../targets/<target_id>`. The PATCH path and the goal-level bulk `sync_goal_targets` share the metric-condition reconcile helper `_reconcile_target_conditions` in `services/goal_target_service.py`. `update_goal_target` emits `Events.TARGET_UPDATED`.
- Target cards (`client/src/components/TargetCard.jsx`, managed by `client/src/components/goalDetail/TargetManager.jsx`) expose always-available Edit/Delete affordances (gated only by read-only context, not goal edit mode). View-mode target add/edit/delete persists immediately through `useTargetMutations` (`client/src/hooks/useTargetQueries.js`) rather than a full goal save; the local bulk `setTargets` path is reserved for active goal-edit/create flows where target changes should stay batched with the unsaved goal form.
- `TargetAnalyticsModal` (`client/src/components/goalDetail/TargetAnalyticsModal.jsx`) is the single surface for both viewing and building targets, layered above `GoalDetailModal` (z-index 3500). It has a `mode` of `view` | `add` | `edit`. Left side is always the live graph (Trend `Line` / Scatter, up to two selectable metrics, threshold reference lines via `chartjs-plugin-annotation` registered in `ChartJSWrapper.jsx`, a single completed-goal-colored target point on the scatter, best-instance markers, and a brand-primary highlight ring on the timeline-selected point). The right side switches by mode: in `view` it shows the minimal target meta line + the contributing-instances timeline (`ActivityTimelineCard`) with a Since-creation / All-history toggle; in `add`/`edit` it hosts the `TargetManager` builder form, which emits its live draft via `onDraftChange` so the graph previews the in-progress activity + thresholds before save.
  - The target meta line reports target-level completion only: it shows `Completed on` from `summary.completed_at` when all target conditions are satisfied, does not treat a single condition's `first_met_at` as target completion, and only marks an incomplete target as `Stalled` when its last contributing instance is more than 14 days old.
  - View data: `GET /api/<root_id>/targets/<target_id>/analytics?since=creation|all` (`GoalTargetService.get_target_analytics`) returns the serialized target, activity definition, contributing completed instances (goal-subtree scoped, date-window filtered in SQL before the final `resolve_contribution_goal` evidence check; `since=all` drops the creation-date lower bound), and a per-condition progress `summary` (best value, met count, first-met, days-since-created).
  - Builder live preview: `GET /api/<root_id>/goals/<goal_id>/activities/<activity_id>/instances` (`GoalTargetService.get_goal_activity_instances`) returns the activity's full contributing history + definition for a goal/activity pair with no saved target. Both paths share `_collect_goal_activity_instances`.
- Add/edit entry points (card Edit, and the Activities-tab `+ Add Target` → activity picker) open this modal via `GoalDetailModal`'s `builderConfig` state. Successful direct target creates fire a toast and return the parent `GoalDetailModal` to the Details tab so the new target card is immediately visible. The former standalone `TargetBuilderModal` was retired.

Key supporting backend pieces:

- `services/goal_service.py`
- `services/goal_tree_service.py`
- `services/goal_level_service.py`
- `services/goal_domain_rules.py`
- `services/goal_contribution.py`
- `services/goal_target_rules.py`
- `services/goal_target_service.py`
- `services/goal_timeline_service.py`
- `services/goal_workflow_service.py`
- `services/goal_analytics_service.py`
- `blueprints/goals_api.py`
- `blueprints/goal_levels_api.py`

Key supporting frontend pieces:

- `client/src/utils/goalNodeModel.js`
- `client/src/hooks/useGoalQueries.js`
- `client/src/hooks/useTargetQueries.js`
- `client/src/hooks/useGoalDetailController.js`
- `client/src/components/GoalDetailModal.jsx`
- `client/src/components/goalDetail/GoalDetailModalRenderSurface.jsx`
- `client/src/components/goalDetail/GoalDetailModalFooter.jsx`
- `client/src/components/goalDetail/TargetManager.jsx`
- `client/src/components/goalDetail/TargetAnalyticsModal.jsx`
- `client/src/components/goals/GoalHierarchyList.jsx`
- `client/src/components/flowTree/FlowTreeNode.jsx`
- `client/src/components/flowTree/FlowTreeOptionsPane.jsx`
- `client/src/components/flowTree/flowTreeGraphUtils.js`
- `client/src/pages/FractalGoals.jsx`

Goals page view modes:

- The goals page uses the FlowTree/ReactFlow renderer for both tree and experimental hierarchy layouts.
- Desktop defaults to tree layout; mobile defaults to hierarchy layout.
- `flowTreeGraphUtils.buildGraphPresentation` owns both Dagre tree layout and deterministic hierarchy layout from the same node/edge presentation data.
- `FlowTreeNode` owns custom ReactFlow node rendering, while `FlowTreeOptionsPane` owns the tree/hierarchy widget and shared view options.
- Goal detail/create interactions on the mobile goals page open `GoalDetailModal` as a full-screen modal instead of a docked side panel.
- Sessions page cards render from the sessions search payload without waiting for goal/activity filter reference data; the filter sidebar hydrates those reference lists separately.

### Sessions

Sessions capture actual work performed against a root/fractal.

Sessions support:

- session notes
- manual session-goal links
- activity-derived goal scope for session detail hierarchy views
- activity instances
- timers and manual duration updates

Session activity placement contract:

- the add-activity API accepts `section_index` and persists the new instance id into `attributes.session_data.sections[section_index].activity_ids`
- if a session has no section structure yet, adding to section `0` creates a default `Main` section
- removing an activity marks the instance deleted and removes that instance id from persisted section activity lists
- session detail and session cards both depend on this persisted section ordering, while `activity_instances` remains the canonical instance payload source

Key backend pieces:

- `services/session_service.py`
- `services/session_activity_service.py`
- `services/session_analytics_service.py`
- `services/session_filters.py`
- `services/session_lifecycle_service.py`
- `services/session_runtime.py`
- `services/session_structure.py`
- `services/session_template_stats_service.py`
- `services/timer_service.py`
- `blueprints/sessions_api.py`
- `blueprints/timers_api.py`

Key frontend pieces:

- `client/src/hooks/useSessionQueries.js`
- `client/src/hooks/useSessionDetailData.js`
- `client/src/hooks/useSessionDetailMutations.js`
- `client/src/hooks/useSessionDetailController.js`
- `client/src/contexts/ActiveSessionContext.jsx`
- `client/src/pages/Sessions.jsx`
- `client/src/pages/CreateSession.jsx`
- `client/src/pages/SessionDetail.jsx`
- `client/src/hooks/useSessionGoalsViewModel.js`
- `client/src/hooks/useSessionSidePaneViewModel.js`
- `client/src/components/sessionDetail/SessionGoalHierarchyPanel.jsx`
- `client/src/components/sessionDetail/TimelinePanel.jsx`
- `client/src/components/common/TimelineShell.jsx`

Session detail goal hierarchy contract:

- Session list/detail payloads expose `session_goals` as the canonical flat list of goals attached to a session across all levels.
- Session list/detail payloads expose `completed_goals` as the canonical list of goals completed by, target-completed by, or backward-compatibly completed during that session.
- `short_term_goals` and `immediate_goals` are retired and should not be reintroduced as competing session payload buckets.
- In the dedicated goals-view payload, `session_goal_ids` represent direct manual session links.
- Activity and activity-group associations define activity-derived scope.
- `GoalTreeService.get_session_goals_view_payload` returns the canonical session detail goal payload, including `activity_goal_ids_by_activity`, `session_activity_ids`, and a pruned goal tree containing the complete lineage for in-scope goals.
- The frontend should render from that canonical payload rather than rebuilding association scope from activity definition caches.

### Notes

Notes are now a first-class cross-cutting domain area rather than just a session subfeature.

They support:

- root/fractal notes
- goal notes, including descendant goal views
- session and activity-instance notes
- image notes
- pinning and timeline-style browsing

Key backend pieces:

- `services/note_service.py`
- `services/serializers.py`
- `services/view_serializers.py`
- `blueprints/notes_api.py`
- `validators/` package

Key frontend pieces:

- `client/src/pages/Notes.jsx`
- `client/src/hooks/useNotesPageQuery.js`
- `client/src/components/notes/`
- `client/src/components/goalDetail/GoalNotesView.jsx`
- `client/src/components/sessionDetail/TimelinePanel.jsx`
- `client/src/components/common/TimelineShell.jsx`

### Activities

Activities are reusable definitions used inside sessions and templates.

They support:

- groups
- metrics
- splits
- goal associations
- progress tracking and comparison settings

Activity metrics now use fractal-level metric definitions as the user-facing configuration source:

- session metric inputs honor metric input type, default value, predefined allowed values, and min/max bounds
- predefined values render as constrained session input options with helper text, not optional quick-pick buttons
- metric definition validation prevents conflicting default/min/max/predefined value settings
- duration metrics are entered as `MM:SS` but stored numerically as seconds for progress calculations
- product/yield behavior is driven by metric-level `is_multiplicative` flags, not the legacy activity-level `metrics_multiplicative` switch; yield is only valid when every tracked metric for the activity is multiplicative

Key backend pieces:

- `services/activity_service.py`
- `services/activity_association_service.py`
- `services/activity_group_service.py`
- `services/activity_metric_service.py`
- `services/metrics.py`
- `blueprints/activities_api.py`

Key frontend pieces:

- `client/src/hooks/useActivityQueries.js`
- `client/src/hooks/useActivityHistory.js`
- `client/src/components/ActivityBuilder.jsx`
- `client/src/components/common/ActivitySearchWidget.jsx`
- `client/src/pages/ManageActivities.jsx`

### Progress Tracking

Progress comparisons are a first-class activity/session feature.

They support:

- persisted `ProgressRecord` history for completed instances
- live comparison hints while a session is still in progress
- activity-level and metric-level aggregation configuration
- root-level progress settings and full-root recomputation
- historical progress APIs for session and activity views

Key backend pieces:

- `services/progress_service.py`
- `services/completion_handlers.py`
- `blueprints/activities_api.py`
- `blueprints/sessions_api.py`
- `blueprints/timers_api.py`

Key frontend pieces:

- `client/src/hooks/useProgressComparison.js`
- `client/src/hooks/useProgressHistory.js`
- `client/src/hooks/useSessionProgressSummary.js`
- `client/src/hooks/useRootProgressSettings.js`
- `client/src/components/sessionDetail/SessionActivityItem.jsx`
- `client/src/components/sessionDetail/SessionActivityItemView.jsx`
- `client/src/components/sessionDetail/TimelinePanel.jsx`
- `client/src/components/modals/SettingsModal.jsx`

### Programs and Templates

Programs model longer planning structures:

- programs
- blocks
- days
- attached goals
- attached session templates

Important program-domain rules now enforced in the backend service layer:

- program scope is defined by the program's selected long-term / mid-term goals
- block goal attachments must stay within that scope and within the block date range
- scheduling and unscheduling program-day occurrences run through `ProgramService`
- calendar-day goal deadline changes on the programs page go through the programs API instead of generic client-side goal mutation assembly
- program-day completion is driven by per-template required flags plus an optional day-level minimum completed-template threshold; legacy template links default to required
- program days no longer support a note-required completion condition; notes remain available as ordinary session/program context

Templates model reusable session structures.

Session templates now have two lifecycle states:

- active templates appear in the manual create-session template picker
- archived templates remain reusable but are hidden behind a collapsed Archived section in the manual create-session flow
- archived templates referenced by a day in a currently active program are treated as effectively active for that program-driven flow and are marked with active-program metadata in template responses
- normal template sections may store `default_activity_group_id`; when a live session is created from the template, adding an activity inside that section opens the activity picker directly inside the configured group

Key backend pieces:

- `services/programs.py`
- `services/_program_crud.py`
- `services/_program_days.py`
- `services/_program_goals.py`
- `services/template_service.py`
- `blueprints/programs_api.py`
- `blueprints/templates_api.py`

Program-day scheduling now goes through the programs service/API as a validated backend write path, rather than constructing program session linkage in the client.

Key frontend pieces:

- `client/src/pages/ProgramCalendarPage.jsx`
- `client/src/hooks/useProgramsCalendarData.js`
- `client/src/hooks/useProgramData.js`
- `client/src/hooks/useProgramDetailController.js`
- `client/src/hooks/useProgramDetailMutations.js`
- `client/src/hooks/useProgramDetailViewModel.js`
- `client/src/pages/CreateSessionTemplate.jsx`
- `client/src/components/programs/ProgramSidePane.jsx`
- `client/src/components/modals/ProgramBuilder.jsx`
- `client/src/components/modals/ProgramBlockModal.jsx`
- `client/src/components/modals/ProgramDayModal.jsx`
- `client/src/components/programs/ProgramCalendarView.jsx`
- `client/src/components/programs/ProgramBlockView.jsx`
- `client/src/components/programs/ProgramSidebar.jsx`

### Auth and User Settings

Authentication, token refresh, and account/profile mutations now sit behind dedicated services rather than living directly in the blueprint layer.

Key backend pieces:

- `services/auth_service.py`
- `services/user_service.py`
- `blueprints/auth_api.py`

Key frontend pieces:

- `client/src/contexts/AuthContext.jsx`
- `client/src/components/modals/SettingsModal.jsx`

### Analytics, Dashboards, Annotations, and Logs

The app includes historical and analytical tooling on top of the core execution data.

This includes:

- analytics views, dashboards, visualization state, and goal metrics
- frontend chart and heatmap annotations
- event logging and audit history

Key backend pieces:

- `services/analytics_cache.py`
- `services/dashboard_service.py`
- `services/event_logger.py`
- `services/events.py`
- `services/goal_analytics_service.py`
- `services/log_service.py`
- `blueprints/dashboards_api.py`
- `blueprints/logs_api.py`

Key frontend pieces:

- `client/src/pages/Analytics.jsx`
- `client/src/components/analytics/`
- `client/src/components/analytics/visualizations/registry.js`
- `client/src/hooks/useAnalyticsPageData.js`
- `client/src/hooks/useDashboardQueries.js`
- `client/src/components/modals/LogsModal.jsx`
- `client/src/pages/Logs.jsx`

Session analytics note:

- Session trend analytics are consolidated under `sessions:sessionTrends`, a bar chart with configurable day/week/month/year grain and optional session count and summed duration metrics. Retired duration trend, weekly chart, consistency, activity heatmap, completion rate, and planned-vs-actual panel ids are migrated to this visualization.
- Session start/end time distribution supports optional start and end markers, and the session duration histogram supports configurable bucket counts.

Activity analytics note:

- Activity trend analytics are consolidated under `activities:activityTrends`, a mixed chart where completed activity instances render as bars and activity duration renders as a line on a separate y-axis.
- Activity totals live under `activities:activityFrequency` and can switch between completed instance counts and duration. Retired line graph, time-per-activity, personal-best, and metric-volume panel ids are migrated to the consolidated activity visualizations.
- Individual activity metric analytics include `activities:metricTrends`, which plots up to two selected activity metrics as lines over time, and `activities:metricProgress`, which renders persisted progress-comparison percent improvement bars for progress-tracked metrics.
- When global filters resolve to exactly one activity or goal, single-selection analytics panels use that scoped item as their effective selected activity/goal. Multi-item global scopes continue to filter aggregate panels without pretending there is a single selected item.
- Analytics panels now use the app-wide graph-paper visual model: a bounded 20px cell grid using `--color-grid`, with panel geometry stored in whole cells. Only the selected panel can be dragged or resized; selected panels drag from any non-interactive panel space and resize from any edge or corner. Blank graph-paper clicks, including gaps between absolute-positioned panels, clear panel selection. Panel moves preserve dropped positions instead of auto-compacting upward, reject drag/resize proposals that would overlap another panel with a red conflict highlight, rescale proportionally when the filters pane changes workspace bounds, and persist saved-view workspace bounds so restored views scale into the current open/closed filters workspace. Restored views render only after the fitted layout has settled, avoiding visible load-time resize artifacts. A legacy restore fallback expands views that were saved at roughly one filters-pane width narrower than the current closed-pane workspace. The standard Cmd/Ctrl+Shift+D red debug outline remains available around the analytics workspace. The first empty-view panel defaults to the full measured workspace, and layout migration preserves older split-pane saved views.
- The saved analytics modal separates analytics views from analytics dashboards, supports search by name or displayed update date, and highlights rows/buttons on hover or keyboard focus.

## Data And State Flow

### Backend

Most write paths now follow this pattern:

1. Validate the incoming request with Pydantic-backed schemas.
2. Normalize payload shape with shared helpers where needed.
3. Perform ownership checks and business rules in a service.
4. Commit inside the service boundary.
5. Emit events only after persistence succeeds.
6. Return serialized response data.

Programs now follow this more strictly for:

- block-day scheduling
- recurring occurrence unscheduling
- program-calendar goal deadline updates
- block goal attachment validation

Shared backend infrastructure to know:

- `services/payload_normalizers.py`
- `services/view_serializers.py`
- `services/serializers.py`
- `services/owned_entity_queries.py`
- `services/service_types.py`
- `services/db_migration_service.py`
- `services/analytics_cache.py`

### Frontend

Most read paths now follow this pattern:

1. Query hook reads from the backend using a canonical query key.
2. UI consumes query data directly instead of mirroring it into local state.
3. Mutation hooks invalidate or update the relevant query family.
4. Optimistic flows are only used where rollback behavior is explicit.

Shared frontend infrastructure to know:

- `client/src/hooks/queryKeys.js`
- `client/src/utils/optimisticQuery.js`
- `client/src/utils/api/core.js`
- `client/src/utils/goalNodeModel.js`
- `client/src/utils/programViewModel.js`
- `client/src/utils/sessionRuntime.js`

## Repository Map

### Top-level backend entry points

- `app.py`: Flask app creation, blueprint registration, service initialization, development startup migration hook
- `config.py`: environment loading and runtime configuration
- `db_migrate.py`: Alembic helper wrapper
- `models/`: ORM models and DB session setup

### Important directories

- `blueprints/`: HTTP APIs
- `services/`: application and domain logic
- `migrations/`: Alembic revisions
- `client/src/`: React app source
- `tests/`: backend tests
- `client/src/**/__tests__/` and `client/src/hooks/__tests__/`: frontend tests
- `docs/architecture/`: ADRs
- `docs/planning/`: historical roadmap and planning docs
- `planning/`: active implementation plans and readiness audits, including `planning/beta-readiness-2026-07.md` and `planning/beta-readiness-findings-2026-07.md`

## Testing And Quality

The repo now has a real quality toolchain instead of ad hoc checks.

### Main test runner

Use:

```bash
./run-tests.sh
```

Useful modes:

- `./run-tests.sh frontend`
- `./run-tests.sh backend`
- `./run-tests.sh unit`
- `./run-tests.sh integration`
- `./run-tests.sh coverage`
- `./run-tests.sh verify`
- `./run-tests.sh doctor`
- `./run-tests.sh file <path>`

### Frontend

- test runner: Vitest
- lint: ESLint
- maintainability audit: `client/scripts/maintainability-audit.mjs`
  - enforces source-size caps, import-order rules, removed legacy CSS imports, and inline-style budgets
  - new static styling should use CSS modules/design tokens; inline styles should be limited to runtime CSS variables or measured layout values
- responsive audit: `client/scripts/responsive-audit.mjs`

### Backend

- test runner: Pytest
- env bootstrap: `tests/test_env.py` and `tests/conftest.py`
- migrations: Alembic
- local test DB orchestration: Docker Compose plus `run-tests.sh` helpers

### CI and hooks

- split CI for frontend, backend unit, backend integration, and coverage
- repo-tracked git hooks for pre-commit and pre-push verification
- Cloud Build deploys backend/frontend Cloud Run services and runs migration jobs with Secret Manager-backed database/JWT settings.
- Current production deploy is a budget private-beta profile: `RATELIMIT_STORAGE_URI=memory://`, `ALLOW_IN_MEMORY_RATELIMIT=true`, `WEB_CONCURRENCY=1`, and Cloud Run `--max-instances=1`.
- Full production should switch `RATELIMIT_STORAGE_URI` to shared Redis-compatible storage and remove the single-instance private-beta constraint.

## Architectural Improvements Already Landed

This repo recently went through a large quality pass. The most important outcomes were:

- The frontend data layer is now query-first.
- Auth, quotas, user settings, and tier-aware usage reporting are now part of the core product layer.
- Analytics dashboards, visualization registry/state, and cache helpers have become first-class infrastructure.
- Service coverage is broad across goals, sessions, activities, notes, templates, programs, and goal levels.
- Major route files were reduced and simplified.
- Serialization, payload normalization, and domain rules were separated into dedicated modules.
- Soft-delete, transaction ownership, and post-commit event behavior were standardized.
- Regression coverage was added across backend and frontend hotspots.
- Tooling was upgraded with a better test runner, audits, CI splits, hooks, ADRs, and roadmap tracking.

The detailed execution history for that work lives in:

- `docs/planning/A_PLUS_S_RANK_ROADMAP.md`

## Where To Start

If you are new to the codebase:

1. Read this file.
2. Read `app.py`, `config.py`, and `client/src/main.jsx`.
3. Read the service for the domain you are changing.
4. Read the matching blueprint and query hooks.
5. Check `client/src/hooks/queryKeys.js` before adding new frontend data flows.
6. Check existing tests before inventing new patterns.

## Practical Rules

- Do not add new manual fetch/state machines if a query hook should own the data.
- Do not add new route-level business rules if a service should own them.
- Prefer extending existing query-key families over inventing one-off cache keys.
- Prefer explicit rollback-safe optimistic behavior, or use invalidate-and-refetch.
- Keep route files thin, service logic testable, and serializer behavior centralized.

## Current Quality Posture

At a high level, the repo is in strong shape structurally:

- Architecture: much cleaner than before
- Testing: broad and meaningful
- Tooling: solid
- Maintainability: improved substantially, with a known decomposition backlog for the largest services, hooks, and React components

The main remaining work is no longer just incremental cleanup. The highest-leverage next phase is SaaS hardening and scale-readiness:

- decompose large services and UI coordinators before they calcify
- wire real billing and remaining email workflows into the quota/account layer
- add async/background job execution for analytics, email, billing sync, and heavy recomputation
- expand observability beyond exception capture into request, latency, quota, and business metrics
- add admin/support tooling for paid-customer operations
