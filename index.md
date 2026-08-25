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
- Health endpoints live in `blueprints/health_api.py`: `/health` and `/api/healthz` are static liveness checks, `/api/readyz` is a database-aware readiness check (`SELECT 1`, 503 on DB failure). All three are rate-limit exempt; Cloud Run uses `/api/readyz` as the startup probe and `/api/healthz` as the liveness probe (`cloudbuild.yaml`).

Development note:

- The direct local development-server entry point (`python app.py`) auto-applies pending Alembic migrations by default. Importing the Flask app for CLI inspection, tests, or WSGI discovery never applies migrations.
- This is meant to protect long-lived local databases from drifting behind the current model/schema.

## Current Architecture

### Backend shape

The backend is split into:

- `blueprints/`: thin HTTP route layers
- `services/`: business logic, orchestration, domain rules, serialization, and shared query helpers
- `models/`: SQLAlchemy models and session/engine management
- `validators/`: request validation schemas and decorators, split by domain with package-level re-exports for existing `from validators import ...` imports
- `migrations/`: Alembic schema history

Migration health note: revisions `c6e8f1a3b5d7` and `d7f9a2c4e6b8` close the model/schema drift exposed during the circuit hardening pass. They remove the obsolete visualization-annotation and note set-index shapes, normalize JSON-backed analytics and goal settings to PostgreSQL JSONB, restore missing indexes, align defaults/nullability/composite indexes, and make early circuit-rollout databases converge on the canonical cascade and NULL-equal metric-result uniqueness rules. The rollout reconciliation deterministically retains the most recently updated metric value if a legacy database contains duplicates that the old NULL-distinct constraint allowed. Both incremental downgrade/upgrade and fresh zero-to-head replays pass on an isolated PostgreSQL database, and `alembic check` reports no pending operations. Backend CI now provisions PostgreSQL and gates every model or migration change on upgrade-to-head, schema-drift detection, one-step downgrade/re-upgrade reversibility, and a final drift check.

Revision `a2c4e6f8b1d3` contracts the progress rebuild: it introduces activity tags, instance/set tag junctions, saved progress views and the active-view pointer, then drops the obsolete `progress_records` snapshot table after all readers switch to dynamic calculation. Corrective revision `b3d5f7a9c2e4` adds optimistic versions for instance/set tag assignment, partial indexes for active tag/view and history access, database-enforced root/activity ownership for tag junctions and active-view pointers, and safely contracts any head-stamped rollout database that retained the obsolete snapshot table. Fresh zero-to-head, model drift, and one-step downgrade/re-upgrade checks pass on an isolated PostgreSQL database. Applying `b3d5f7a9c2e4` to an existing database that still contains `progress_records` is intentionally destructive to those obsolete snapshots and must be treated as an explicit rollout decision.

Revision `c4e6a8b1d3f5` reconciles databases that were stamped at `b3d5f7a9c2e4` while missing its assignment-version columns or partial indexes. It uses idempotent PostgreSQL DDL, preserves all user data, and makes startup recovery safe for both complete and partially applied rollout states.

Revisions `d5f7a9c2e4b6` and `e6a8c1d3f5b7` add persisted circuit-run and round tag scopes plus assignment-provenance protection. Scope rows preserve the logical bulk operation and future-round inheritance, while the canonical activity-owned `ActivityTag` and instance/set junction rows remain the only inputs to dynamic progress calculation.

The intended backend flow is:

`request -> blueprint -> validation -> service -> serializer -> response`

Important backend design choices:

- Services are the canonical boundary for validation, ownership checks, and transaction behavior.
- Fractal roots self-scope with `root_id == id`; creation establishes that invariant after UUID generation, migration `7f8a9b0c1d2e` repairs older roots missing the linkage, and subtree deletion defensively includes its validated starting goal so a successful response always persists in subsequent lists.
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

- Goal Details always renders persisted targets, even if activity tracking has subsequently been disabled for the goal or its configured level. Tracking flags control whether an empty target workflow is offered; they do not hide existing target records that remain visible in Timeline.
- New fractals atomically receive a quota-aware `Simple Empty Template`, so the first-session path is immediately usable. Existing fractals with no templates get the same recovery as a one-click action in the Create Session template picker. Successful fractal creation now navigates directly to the new goal tree instead of returning users to Selection. The starter staging helper lives in `services/template_service.py`; the fractal service owns the transaction and emits the template-created domain event only after commit.
- First-run guidance is gated by the admin-managed `onboarding_v1` flag and scoped per fractal. Fractal creation initializes an active, revisioned entry in `preferences.onboarding_by_root` within the same transaction; `GET/PATCH /api/auth/onboarding?root_id=...` isolates checklist presentation state, dismissal, visits, and server-derived completion facts to that owned root. Roots predating per-fractal state are silently grandfathered as dismissed. `OnboardingProvider` keys its query by user and root and renders a compact lower-left checklist showing one step at a time with previous/next controls and automatic advancement after completion, expanding in place into a dense, internally scrolling sub-step guide. The selection page no longer shows a zero-fractal welcome/checklist; a brand-new user creates a fractal directly from the selection grid's add card. The checklist begins with "Get Acquainted with Your Goals": opening the shared Goal Detail modal or side panel and visiting its Timeline, Activities, and Notes views are revision-safe visit facts, while creating a child goal remains a server-derived domain fact. Existing `supporting_goal` achievements migrate to `child_goal_created`. The former "Create your fractal" step was removed because fractal creation already handles it. Settings provides resume/restart controls. Session completion advances its checklist facts without an interrupting celebration modal. Contextual “Got it” hint cards have been removed so the checklist is the sole onboarding guidance system.
- Mutations that can flip an onboarding fact invalidate the shared onboarding query prefix (`queryKeys.onboardingRoot()`, via `invalidateOnboardingProgress`) after persistence, so the server-derived facts refetch immediately and advance the checklist without waiting for stale time or navigation. This covers activity create/update/delete, goal create/update/delete, target create/update/delete (`useTargetQueries`, which drives the "Measurable" SMART criterion), goal-centric activity/group association changes (`invalidateGoalAssociationQueries`) and activity-centric association changes including session detail (`invalidateActivityGoalAssociationQueries`), which drive the "Achievable" SMART criterion and step-2 "Associate it to a goal" substep, session-template create/update/delete (`CreateSessionTemplate`), session creation (`CreateSession`), and session-detail activity/timer/completion mutations (`useSessionDetailMutations` via its shared session-list invalidation).
- Onboarding API version 3 adds per-parent `substeps` facts and persists observed achievements monotonically in each fractal's revisioned `preferences.onboarding_by_root` state (`completed_steps` and `completed_substeps`). Live domain facts can add checkmarks, but later edits, disassociation, archival, or deletion cannot erase an earned checkmark; restart resets presentation without resetting achievements. The checklist has five canonical steps in order (`break_it_down`, `create_activity_metric` titled "Create an activity", `make_goal_smart`, `first_session`, `schedule_program`); the former `see_progress` step and its Analytics/Notes visit tracking were removed across the client and API, while old persisted achievement keys remain harmless compatibility data. The widget derives its totals and numbering from the step list rather than a hardcoded count. Schedule Program has four tracked milestones: program creation, block creation, completed program day, and opening the Calendar Day modal; the first three derive from persisted program records while the modal visit uses revision-safe onboarding state. Substep copy can interpolate a `{level}` token with the fractal root's level word (e.g. "ultimate", "long term"); `OnboardingProvider` reads it reactively from the user's fractal-summaries cache (`queryKeys.fractals(userId)`) via `getLevelWord`, defaulting to "ultimate" until loaded. The compact lower-left widget separates per-fractal local collapse from persisted dismissal; its single-line success-coloured progress action sits at the top-right and, like the parent `Go` action, expands the same fixed-width shell while preserving its typography hierarchy. The expanded detail header reads `Step N: <title>` (brand-coloured `Step N:` prefix) above lettered sub-step codes, leaves position context to the footer navigation, and maintains a stable right-side status column for completion checks. Sub-step blurbs beneath the step header were removed. Not every sub-step is server-tracked: informational/navigational sub-steps carry a `None` fact and render as static guidance, while tracked/optional sub-steps map to derived completion facts. Actionable sub-step rows are full-width keyboard-accessible deep links to the relevant feature; informational guidance remains static, and completed state relies on the shared check badge without redundant row gradients.
- Root detection covers every registered fractal route section, including singular session detail and session-template management, while excluding account/admin routes so they never issue root-scoped onboarding requests; fractal deletion removes its `onboarding_by_root` entry in the same transaction to prevent dead preference state.
- Goal creation keeps the live SMART badge in the persistent modal header; its letters recalculate from the draft form state. The former in-form SMART guidance disclosure is removed, and active onboarding instead shows a dismissible, responsive callout beside the goal modal pointing users to the badge.
- Goal-level icons have one shared visual invariant across static and animated rendering: non-SMART goals use only the solid primary-colour shape, while secondary-colour detailing and animation (including the circle's globe lines) are reserved for SMART goals. Goal style resolution prefers embedded styling and the effective level ID, then recovers by level name/canonical type so scoped overrides still supply their configured secondary colour when a goal references the base level ID.
- Mobile fractal routes use one sticky, safe-area-aware horizontal navigation rail that mirrors desktop ordering: the enlarged icon-only fractal switcher (with the current fractal name preserved in its accessible label), Add Session, Goals, Programs, Sessions, Notes, Analytics, Settings, and Exit. Stable tap-target widths keep the rail legible, while touch momentum scrolling exposes off-screen destinations without wrapping or obscuring content at the bottom of the viewport. The fractal switcher dismisses open goal details and portals its viewport-anchored menu to `document.body`, keeping it above modal overlays and outside the rail's overflow/transform containing blocks; placement is recomputed across window and visual-viewport resize/scroll changes.
- The authenticated `.content-container` is the sole owner of the app-wide grid background across desktop and mobile. Route surfaces that should expose that grid, including Session Detail, Programs, and quick sessions, remain transparent instead of repainting a page-local grid or opaque app background; cards, side panes, docks, and modal sheets retain their own semantic surface fills. Mobile Session Detail begins directly with its sections instead of repeating the session name, status, duration, and detail-pane action in a summary header. Its Details/Timeline control is a full-width, safe-area-aware footer; the corresponding sheet terminates directly against the footer through one shared height contract. Both use the sheet z-index layer below canonical modals, so Activity Builder, Session Options, and other modal workflows fully obscure the session footer. Session Detail sheets, the Sessions filter sheet, and the mobile Programs sidebar consume the same authenticated-shell slide-up and backdrop-fade entrance classes, including the global reduced-motion override, instead of maintaining feature-local motion variants. The mobile Programs sidebar is a viewport-ported, safe-area-aware modal sheet with focus trapping, focus restoration, Escape/backdrop dismissal, and 44px tab targets; opening it no longer inserts content above the calendar or shifts the page. Programs uses the same mobile header contract as Sessions: title copy is visually hidden, actions form the header's horizontal rail, and the semantic header surface remains distinct from the grid content beneath it. The calendar panel itself stays transparent so unused flex space cannot mask the canonical grid. Mobile Programs header and calendar controls maintain 44px touch targets; previous, next, Today, and Select Days share one wrapping toolbar row, while the month title occupies the centered row below. The mobile calendar wrapper is content-sized with a minimum rather than a fixed height so FullCalendar borders and row rounding remain contained.
- Session template name badges are shrink-safe and wrap-safe in both compact and expanded Sessions cards: the shared badge owns border-box sizing, vertical text breathing room, and a min-width-zero label, while the expanded title link uses shrinkable content sizing so long names wrap without clipping and the completed/paused/in-progress badge stays directly beside the template name.
- Mobile session activity metric editors keep unit/history metadata visible beneath the metric-label column rather than beneath value fields for set-based, direct, and split variants. Desktop continues to show units and previous-value context inline.
- Global design tokens now include semantic tints, motion/easing, z-index, and layout primitives. Viewport and navigation-height primitives live in always-loaded `client/src/index.css`, rather than authenticated-only `App.css`, so the standalone public landing entry and the app shell resolve the same sizing contract. Theme selection is resolved before hydration and follows OS changes until the user explicitly chooses a theme. The maintainability audit rejects undefined global token references. Shared modals accept a semantic `layer`; goal-detail workspaces use the tokenized `top` layer and pass it to nested builder dialogs, whose `stackLevel` keeps goal selectors, warnings, and group builders visually above the workspace while preserving Escape/focus priority.
- Frontend Vitest full pre-push verification uses four fork workers, while staged-file related tests use two isolated worker threads. The dependency-scoped pre-commit pool avoids repeated child-process startup on broad frontend diffs without reducing coverage; typical small commits remain fast because unrelated tests are still excluded.
- Admin tables, filters, search/form controls, landing showcase fields, cards, and charts consume shared theme tokens; the maintainability audit rejects dark-only background literals in `Admin.module.css` so light-mode regressions cannot silently return.
- The filled Add Session navigation action explicitly retains its white label across visited, hover, and focus states so global link-state rules cannot turn it blue.
- A user can have at most one unfinished session per fractal. `sessions.owner_id` plus `root_id` and the partial unique index `uq_sessions_one_active_per_owner_root` provide the database invariant, while session lifecycle preflight checks return a navigable `409 active_session_exists` response. The introducing migration preserves the most recently updated unfinished session per owner/root pair and marks older same-fractal legacy duplicates complete without deleting their history. `GET /api/<root_id>/sessions/active` is the canonical root-scoped lookup. Desktop and mobile navigation key the shared active-session query by user and current root: switching fractals rechecks that fractal, showing `+ ADD SESSION` when its slot is empty or reusing `CompletionCheckBadge` to show `SESSION IN PROGRESS` / `SESSION PAUSED` and link directly to its session. Creation, completion, reopening, deletion, pause, and resume mutations invalidate the shared active-session query prefix; stale direct visits to Create Session redirect only to an existing active session in the same fractal. Completed quick-entry sessions never occupy an active slot.
- Create Session is program-aware on the user’s timezone date. The shared Programs query establishes the currently underway program and block independently of whether a day is scheduled today; the header and per-user/root/program goal-scope preference therefore remain available for an unscheduled day or a manually chosen template. `GET /api/<root_id>/programs/active-days?date=YYYY-MM-DD` remains the date-keyed source for scheduled-day identity, template colors and requirement order, completion counts, and completed template ids. The page groups scheduled days by program id (so duplicate names never merge), advertises today’s day, prioritizes its templates, consistently styles program, block, and template names with their configured colors, auto-selects a single required session, and accepts calendar deep links via `program_day_id`. Canonical metric/session membership is owned by `services/program_scope.py`: program-, block-, and non-deleted day-goal seeds expand through active descendants only; ancestors may be added separately as visual context but never affect membership. Program list/detail and active-day payloads expose additive `scope_seed_goal_ids` / `scope_goal_ids` while retaining legacy fields. Manual goals outside that advisory scope remain selected until explicitly removed and are recorded in `off_program_goal_ids`. Session creation persists validated `program_id` / `program_block_id` query columns atomically while retaining the JSON `program_context` display/rollback snapshot.
- Program execution insight is a fixed, program-native read model rather than a second configurable analytics UI. `GET /api/<root_id>/programs/<program_id>/metrics` and the lazy, batched `/programs/metrics/comparison` endpoint use `ProgramMetricsService` and the analytics engine’s governed dataset queries for tenant policy, soft-delete rules, and effective timestamps. Detail windows are capped at 366 days with adjacent cursors; observation ends at the caller-timezone `as_of`, so future days are always upcoming. The contract declares current-state retrospective attribution, equal-split multi-goal effort allocation, and explicit session linkage. The Programs page keeps Calendar as its default workspace, places the compact authoritative summary in the sidepane to preserve calendar height, and provides an Insights tab with semantic table equivalents for heatmap, blocks, goals, templates, volume, weekdays, outcomes, and ended-program comparison. The adherence heatmap has a visual, text-labeled state legend. Blocks default to deterministic chronological order, and every visible Blocks and Goal coverage column supports stable, keyboard-accessible sorting with explicit `aria-sort` state. Goal coverage rows carry additive current-state level and SMART metadata, render the configured goal shape and colors beside the accessible text label, and explain equal-split effort-share semantics through a subtle, keyboard-accessible column-header affordance whose viewport-anchored tooltip escapes the horizontally scrolling table. Ended-program comparisons render program names in their configured colors. Authenticated client metric builders were removed; the public landing preview retains a deliberately named static `buildDemoProgramMetrics` adapter. Metrics query identity includes root, program, timezone, and range, and evidence-affecting mutation paths invalidate the root metrics prefix. Migration `f7b9d2e4a6c8` adds nullable session linkage FKs plus the `(program_id, COALESCE(session_start, completed_at, created_at))` index and relational-first, consistency-checked JSON backfill.
- `client/src/App.css` is back below its 800-line target; shell/navigation/session compatibility rules live in the single adjacent `client/src/app-shell-and-session.css` split. Settings now composes the canonical Modal and its former overlay/keyframes were deleted.
- The canonical Modal traps Tab/Shift+Tab focus, focuses its first control on open, restores prior focus only when the modal actually closes, supports Escape/backdrop policies, and respects the shared reduced-motion-safe animation. Close callbacks are read through synchronized refs so controlled form rerenders cannot restart focus management or steal focus from confirmation inputs.

- TanStack Query is the canonical remote-data layer.
- Target analytics preserves set identity: for set-based activity instances, trend and scatter charts and backend best-value summaries project all metrics from the canonical best set (the activity's `is_best_set_metric` anchor with deterministic secondary-metric tie-breaking). They never combine independently optimal values from different sets into a synthetic performance; direct instance metrics are used only when no usable set exists.
- The public landing page lives at `client/src/pages/Landing.jsx`; its editable messaging source is `client/src/content/landing.md`, parsed by `client/src/content/landingContent.js`. The root route serves it only on `fractalgoals.com` / `www.fractalgoals.com` (`client/src/utils/marketingHost.js`); `my.fractalgoals.com` keeps the authenticated app at `/`, `/landing` redirects to `/`, and local dev can preview the same landing page at `/landing-preview` while keeping `/` as the fractal-selection root. `isPublicLandingLocation` is the shared route boundary: `AuthProvider` skips session initialization there, ignores session-expiry events, and the shared API core neither attaches bearer credentials to `/public/` calls nor dispatches expiry events while the public landing is active. On desktop widths (≥981px) the landing page is a segmented one-section-at-a-time horizontal experience: `main.page` is itself the scroll container (filling the shared `.content-container`) with CSS `scroll-snap-type: x mandatory`, wheel and trackpad gestures advance one horizontal section at a time unless a nested panel can scroll vertically, and four full-viewport snap sections sit left-to-right — hero (persistent header above, root-icon example picker between the headline and bordered explainer panel whose hover/focus state temporarily replaces the headline with the root goal name and whose click loads that example before auto-scrolling sideways to the goals view with reduced-motion-aware behavior), goals explorer (`#examples`, a two-column layout: a left sidebar holding the section header plus four interactive highlight cards — lineage scoping, evidence fading, metrics overlay, tree/hierarchy layout — that demo their feature live on the tree and whose copy comes from `###` cards in the `landing.md` Examples section, with the explorer panel filling the rest), features (`#features`), and a private beta CTA (`#beta`) that merges the former audience/"who it is for" cards above the email signup. The persistent header is the section navigation rail: internal header items scroll sideways to their sections and highlight via `aria-current` when `client/src/hooks/useActiveLandingSection.js` reports that section at the page container's horizontal center. Once the active section is past the hero, an example-fractal icon rail (`client/src/components/landing/LandingExampleRail.jsx`) appears as a fixed bottom-centered overlay; rail example clicks flip the active example in place — no scrolling — so the goals view and feature stage can be compared across examples without returning to the hero picker. Below 981px the page keeps a normal continuous vertical scroll. The landing example explorer is a full mirror of the authenticated goals page: it reuses the real `FlowTree` (with its fade/scope-transition animations), the full `FlowTreeOptionsPane` view widget (tree/hierarchy toggle + fade/hide-inactive, hide-completed, metrics overlay), and the shared `.details-window.sidebar.docked` slide-in detail panel. Its FlowTree viewport is interaction-locked by default on landing (scroll zoom and drag pan disabled) so page scrolling cannot accidentally zoom the graph; clicking/focusing the viewport unlocks graph interaction, while changing examples or leaving the goals section locks it again. Clicking an example goal filters the tree to that goal's lineage and re-centers it. The read-only `GoalDetailModal` exposes the full Details / Timeline / Activities / Notes tab set with edit affordances removed and a stop-sign cursor over inert controls. Below the explorer, a Features section (`client/src/components/landing/LandingFeaturesSection.jsx`) mirrors the goals-view layout: a left sidebar holds a fixed section message, a compact 2x2 feature selector (Sessions, Activities, Programs, Analytics), and markdown-editable per-feature detail cards parsed from `####` blocks under each feature in `landing.md`; the right-side viewport renders the active full-page-style example surface: a featured session-detail preview built from the published snapshot, featured activities in a two-column activity-card plus `GoalHierarchyList` goal-inheritance lineage demo, a featured full program-page preview with Calendar/Blocks toggle and hideable details/goals sidebar, and published analytics views selected from single-chart saved views. Session-preview hierarchy goals open the canonical read-only Goal Detail modal inside the feature-example boundary; sub-goal creation is suppressed there, while authenticated session hierarchies retain it. Session-preview target cards open the canonical read-only target analytics surface in the same boundary; they consume published per-target analytics and share the legacy per-activity history adapter used by the Goals showcase, without making authenticated API requests. Featured picks come from the published snapshot's `showcase` object (schema v5) with auto-derived fallbacks for older snapshots (`landingFeatureModel.js`). An inline script in `client/index.html` starts one landing snapshot fetch at HTML parse time and aborts it after two seconds. Production reads the public, deterministic-gzip GCS object first; `client/src/utils/landingPrefetch.js` consumes that attempt exactly once, validates revisioned schema-v12 snapshots, and falls back to the unauthenticated `/api/public/landing-examples` endpoint without retrying GCS. The fallback is `no-store`, and no competing Nginx proxy cache or publish-time cache warmer remains. The endpoint/static object uses short public cache lifetimes, and both the example explorer and feature stage hold their footprint with shimmer skeletons while published data is pending. A built-in demo snapshot keeps the sample goal view and feature showcase visible on the public landing entry if no examples are published; published snapshots replace the fallback when present. No authenticated API calls are made. For shareability, `client/index.html` carries static (crawler-visible) SEO/social meta — description, canonical `https://fractalgoals.com/`, Open Graph, and `summary_large_image` Twitter tags pointing at `/og-cover.png` — kept in sync with the `landing.md` SEO block; the runtime meta injection in `Landing.jsx` only matters for in-app navigation. The Open Graph image is committed at `client/public/og-cover.png` and regenerated from `client/scripts/og-cover.svg` via `npm run generate:og-image` (uses `@resvg/resvg-js`). `client/public/robots.txt` and `client/public/sitemap.xml` are served as static files through the Nginx `location /` `try_files` fallback.
- Desktop landing navigation applies a fresh-gesture boundary guard to nested Goals and Features scrollers: native overscroll is contained, remaining wheel/trackpad momentum is swallowed when an internal panel reaches its top or bottom, and section navigation becomes eligible again after a 180 ms idle gap.
- The public entry has a route-specific bootstrap (`PublicLandingRoot.jsx`) that excludes the authenticated app shell, router, debug tools, and toast UI while sharing the canonical provider envelope in `ApplicationProviders.jsx` with `AuthenticatedRoot.jsx`: `TimezoneProvider` → `AuthProvider` → `OnboardingProvider` → `GoalLevelsProvider` → `GoalsProvider` → `ThemeProvider` → `ActivitiesProvider`. Public auth/onboarding queries remain disabled anonymously, so shared read-only and deferred components receive their required contexts without authenticated network work; the integration test exercises every provider hook and verifies that `/auth/me` is not requested. Production marketing hosts preload the configured GCS snapshot, while local `/landing-preview` deliberately ignores any production GCS build URL and uses `/api/public/landing-examples`, allowing local publication testing plus the built-in demo fallback. Landing owns its grid background directly, including the pre-React critical shell, so it no longer relies on authenticated `App.css`. `client/index.html` paints that accessible, route-gated hero shell as a fixed sibling of `#root`; its header geometry, mixed-case navigation typography, initial Goals active state, centered headline, reserved example-picker footprint, explainer panel, responsive breakpoints, themes, and short-viewport sizing mirror the rendered hero. `landingBootHandoff.js` keeps the shell covering React until the hydrated Landing surface exposes `--landing-css-ready: 1`, then removes it atomically. While GCS is still in flight, React preserves the same empty picker footprint instead of rendering temporary demo icons; the built-in example is introduced only after an error or a successful empty publication. Together these handoffs prevent both unstyled flashes and data-driven hero layout shifts. Bootstrap and render errors dismiss the cover explicitly. Monitoring still initializes during idle time. The goals `FlowTree`, Features section, and individual feature previews load only as their panels approach or visitors signal intent, with stable section anchors and skeletons preserving snap navigation and layout. The Vite production build fails if the public landing's static initial import closure exceeds 175 kB gzip of JavaScript or 20 kB gzip of CSS; the corrected July 2026 build measures 144.0 kB JS and 9.6 kB CSS, still 71% below the former 495.8 kB entry bundle.
- Query keys are centralized in `client/src/hooks/queryKeys.js`.
- Shared typography tokens live in `client/src/design-tokens.css`; technical/configuration UI should use `--font-family-config` or the `ConfigText` atom from `client/src/components/atoms/Typography.jsx`, which intentionally follows the mono metadata style used for session section duration averages.
- The authenticated goals page now uses a persisted page surface layout (`PageSurfaceLayout` via `/api/roots/<root_id>/page-surfaces`) for the background grid. `client/src/components/surface/PageSurface.jsx` reuses the shared `GridLayout` engine from analytics and has two explicit modes: overview gives the tree/widgets the full surface, while scoped mode flex-splits the grid region and a surface-local goal detail region. A single saved surface now stores separate `view_configs.overview` and `view_configs.scoped` layouts, so adding/resizing widgets in overview does not mutate scoped, and vice versa; legacy configs migrate their existing widget layout into overview while scoped starts as a clean tree/detail workspace. The scoped detail split persists as whole-surface grid cells (`detail_panel.w` out of `detail_panel.cols`), not as a percentage of the shrinking hierarchy grid, so expanding the detail panel takes space from the hierarchy without rubber-banding; the splitter overlays the grid-snapped left edge of the `.surface-detail-window`, whose perimeter gets the configure-mode blue highlight, and the scoped hierarchy panel can be intentionally left narrower than the left grid region to expose real grid space between the FlowTree window and detail window. Overview configure mode never shows a goal-detail placeholder; users resize the Goal Hierarchy grid window and hover/click exposed background grid cells outside that hierarchy window to add widgets such as Last Session, Calendar, Metric Card, and Analytics Panel. The Calendar widget is a thin compact/read-only adapter around the shared `ProgramCalendarView`, fed by the same `buildProgramsCalendarEvents` and `buildProgramBlockLabels` helpers as the Programs page, opens on the current date/month, and keeps program/block backgrounds, block labels, scheduled program-day events, completed program-day sessions, and goal events in the canonical calendar styling instead of a separate surface-only renderer; goal deadline entries render the configured goal shape, colors, completion colors, and SMART detailing through the shared `GoalIcon`, with transparent icon/label backgrounds, theme-semantic high-contrast label text, and direct pointer/keyboard activation that does not depend on FullCalendar's delegated hit detection. Standard and compact modes resolve one background per date: a block color replaces its program color rather than blending with it, and the selected color is mixed toward the active light/dark semantic card surface using theme-specific design-token weights. Calendar color styling is keyed by stable day-cell metadata rather than FullCalendar-managed class names, so selecting a day retains its program or block tint while the selection border remains visible. On mobile, the Programs view tabs use the same non-shrinking control-group pattern as Sessions/Manage Activities inside the shared horizontally scrollable page header, preserving readable labels while Program Options and sidebar controls remain reachable by touch scrolling. The Analytics Panel chrome hosts the saved-view picker only in configure mode, otherwise baking the selected saved view into the title as `Analytics Panel - <view name>`, and lists saved analytics views (single portable chart profiles) rather than multi-chart dashboards; overview renders them whole-fractal, while scoped mode intersects compatible goal-based charts with the currently visible selected-goal subtree and keeps empty scoped results as stable no-data states. The hovered background cell gets a light configure-mode highlight; while the add-widget menu is open, hovering a widget type previews the minimum grid footprint (`minW`/`minH` from `widgetRegistry`) that widget will occupy, and selecting it spawns the widget at that same minimum size. The transparent hierarchy viewport itself remains exclusively for goal-tree interaction and is not a widget placement target. Configure mode gives every surface panel a blue editable outline and visible resize handles, and the FlowTree options pane is rendered as inline text and marks aligned to the 20px surface grid while showing a live cell tracker, desktop/mobile target, active editing state badge (`Overview` or `Scoped`), and explicit `Save`/`Cancel` edit-session controls; `Save` persists the current desktop/mobile JSON config and exits configure mode, `Cancel` reloads the active/default surface draft without writing, and `Save as...` opens an inline name field inside the options widget rather than a browser prompt. The same options pane lists each program active on the user's timezone-aware current date as a mutually exclusive `Scope to <program>` control; the chosen program is shown beside the widget in its program color, remains visible while the pane is minimized, and persists per user/fractal while that program remains active. Program scope includes program-, block-, and day-associated goals plus every ancestor and descendant, and is intersected consistently with selected-goal lineage, inactivity/completion filters, type-to-zoom search, and metrics. Saved layouts store `layout_bounds` per view config and are fitted to the current desktop/mobile grid before rendering or editing, so cell-relative sizing scales across screen sizes; mobile loads/edits the separate `mobile_config`. The goals route must render selected-goal detail in the surface-owned `.surface-detail-window`, not the legacy global `.details-window.sidebar.docked` floating sidebar classes, so the tree and detail panel share space instead of overlapping.
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
- Best-set selection is deterministic across client and backend: the configured best-set metric is the primary ranking key, ties are broken by each remaining tracked metric in definition order while respecting `higher_is_better`, present values outrank missing tie-break values, and exact ties retain the earliest set.

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
- Legal documents and data-rights machinery back the published Privacy Policy and Terms of Service. Both documents are markdown (`client/src/content/legal/privacy.md`, `terms.md`) imported with Vite `?raw` and rendered by `client/src/components/legal/LegalDocument.jsx`; metadata headers provide the displayed version/effective date, while the lightweight `legalVersions.js` values keep signup within the landing bundle budget. Signup requires explicit acceptance, stores timestamped evidence in user columns, and the API compares submitted versions with backend-owned canonical versions before accepting it. Missing or outdated acceptance sets `legal_acceptance_required`; authenticated API use is then restricted to recovery/data-rights routes and the blocking `LegalAcceptanceModal` until `POST /api/auth/legal/acceptance` records the current versions. Cross-runtime tests keep the Markdown, browser, and backend versions aligned. Public `/privacy` and `/terms` routes and Settings/landing links expose the documents. Password-confirmed `POST /api/auth/account/export` (2/hour) returns a fail-closed, owner-scoped portable export of core content; broader operational-record access remains a support request. `DELETE /api/auth/account` schedules permanent deletion after the active 30-day grace period, and Settings exposes `DELETE /api/auth/account/deletion` to cancel it. The due-erasure sweep reuses `AdminService.hard_delete_user`; its root deletion order is covered for circuit-held activity references, and pre-account beta/invite email identifiers are removed. `admin_audit_events` records privileged account mutations plus every scoped support-mode request; labels retain only an opaque user correlation key after erasure. BigQuery event-log exports contain structural envelopes but null free-form descriptions/payloads, and enforce 730-day deletion even for legacy unpartitioned tables. The daily `data-retention` Cloud Run job (`scripts/run_data_retention.py`, provisioning notes in `docs/data-retention.md`) enforces account erasure plus product-event, password-reset, email-event, administrative-audit, and closed-beta-request windows. Sentry session replay is configured with `maskAllText`/`maskAllInputs`/`blockAllMedia`; enabling it still requires policy/provider review.
- admin-controlled public landing examples: admins select admin-owned root fractals in the Admin `landing` tab, which includes a direct `View landing page` link for checking the public result, and manage each selected fractal through one expandable five-tab composer (`Goals`, `Sessions`, `Activities`, `Programs`, `Analytics`). Each selected-example header keeps ordering compact with its one-based index plus accessible up/down and remove icon buttons; the composer toggle uses the shared per-example publish validator to show its live number of issues blocking publish rather than an unrelated showcase-selection summary. The Goals tab owns the four per-example goal-tree viewer defaults (fade inactive branches, hide inactive goals, hide completed goals, and metrics overlay) plus three canonical, independently editable bullets (`break_down`, `associate_activities`, `set_targets`): each stores a heading, body, and goal reference, while Set Targets also stores a target reference and only offers goals that currently have targets. Selecting an example on the public landing page rehydrates its published tree defaults, preventing visitor changes from leaking between examples; pre-v12 snapshots normalize to four unchecked settings. Publishing requires at least one selected fractal and all three demonstrations on every selected fractal; the footer reports missing goals/targets and copy fields by public label instead of relying on a disabled-button tooltip, while incomplete configurations can still be saved as drafts. Clicking published Goals copy scopes the real FlowTree to the selected goal and opens the shared read-only Goal Detail surface in Details or Activities; Set Targets and clickable target cards stack the app's canonical read-only target analytics modal (chart plus activity timeline) over Goal Detail for the selected example and goal; its portal and dimming backdrop stay inside the interactive example canvas, and pre-v11 snapshots fall back to their metric-bearing published activity history. The remaining tabs preserve the existing per-example `showcase` picks: a featured session, one spotlight activity, a featured program with a clipped date window, and up to 3 saved analytics views. The Activities composer reuses the session `ActivityPicker` with hierarchical groups and search in single-selection mode; legacy multi-activity drafts normalize to their first selection, and the public Activities feature has four ordered demonstrations: a searchable, read-only Manage Activities-style catalogue of the example fractal's nested groups and activities, followed by the selected spotlight's Builder, Metrics, and Timeline views, with no visitor-facing activity selector. All bounded picker data, including activity groups, goals, and nested targets, comes from `GET /api/admin/landing-examples/options`. Draft labels/order, `landing_content`, `tree_view_settings`, and `showcase` live in `app_settings.landing_example_settings`; manual publish writes a sanitized cache to `app_settings.landing_example_cache`. Publish resolves unavailable goal/showcase references, persists that reconciled state back into the editable settings, returns it to the admin client, and presents one-time cleanup notices as warnings rather than failed-publish errors, preventing invisible deleted analytics IDs from warning on every later publish. `/api/public/landing-examples` serves only the committed published cache without auth and with `Cache-Control: no-store`; the static object is the landing page's primary read. A configured static destination is a required part of publication: the candidate revision is uploaded before the database commit, any upload failure preserves the prior database publication, and a database commit failure restores or deletes the candidate object. Per-process plus PostgreSQL advisory locks serialize concurrent publishers. Publish responses and the Admin UI expose the revision, delivery status, and compressed size. The Admin UI explicitly warns that the bounded tree, notes, timelines, sessions, activities, programs, targets, and analytics become publicly downloadable. The published snapshot is a versioned (`schema_version: 12`), self-contained read model: each goal node embeds target activity/metric references, authenticated-parity activity association payloads (direct, inherited-from-children, inherited-from-parent, and linked group metadata), a bounded production-parity timeline page, and bounded notes; each example also carries resolved `landing_content`, `tree_view_settings`, and `showcase` objects, root-scoped `evidence_goal_ids`, a whole-fractal `metrics_summary`, serialized `programs`, bounded `sessions` (always including the featured session), a bounded activity catalogue plus all `activity_groups` (always including spotlight/analytics-referenced definitions beyond the catalogue cap), serialized `analytics_views`, analytics-ready `analytics_activity_instances` with metric values and progress comparisons required by those views, and `session_templates` — so the read-only landing explorer and feature showcase render from the cache/static artifact alone. Landing session previews and authenticated session detail share `utils/sessionSection.js` normalization, resolving legacy definition IDs, embedded exercises, and stale single-section membership to canonical activity-instance IDs before rendering.
- The landing Goals showcase matches the authenticated desktop detail split at 34% instead of capping the dock at 420px. Published target cards are keyboard-accessible read-only actions, and both those cards and the configured `set_targets` demonstration open one landing-scoped target manager modal above Goal Detail. Modal selection stores the current example/goal/target IDs and re-resolves them from that published snapshot, so changing examples cannot retain or expose a target from another example; the former inline read-only `target-manager` Goal Detail route is no longer used by landing navigation.
- Landing showcase session curation excludes misleading timer-only records: the admin picker labels and disables sessions with zero activity instances, publish reconciles older empty selections with a warning, and automatic public resolution prefers the newest session containing substantive activity work.
- Landing example publication is revision-safe and bounded: snapshots carry UUID revisions, serialize once, use deterministic gzip, and are rejected before delivery above 4 MB expanded or 500 KB compressed; publish errors and the admin delivery summary report both sizes because the compressed ceiling governs GCS transfer cost while the expanded ceiling bounds browser parsing and memory. GCS writes use bounded retries/deadlines and `Cache-Control: public, max-age=0, must-revalidate, no-transform`; Cloud Build derives both the bucket and public URL from `$PROJECT_ID` and `$PROJECT_NUMBER`, and production fails closed if no static destination is configured. Production uses a PostgreSQL transaction advisory lock (with a local process-lock fallback), uploads GCS before committing the matching database cache, and compensates the object if commit fails. Structured `landing.publish_delivered` / `landing.publish_failed` events feed a log metric and enabled alert policy. The dedicated bucket has uniform access, anonymous object-get-only IAM (no listing), CORS for apex/www, object versioning, and lifecycle cleanup after ten newer generations or 30 days. The inline browser preload has a two-second abort and one static attempt before its no-store API fallback. The publish path retains the 200s Nginx, 210s Gunicorn, and 240s Cloud Run ceilings, while production-shaped single- and multi-example performance tests enforce payload, query, and latency budgets. `shell-scripts/verify-landing-snapshot.sh` verifies headers, CORS, schema, example count, and an optional expected revision after deployment.
- The landing activity catalogue renders the canonical Manage Activities `ActivityCard` in an explicit read-only mode inside expanded, collapsible group sections, and both surfaces share `ActivityCatalogueToolbar` for identical Search and Collapse All/Expand All controls. The published snapshot includes `activity_instantiation_summary` for catalogue definitions, allowing the public cards to retain production-parity instance counts, last-used dates, average durations, and metric badges without authenticated requests; edit, duplicate, delete, reorder, and drag behavior remains absent.
- user profile, password, email, username, and preferences endpoints
- membership tiers and quota limits for free/paid/legacy users
- per-user app-data storage limits and usage reporting
- Storage-quota accounting is egress-bounded: `QuotaService.get_storage_usage_bytes()` executes one PostgreSQL statement composed of scalar byte aggregates and never hydrates owned payload rows into the API process. Compact JSONB sizes are calculated authoritatively by the immutable, fixed-search-path `compact_jsonb_octet_length(jsonb)` database function (migration `e8a1c4f7b2d9`); application-side write checks use matching compact UTF-8 estimates. This keeps Supabase/Supavisor uncached egress constant per quota check as account history grows.
- quota usage reporting in account settings
- admin user management, invite-key generation, support access into user fractals, and grouped admin user actions for tier/quota updates, temporary passwords, suspend/reactivate, clearing login locks, role changes, soft delete, and hard delete; suspension is the admin-controlled `User.is_active=false` account state and blocks both new logins and existing token-authenticated access, while login locks are automatic failed-login lockouts tracked through `failed_login_count` / `locked_until`
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

Observability and usage analytics:

- `services/ops_log.py` emits greppable one-line `ops_event=<name> key=value` events on the `fractal.ops` logger for auth login failures, password reset lifecycle, invite sends/failures, beta signup lifecycle, quota denials, Resend webhook rejections, rate-limit hits (via the JSON `@app.errorhandler(429)` in `blueprints/error_handlers.py`), and 5xx responses. The module docstring is the grep contract.
- First-party product telemetry: the frontend (`client/src/utils/telemetry.js`, `usePageViewTelemetry` in the app shell) batches allowlisted events (`page_view`, `settings_opened`) to `POST /api/telemetry/events` (`blueprints/telemetry_api.py` → `services/telemetry_service.py`), stored in `product_events` with normalized low-cardinality paths (`/:rootId/goals`). Telemetry is authenticated-only, honors Do Not Track, and is fire-and-forget. The server-side event-name allowlist in `services/telemetry_service.py` is the cardinality contract.
- Admin usage dashboard: rendered inside the Admin `overview` tab below the summary cards (`client/src/components/admin/UsagePanel.jsx`) backed by `GET /api/admin/usage?start=YYYY-MM-DD&end=YYYY-MM-DD` with legacy `days=N` fallback (`services/admin_usage_service.py`). The overview `DB Storage` summary card from `GET /api/admin/summary` reports `pg_database_size(current_database())`, so it includes the entire Supabase/Postgres database across users, indexes, and operational/event logs; per-user storage rows continue to show quota-accounted app content. The usage panel aggregates DAU/WAU/MAU (product_events with `last_login_at` fallback), per-user activity (page views, sessions/goals created, and total domain events via `event_logs` joined to `goals.owner_id`), top pages/events, a full filterable domain-event breakdown, email delivery health, event-table storage stats, and a database-wide storage breakdown from Postgres catalogs (`pg_total_relation_size`, table heap, indexes, TOAST, and a database-total remainder for system catalogs/internal/free-space overhead), telemetry retention, and the latest BigQuery export state. `PATCH /api/admin/usage/retention` manages product-event retention and `POST /api/admin/usage/prune` deletes product telemetry older than the stored/default retention.
- Logs page and clearing: `/:rootId/logs` is an admin-only route and nav item. `GET /api/<root_id>/logs` remains owner-scoped because the user's analytics engine can still query their own `event_logs` dataset, but `DELETE /api/<root_id>/logs/clear` is admin-only; users cannot self-clear operational history that powers admin analytics/export. `event_logs` are excluded from user storage-quota accounting for the same reason.
- BigQuery analytics export: `services/analytics_export_service.py` incrementally exports app analytics tables only — `product_events`, `event_logs`, `email_delivery_events`, and `email_webhook_events` — using `(timestamp/id)` or `(created_at/id)` watermarks stored in `app_settings.analytics_export_state`, with a ten-minute lag window for delayed event writes; every load supplies an explicit BigQuery schema with `CREATE_IF_NEEDED` so first-run backfills create missing analytics tables. The `users` dimension is refreshed with `WRITE_TRUNCATE` and excludes password hashes/preferences/private account internals; Supabase platform metadata, auth schema internals, storage metadata, Postgres catalogs, and DB storage-inspection rows are not exported. `scripts/export_analytics_to_bigquery.py` is the Cloud Run job entrypoint, `cloudbuild.yaml` updates the `export-analytics` job after migrations, and `docs/bigquery-export.md` covers one-time dataset/job/scheduler setup plus dedupe views.
- Operational docs: `docs/architecture/BACKUP_RESTORE_RUNBOOK.md` (Supabase backup posture, RPO/RTO, restore procedures, pre-migration snapshot, verification log), `docs/bigquery-export.md` (analytics warehouse export setup), and `docs/planning/BETA_PREFLIGHT.md` (the repeatable release gate run before each beta invite wave).

Performance and production-hardening notes:

- Backend responses include `X-Response-Time-Ms`; slow requests are logged using `SLOW_REQUEST_THRESHOLD_MS`.
- API request bodies are capped by `MAX_CONTENT_LENGTH`.
- SQLAlchemy pool sizing is environment-driven via `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT`, and `DB_POOL_RECYCLE_SECONDS`.
- Goal tree/detail, activity-definition, activity-group, program, fractal-summary, session `goals-view`, goal-activity association, and goal-timeline endpoints intentionally batch the relationships or aggregates consumed by their serializers to avoid N+1 round trips against remote Postgres.
- Session detail add/remove activity and timer start/reset mutations keep response serialization on the already-loaded instance path and have query/latency budget coverage.
- Fractal-route header root-goal lookups request `include_children=false`; full goal-tree consumers should use the dedicated tree query instead of duplicating root detail fetches.
- Goal detail timeline data remains lazy-loaded by the frontend; the backend timeline endpoint uses the shared eager goal-tree loader once the user opens the Timeline tab. The Timeline tab is a meaningful goal-history/evidence projection rather than a raw audit-log dump: it includes activity evidence, target creation/achievement, and goal lifecycle events (`goal.created`, `goal.completed`, `goal.uncompleted`, `goal.paused`, `goal.resumed`) for the selected goal and, when enabled, its descendant goals. Pause/resume entries are sourced from durable `goal_pause_intervals`; legacy `child_goal` timeline filtering remains supported for older callers, while the UI uses the broader `goal_lifecycle` category.
- Goal detail time/session metrics and the daily duration graph intentionally use the same evidence semantics as the goal timeline: completed activity instances from direct activity associations, activity-group associations, descendant goals, and enabled parent-activity inheritance are deduplicated before totals or graph buckets are computed. This keeps the Timeline tab summary and Time Spent graph aligned with visible timeline evidence instead of only counting manually linked `session_goals` rows.
- Clicking Time Spent from the goal detail Timeline tab opens a page-level, registry-backed graph profile modal (`client/src/components/analytics/graphs`), currently using the `goalDuration` profile fed by the evidence-consistent daily-duration endpoint. The modal is portaled outside the goal detail shell and preloaded when the Timeline tab is active so the click gives immediate feedback; the former one-off `GenericGraphModal`/`useGoalDurationModal` path was removed so new standalone graphs are added through the graph profile registry instead of ad hoc modal components.
- Goal detail manual completion/uncompletion confirmation is part of the normal detail shell: the persistent goal header remains visible, confirm/cancel actions render through `GoalDetailModalFooter`, and the confirmation body/actions stay on the goal level color until the completion mutation actually changes the modal into the Completed color state. Completed goal detail and uncompletion views use the Completed color for date, target, note, and action accents, while program rows preserve their user-chosen program colors. The frontend derives the displayed program impact via `client/src/utils/goalCompletionPrograms.js`: completing lists only currently active scoped programs, while uncompleting lists scoped programs whose date window contained the previous completion timestamp. The completion confirmation view can also create a special goal-scoped note with `note_kind: "goal_completion"`; the Details tab shows that completion note above the description, and the uncompletion confirmation shows it after date/program/target impact and removes existing goal completion notes before clearing the completion. On mobile, the Activities footer keeps Associate Activities and Add Target side by side; the active association picker uses a two-row action grid with Cancel/Clear above a full-width confirmation action; and its four association counts use concise labels in a single non-wrapping row. Other two-action goal-detail footers retain their stacked mobile layout.
- Goal detail header metadata owns timing information: Created always comes first when present, incomplete goals show Due next, completed goals replace Due with the completed datetime, and Age appears after Due/Completed using the same shared `getAgeLabel` formula as FlowTree nodes. The footer completion control remains action-only (`Mark Complete` / `Mark Incomplete`) rather than carrying the completed timestamp. On mobile, the title and shell use tighter spacing, while the original full-fidelity level badge, SMART state, status, Created, Due/Completed, and Age treatments form one centered non-wrapping metadata rail with native swipe-to-pan overflow matching the app navigation rail. The four primary detail actions use a compact 2x2 grid while other footer workflows retain their purpose-specific responsive layouts.
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
- Email verification, billing notices, quota warnings, and marketing/bulk mail are not yet present; password reset, beta invite, and password/email-change security notices are the current transactional email workflows, with Resend delivery webhook ingestion wired for those sends. Security notices are best-effort sends after commit; email-change notices go to the OLD address.
- Admin force-password-change is enforced: `token_required` returns `403 password_change_required` for non-exempt routes while the `admin_force_password_change` preference (shared helpers in `services/account_flags.py`) is set, `serialize_user` exposes top-level `must_change_password`, the frontend shows a blocking `ForcePasswordChangeModal`, and both self-service password-change paths clear the flag.
- Admin support access is explicit and scoped by `admin_user_id` plus `admin_mode=read_only|read_write`; it is not full impersonation.

## Core Domain Areas

### Goals

New-fractal onboarding on the selection page uses a compact responsive two-column modal: concise outcome fields on the left and a large-icon vertical goal-level hierarchy on the right, with Create anchored beneath the hierarchy. Only name and goal type are required; description, relevance, and deadline are optional. Each newly opened root-fractal modal starts with a randomized coordinated color palette and distinct icon combination, while child-goal creation retains configured level styles. The goal-type control provides hover/focus guidance about each level's scope and time horizon and always-visible side-by-side Primary Color and Secondary Color (SMART ring fill) controls. Clicking a large icon opens the canonical seven-shape visual tray used by Goal Characteristics. A compact utility toolbar can reshuffle coordinated colors or distinct icons; its SMART Preview hover/focus state swaps all four icons to the animated SMART renderer. All four level styles are persisted atomically as fractal-scoped overrides.

Goals are the core domain object. The app supports a 5-level hierarchy:

- `UltimateGoal`
- `LongTermGoal`
- `MidTermGoal`
- `ShortTermGoal`
- `ImmediateGoal`

Goal active/inactive status and contribution evidence:

- A goal renders as "active" when either the goal was created inside the root's `progress_settings.active_goal_window_days` window (default 7, max 90), or a completed activity instance linked to it (or a descendant) has an effective completion timestamp inside that window. Creation behaves as contribution evidence for the created goal, so a new goal is immediately active and naturally fades unless later activity refreshes its evidence. This is computed on demand, never stored.
- `services/goal_contribution.py` is the single chokepoint that decides whether an event at a given timestamp counts toward a goal. `resolve_contribution_goal(goal, timestamp)` excludes goals that are currently paused, goals completed *before* the event (so completing a goal stops accruing new evidence; pre-completion evidence still fades naturally as it ages out of the window), and events that occurred during any past pause window.
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
- ordered circuits with mixed set-based and non-set activity slots

Session activity placement contract:

- canonical section ordering lives in `attributes.session_data.sections[].items`, whose entries are typed as `{type: "activity", activity_instance_id}` or `{type: "circuit", circuit_run_id}`
- legacy `activity_ids`/embedded exercise shapes are accepted only at normalization boundaries and are projected for compatibility; new writes use typed items
- session/template duplication projects canonical runtime item IDs back to activity/circuit definition IDs through `services/session_structure.py`; runtime `items` are never copied as section metadata. This preserves mixed activity/circuit ordering, avoids flattening circuit-owned instances, and permits an owned source session or template to reuse archived definitions through an internal-only creation flag while ordinary creation continues rejecting archived definitions
- if a session has no section structure yet, adding to section `0` creates a default `Main` section
- removing an activity marks the instance deleted and removes its typed item; activity instances and circuit runs remain the canonical payload sources
- circuit definitions are reusable and soft-deleted, while each run snapshots its definition name, slot order, full metric/split schema, activity metadata, and source version so historical entry and display survive later metric renames, archival, definition edits, or circuit archival. Archived definitions can be instantiated only by the internal template-snapshot path; direct circuit-run requests cannot opt back into archived definitions, and restore rechecks both circuit-count and storage quotas.
- one circuit round represents one pass through all slots. A set-based slot uses one shared activity instance with a stable normalized `activity_set` per round; a non-set slot creates one activity instance per round
- circuit-run tags are logical, persisted scopes materialized onto every set-based slot's parent activity instance and every non-set round activity instance. New rounds inherit all active circuit-run scopes atomically, using the same setless-member-only target rule as the initial application, so a scope yields identical assignments whether a round existed when it was applied or was added later; inheritance also enforces the archived-name and storage-quota checks, rolling the new round back if either rejects
- round tags materialize directly onto each set result for set-based slots and each activity instance for setless slots. They do not duplicate circuit-run tags on sets because parent-instance tags already inherit hierarchically. The service creates a same-named activity-owned tag for each participating definition when missing, retains existing per-definition colors, rejects archived-name reuse, and preserves assignments that predated a removed scope. Scope-owned activity tags cannot be renamed or archived until the owning scopes are removed, and descendant assignment endpoints reject attempts to remove scope-owned tags
- circuit/round tag mutations lock the owning session, run, and canonical target rows in deterministic order, commit all definitions and assignments atomically, and invalidate session, activity, timeline, analytics, and progress consumers together
- circuit members consume the same dynamically calculated `progress_comparison` payload as ordinary activities on both Sessions summaries and Session Detail. Set-based slots select the comparison by the round's canonical set index, setless slots use their round-owned activity instance, excluded members are labelled without a delta, and metric edits/completion refresh the shared activity-instance and progress query families rather than maintaining a circuit-specific progress model
- editable circuit metrics and ordinary activity sets render the same shared metric-cascade control when the corresponding value in the immediately following set or round is empty. `POST /api/<root_id>/circuit-runs/<run_id>/members/<member_id>/metrics/cascade` locks the owned run and atomically copies the selected metric/split into matching empty members in all later rounds without overwriting entered results; zero is a valid source value
- completing a session atomically finalizes only work that has started: ordinary activities with a start time and active or paused circuits. Active timing stops at the session completion boundary, their circuit-owned activity results become completed, already completed work remains unchanged, and circuit completion events are emitted only after the transaction commits. Never-started activity instances remain incomplete and planned circuits remain planned. After a successful completion mutation, the client immediately applies that same state-based rule to activity and circuit caches and then refetches both authoritative collections, so every item control matches its persisted lifecycle
- set-based progress summaries calculate current additive totals, yield, and best-set values from the rendered set results so a lagging progress-comparison query cannot hide or stale the summary. Their totals, yield, and best-set facts share one compact, non-wrapping footer line. Additive and multiplicative flags are independent: a metric marked as both contributes an additive total, while multiplicative eligibility separately controls yield. Backend progress payloads remain the source for previous-instance deltas, active-view inclusion, and direct/setless aggregations
- ordinary activity exclusion messaging belongs to the progress-summary section alongside Total yield/Best set rather than the identity header. Setless or non-aggregatable activities retain an excluded-only summary row so raw metrics remain visible without losing cohort status
- narrow activity-instance and circuit cards use the card's inline-size container rather than viewport width to select one shared mobile hierarchy: identity and selected-card actions, timer metadata, lifecycle actions, then results. Tag assignments remain visible but read-only unless their exact owning scope is selected: activity for instance tags, set for direct-set tags, circuit for run tags, round for round tags, and member for circuit member or nested-set tags. A selected activity or circuit header places `+ Tag` immediately after Edit and Options and before assigned tags; the controls remain one vertically aligned action row on desktop and mobile. Selecting a parent never exposes mutation controls for all of its descendants. Timer metadata uses three columns when the card is at least 540px wide and one column below that; lifecycle actions use an auto-fitting minimum-width grid so two- and three-control states remain balanced and stack only when necessary. Metric units and progress move beneath their value input instead of occupying a clipping-prone fixed side track, progress summaries wrap, and circuit round/member controls retain compact header ownership
- editable activity-instance, set, circuit, and round tag controls share one actual-width overflow policy. Assigned tags remain individually removable while they fit; before they can overflow into activity identity, metrics, or timer controls, the list becomes one count badge (`N tags`) while the tag picker remains available for inspecting and changing every assignment. Both the count badge and picker control stay right-anchored as the available width changes, and top-level activity/circuit controls align with the timer-input row rather than its labels. Tag editors use a stable zero flex basis and an overflow-release margin so near-boundary measurements cannot oscillate between individual and summary rendering
- circuit cards remain expanded and expose no collapse/expand control; rounds, notes, and the add-round action remain visible subject only to progressive round rendering and permissions
- `session_work_intervals` is the exclusive work-time ledger for ordinary activity timers. Circuit children never create work intervals, and an active or paused circuit and an ordinary activity timer are mutually exclusive within a session
- the circuit run is the sole circuit timer owner (`time_start`, `time_stop`, paused duration, and `duration_seconds`). Rounds are structural containers only, while their members retain metric/set results with `ActivityInstance.time_start`, `time_stop`, and `duration_seconds` always `NULL`
- manual circuit timing is checked against ordinary work intervals and every other circuit range, including open ranges and the final range at completion, so relative adjustments cannot create double-counted work. Future boundaries are rejected before persistence. Because circuit runs currently retain aggregate paused duration rather than individual pause intervals, a run containing paused work must be reset before its timing boundaries can be changed.
- lifecycle mutations, including parent-session pause/resume, lock the owning session before circuit runs, matching ordinary timer lock order; member metric writes also lock the run to prevent lost updates
- definitions allow at most 50 slots and do not prescribe a round count. Every run starts with exactly one round; users explicitly add later rounds, up to 100 rounds and the 1,000 generated-result ceiling. Run creation revalidates stored definitions and estimates only the initial round's generated-row storage before writing
- PostgreSQL constraints mirror the service lifecycle contract: round maxima, chronological start/stop ordering, and planned/active/paused/completed timing fields cannot drift into contradictory combinations
- circuit pause/resume is owned solely by the parent session lifecycle; the obsolete standalone circuit pause/resume routes and client actions have been removed

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
- `services/circuit_service.py`
- `services/circuit_metric_service.py` (immutable activity-schema snapshots and identity-preserving nested metric reconciliation)
- `services/circuit_tag_operations.py` (atomic logical scopes, per-definition tag creation, materialization, removal provenance, and new-round inheritance)
- `services/circuit_session_items.py` (typed circuit placement/removal within session section JSON)
- `services/activity_set_service.py`
- `services/work_interval_service.py`
- `blueprints/sessions_api.py`
- `blueprints/timers_api.py`
- `blueprints/circuits_api.py`
- `models/circuit.py`

Key frontend pieces:

- `client/src/hooks/useSessionQueries.js`
- `client/src/hooks/useSessionDetailData.js`
- `client/src/hooks/useSessionDetailMutations.js`
- `client/src/hooks/useSessionDetailController.js`
- `client/src/hooks/useCircuitQueries.js`
- `client/src/contexts/ActiveSessionContext.jsx`
- `client/src/pages/Sessions.jsx`
- `client/src/pages/CreateSession.jsx`
- `client/src/pages/SessionDetail.jsx`
- `client/src/hooks/useSessionGoalsViewModel.js`
- `client/src/hooks/useSessionSidePaneViewModel.js`
- `client/src/components/sessionDetail/SessionGoalHierarchyPanel.jsx`
- `client/src/components/sessionDetail/TimelinePanel.jsx`
- `client/src/components/common/TimelineShell.jsx`
- `client/src/components/circuits/CircuitBuilderModal.jsx`
- `client/src/components/circuits/CircuitRunCard.jsx`
- `client/src/components/circuits/CircuitScopeTagEditor.jsx`

Session detail goal hierarchy contract:

- Session list/detail payloads expose `session_goals` as the canonical flat list of goals attached to a session across all levels.
- Session list/detail payloads expose `completed_goals` as the canonical list of goals completed by, target-completed by, or backward-compatibly completed during that session.
- `short_term_goals` and `immediate_goals` are retired and should not be reintroduced as competing session payload buckets.
- In the dedicated goals-view payload, `session_goal_ids` represent direct manual session links.
- Activity and activity-group associations define activity-derived scope.
- `GoalTreeService.get_session_goals_view_payload` returns the canonical session detail goal payload, including `activity_goal_ids_by_activity`, `session_activity_ids`, and a pruned goal tree containing the complete lineage for in-scope goals.
- The frontend should render from that canonical payload rather than rebuilding association scope from activity definition caches.
- The shared goal-hierarchy connector overlay coalesces `ResizeObserver`, window, and modal-transition notifications into at most one animation-frame measurement, observes only the list boundary, and normalizes subpixel coordinates before updating React state. This prevents connector layout from feeding back into an unbounded render/observer loop in goal-association and session-scope modals.
- Session detail supports one temporary activity-adder goal scope at a time: clicking a visible hierarchy goal icon toggles the shared scope for every section, while the goal name continues to open Goal Detail. The closed add action names the scoped goal in normal text color inside an orange-treated scope container. The scoped picker resolves effective activities through the canonical goal-activities endpoint (direct links, linked activity groups, descendant inheritance, and enabled parent inheritance), never through a parallel client-side inheritance resolver; its compact, single-line goal indicator lives beside the Activities / Activity Circuits toggle without a redundant label, while an unscoped browse-group title follows the toggle directly. Its Clear scope action is visually unboxed and changes to orange text on hover, avoiding a competing nested highlight. Activity pickers never expose Back at the root level; Back appears only after entering an activity group with a parent view to return to. Desktop header controls share a vertically centered control line. Scoped results flatten all matching definitions into the root list with group breadcrumbs on each card. Activity circuits remain eligible when any slot uses an effective activity; selecting one still adds the complete circuit. The scope persists across picker closes, section changes, and additions, and clears explicitly or when the session route changes.
- Session goal scope has two explicit provenance classes. `goal_ids` on session update replaces only `association_source="manual"` rows (omission preserves and an empty array clears), while activity-derived rows remain locked; completed sessions can still be corrected. The canonical session-goals view returns `manual_goal_ids` and live `automatic_goal_ids`, derives automatic scope from current activity instances through `services/effective_goal_activities.py`, and persists only explicit links while rendering their structural ancestors. Session Detail exposes `Adjust scope` through the shared hierarchy selector, whose locked selections and bulk controls emit manual IDs only. Connectors use strongest-wins lineage evidence: selected activity is temporary orange, any completed instance uses the FlowTree active-branch treatment (continuous blue base, soft double glow, and a low-contrast blue flow moving toward the root, with movement disabled for reduced motion), incomplete evidence is neutral solid, and manual-only scope is neutral dashed. Adding an activity awaits a refetch of this canonical view before resolving and typed section items participate in live membership, so a dashed manual lineage upgrades immediately even when the association is inherited; the client does not synthesize a competing direct-only association map. Session creation always presents Session Goals to the right of the required flow inside a centered, wide workspace, collapsing below it on narrower screens; the template column receives the larger desktop share and its responsive card grid uses the available horizontal space. Template identity rows are width-constrained and long template-name badges wrap within their cards instead of crossing card boundaries. It is optional and editable for normal templates, disabled until a template is selected, and read-only for quick templates. Completed goals are silently excluded on this page, with no redundant disabled filter control. Activity-derived locked goals use a compact accessible `*` marker instead of repeated provenance pills; its panel legend appears only when automatic goals exist. The bounded hierarchy scrolls independently and its compact control gutter fully accommodates the goal checkbox and both lineage controls. Normal-session creation uses one responsive action implementation: its template summary sits immediately beside the desktop PageHeader button, while mobile keeps the full Step 2 safe-area footer, with only one placement mounted at a time. Selecting a quick template instead opens a focus-trapped XL modal backed by the existing queued-session context and activity workspace; cancellation discards the draft, failed submissions retain it, and successful completion closes and resets the modal. The modal owns the only quick-completion action, uses balanced medium-height footer controls on desktop with touch-sized controls on mobile, and blocks dismissal while saving. The preview endpoint resolves normal-template activities and circuit slots with the same canonical direct, linked-group, descendant, enabled-parent, and program-restriction rules used during persistence; quick templates return no persisted goal scope. The obsolete create-session immediate-goal picker and embedded quick-session creation branch have been removed.
- Session Detail keeps one session-data autosave queue for the lifetime of the route identity. Provider rerenders and mutation-status updates retain a stable save callback, so they cannot reset the queue's last-saved fingerprint or resubmit an unchanged draft. Initial server data seeds the fingerprint without saving, later edits remain debounced and serialized, and the fixed save-status indicator is vertically offset from the environment badge. Its Information summary presents linked program, block, and program-day identity together on one compact line, using the current program and block colors; template identity appears once as the panel title instead of repeating in expanded metadata. Sessions, ordinary activity instances, quick activity instances, and circuit runs share one canonical completion control: unfinished actions are filled green `✓ Complete` controls and completed states are green outlined `Completed` controls with the circular completion-check badge from Sessions cards. Activity and circuit timer controls reserve the same compact width for Start, Reset, and both completion states; after completion, Reset occupies Start's first slot and Completed remains in the second completion slot. Decorative badge instances are excluded from the accessibility tree so their surrounding control or status supplies one concise name. Session completion state reads the canonical top-level `completed` column with `attributes.completed` only as a fallback, and an activity instance renders as completed whenever `completed` is set, so instances finished by the session-completion cascade (which leaves `time_stop` null) no longer present a live timer. The canonical session serializer includes day number/date and falls back to the creation-time `program_context` snapshot when a legacy session lacks its relational program-day link.
- The global navigation session action renders from the root-scoped active-session query and treats that query's root as authoritative when a compatible payload omits the redundant `root_id`. While Session Detail is open, it shares the canonical session-detail query as a temporary fallback if the active-session result is unavailable, but only for an explicitly unfinished session; completed detail sessions retain the `+ ADD SESSION` action. Running and paused sessions therefore keep their `SESSION IN PROGRESS` / `SESSION PAUSED` labels and link back to the current session without maintaining a competing client-side session state.
- Ordinary activity timing uses `session_work_intervals` as the canonical accrual ledger while `ActivityInstance.time_start` / `time_stop` represent the logical timer lifecycle. Pausing a session closes the current accrual segment but retains a null logical stop and marks the activity paused; resuming opens a new segment, clears legacy stale stop markers, and makes the same activity visibly active again. Session-activity reads also project an open interval as `time_stop: null`, repairing presentation for already-affected rows without rewriting history. Removing a running activity closes its open interval before soft deletion. Genuine timer conflicts name the active activity when available and expose one inline `Complete it and switch` action in a non-layout-shifting overlay aligned to the activity card's right-side action stack. The notice has a dedicated dismiss control and automatically fades after ten seconds before clearing. Its switch action atomically closes and completes the displaced ordinary activity, starts the requested timer under the session lock, runs ordinary completion bookkeeping, and returns both activity records so the client replaces both cache entries without presenting concurrent timers. Expected conflicts remain inline and do not also raise a redundant error toast.
- On mobile Create Session, Session Goals is collapsed by default and exposed through an accessible page-header disclosure as the standard focus-trapped bottom-sheet sidebar card, with backdrop/Escape/close-button dismissal and independently scrolling selector content; desktop keeps the selector permanently visible. The compact hierarchy reserves its control gutter from the shared checkbox-plus-lineage width token at every breakpoint, so direct-selection checkboxes—including checked, locked automatic goals—remain visible beside both lineage controls. The sticky mobile creation action omits step numbering and uses a compact template badge with a standard-height, touch-safe Create Session button.

### Notes

Notes are now a first-class cross-cutting domain area rather than just a session subfeature.

They support:

- root/fractal notes
- goal notes, including descendant goal views
- session and activity-instance notes
- image notes
- pinning and timeline-style browsing

The goal detail Notes tab queries `GET /api/<root_id>/goals/<goal_id>/notes` and exposes three compact filters: `Goal Notes`, `Activity Instance Notes`, and `Include Children Data`. The children-data toggle expands the goal-id scope for both note types; the type checkboxes map to `include_goal_notes` and `include_activity_instance_notes` query params so the backend filters before serialization. Activity-instance notes are resolved from activity instances whose activity definition is associated to the scoped goals directly or through activity-group associations; legacy notes with a populated `goal_id` still count.

Timeline and notes feeds use the shared `SessionTemplateNameBadge` atom for session/template names. Feed surfaces pass the session template name and color when available and render the badge at the compact `feed` size so activity timeline cards and note headers match session-template styling without overwhelming the feed. The Notes page and goal-detail Notes tab opt into the shared continuous timeline presentation: notes remain date-grouped, consecutive notes with the same `session_id` share one session header/container, standalone notes remain individual timeline entries, and note rows use subtle inset dividers instead of card chrome. Date-group headers always include the year (relative groups retain `Today`/`Yesterday` alongside their full calendar date); because that header establishes the day, individual rows in this presentation show only their local time, while legacy or ungrouped feeds retain self-contained date-and-time metadata. Semantic note kinds qualify the primary note name instead of repeating as metadata or context—for example, goal completion notes render in `Goal Completion: <goal icon> <goal name>` order; ordinary goal notes retain name-then-icon order. Timeline note headers use a constrained context/metadata grid and switch to stacked metadata based on the note container width (rather than only the browser viewport), preventing collisions inside the goal-detail modal; the presentation also caps desktop video previews while leaving the session-detail activity-note presentation unchanged. Session-template name chips across manage templates, create-session flows, sessions, session detail, timelines, and notes should use this atom; its shared shape is a squared rounded rectangle rather than a pill. For linked sessions, presentation metadata—including the dedicated session-detail Activity Timeline history payload—resolves the current color from the session template before the historical session snapshot, so changing a template's styling on Manage Session Templates immediately stays consistent across session lists, detail views, activity timelines, goal timelines, and note feeds. A snapshot color remains the fallback for sessions whose source template is unavailable.

Goal lifecycle timeline rows render goal icons through `GoalIcon` and should resolve icon shape, primary color, secondary color, and SMART detailing from the freshest available goal style. The backend timeline service serializes lifecycle goal payloads with effective level styling using the same system → user-global → root-specific override precedence as goal-level APIs, and marks those payloads with `level_style_source: effective`. For the currently open goal, the frontend can still prefer the modal goal object, including `level`, `level_characteristics`, `attributes.level`, or `attributes.level_characteristics`.

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

The shared activity builder keeps its create/save actions in a persistent footer while the form body scrolls, and reflects the in-progress activity name in its header. Activity groups are selected before direct goal associations: choosing a group merges its linked goals into the activity draft, and the same selector can open the canonical group builder, automatically select the newly created group, and retain the unfinished activity. Activity creation launched from a Goal Details Activities picker seeds that goal as a visible direct association, preserves any additional goal selections, and persists the association in the activity-create request; the post-create hook only retains a compatibility repair for callers or older responses that do not confirm it. The shared form awaits entry-point post-create work before one canonical close transition, so the Activities view cannot return before its association cache is synchronized. Inline fractal-metric creation uses the canonical additive, multiplicative, trend-direction, and integer/decimal/duration input-type semantics instead of a name/unit-only shortcut; its compact, cancellable creator stays beneath the metric row that opened it and fills that exact slot on success. These behaviors are shared by Manage Activities and the Goal Details activity-creation flow. In the Manage Metrics library, selecting a metric card loads its values into the right-hand editor; cards keep only the distinct Copy and Delete actions, and changes remain explicit through Save Changes.

Manage Activities has two mutually exclusive catalogue views, selected with the shared header `ViewToggleTabs`: Activities and Activity Circuits. Each view retains the shared nested activity-group hierarchy, ungrouped section, collapse controls, and view-scoped search, but never mixes activity and circuit cards in the same result grid. All header controls—including the segmented view toggle, search field, Collapse All, Manage Metrics, and Create trigger—share the existing Create-button height contract at desktop and mobile breakpoints. The former three create buttons are replaced by one `+ Create` header menu, built from the shared dropdown primitive, that routes to the existing Activity, Activity Group, or Activity Circuit builder; successful circuit creation switches directly to the Activity Circuits view. Circuit definitions carry an optional validated `group_id`; deleting a group safely moves both activities and circuits to Ungrouped. Circuit and activity catalogue cards share the same usage-metadata presentation for instance count, last-used date, and average completed duration, plus the same Duplicate/Delete action treatment. Circuit duplication opens a prefilled create flow and leaves the source untouched; deletion is a soft archive so historical runs and template snapshots remain intact. Circuit usage summaries are computed in one grouped query over non-deleted sessions rather than per-card requests. Catalogue cards show every member in explicit top-to-bottom order using the same shared compact circuit-activity card as the builder, preserving duplicates instead of truncating the sequence into pills. The builder configures name, description, activity group, and ordered activity slots; its create, copy, and edit modal header appends the live trimmed draft name using the same action-name pattern as the activity builder. Round count is intentionally absent because execution volume belongs to each run. It reuses the session-detail `ActivitySelectorPanel` for searchable hierarchical activity selection and displays its ordered slots as vertically stacked, name-only activity cards, with the shared template move/remove controls positioned outside each card on the right. In session-template and session-detail builders, circuits enter through the ordinary Add Activity picker and render/count like other activity items; neither surface has a dedicated circuit lane. Session detail renders a circuit run as a compact parent container: each round and member uses the shared selectable `SessionItemCard` state, member cards fill the round without a legacy left indent, and selecting a set-based member focuses only its exact round-specific set. Each member's metric result is rendered as a numbered row using the ordinary activity-set layout primitives, including the same split groups, labels, inputs, units, wrapping, and responsive behavior. Metric updates target that exact round occurrence and persist through canonical `MetricValue` rows: set-based members use their round-specific `ActivitySet`, while non-set members use their round-specific `ActivityInstance`; circuit run serialization returns the same values and ordinary activity progress and analytics consume them without a circuit-only metric store. Every instantiated run starts with one round. Each round card has the shared collection-removal X, and the expanded circuit ends with the shared full-width add-item action for explicitly appending each subsequent round. Adding a round atomically creates one aligned result per slot, respects activity-instance and storage quotas, preserves completed child state when the circuit was already complete, and remains blocked once the session is complete. Removing a round deletes its generated set/instance results, renumbers later rounds and aligned sets, and cannot remove the final round. Both operations remain available after the circuit starts or completes while its parent session is unfinished. Only the circuit container exposes Start, Pause/Resume, Complete, and duration controls; completed run timing is immutable, and rounds and members expose no lifecycle or timer controls or timing fields. Completing the circuit marks generated child results complete while explicitly retaining null child start, stop, and duration values. The top-right X matches activity-instance removal and removes the typed session item plus its generated activity instances. Typed circuit serialization remains the internal execution contract, and execution and historical data continue through the canonical circuit APIs and session views.

The Sessions catalogue consumes those same hydrated typed section items instead of rebuilding sections from activity IDs. Expanded session cards preserve mixed activity/circuit order and render circuits through a read-only compact work summary that reuses the canonical Sessions `ActivityCard` shell, lifecycle badge, metadata/title hierarchy, duration treatment, set rail, and metric label/value styling. Each round is a set-like group containing `round.member` coordinates and stacked member content: the activity name is followed directly underneath by its persisted metric values and units, matching ordinary activity-card reading order rather than presenting metrics as a separate table column. Metrics resolve from the circuit member projection first and fall back to the member's canonical `ActivitySet` or non-set `ActivityInstance`, keeping older or partially hydrated list payloads visible without creating a competing metric store. Circuit duration contributes to the section’s actual duration while the legacy activity-only section fallback remains supported.

Circuit round structure remains editable throughout an unfinished parent session. Active and completed circuit runs may append or remove rounds; generated results follow the run's current completion state, removed-round notes/results are cleaned up, and completed parent sessions remain the final immutability boundary. Timing remains adjustable through the compact relative-time controls when the parent session permits it.

The Activity Circuits catalogue prunes group branches with no circuits while retaining populated groups and any ancestors required to preserve their nested hierarchy. Its ungrouped cards always sit beneath an explicit `Ungrouped Activity Circuits` heading, including when no grouped circuit branch exists. The Activities catalogue continues to expose every group for organization.

Session detail's Add Activity selector opts into the same Activities / Activity Circuits toggle as its sole root-level heading; actual activity-group names still appear while browsing within a group. The current group is rendered once as the heading, while the optional subtitle contains only its parent breadcrumb rather than repeating the current group name. On desktop, the selected group title block is vertically centered beside the definition-type toggle; the narrow layout retains the existing stacked, left-aligned treatment. The toggle matches the compact shared Back `Button` atom's height, including its coarse-pointer touch target, and the close action remains the shared `CloseButton`. The two modes receive separate definition collections, action labels, and copy-mode guidance: circuit mode exposes every available grouped or ungrouped circuit with circuit-specific group counts, search, section headings, empty states, and create/copy actions. Creating a blank circuit or copying an existing definition opens the shared circuit builder, then creates and immediately adds the resulting circuit to the originating session section. Circuit copies use the same canonical detached-draft preparation as the Manage Activities catalogue, retain their group and ordered duplicate slots, and never reuse definition, version, or slot identities. Definition creation and session insertion are tracked as distinct persistence steps: if insertion fails after the definition succeeds, the persisted draft is locked and the retry action only retries insertion, preventing duplicate definitions. Each selectable circuit card reports its member-activity count with singular/plural metadata and previews its slots as a compact ordered list, using the definition snapshot's activity name and optional description so users can inspect the circuit before adding it. Other `ActivitySelectorPanel` consumers stay activity-only unless they explicitly provide circuit creation callbacks.

Activity metrics now use fractal-level metric definitions as the user-facing configuration source:

- Regular activity-set autosaves omit blank metric placeholders, and normalized backend set persistence treats blank or null metric cells as absent values while continuing to validate every nonblank value. This allows a user to create an empty first or subsequent set and enter its metrics afterward without a failed save.

- session metric inputs honor metric input type, default value, predefined allowed values, and min/max bounds
- predefined values render as constrained session input options with helper text, not optional quick-pick buttons
- metric definition validation prevents conflicting default/min/max/predefined value settings
- duration metrics are entered as `MM:SS` but stored numerically as seconds for progress calculations
- yield behavior is driven by metric-level `is_multiplicative` flags, not the legacy activity-level `metrics_multiplicative` switch; the UI calls the calculated product of two or more multiplicative metrics "Yield," and yield is only valid when every tracked metric for the activity is multiplicative

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

- on-demand comparisons over canonical activity instances, normalized sets, and metric values; no progress snapshot table or recomputation workflow remains
- activity-owned tags assigned directly to instances or sets; instance tags are inherited by every set at calculation time and are never copied
- direct tags are visible on session cards, session-detail timeline rows, quick-session cards, and circuit work summaries; interactive circuit members expose the same activity-owned instance/set tag editor as standalone work; instance tags render once at the parent level and set rows show direct set tags only after their metrics
- any number of named, versioned saved progress views per activity using structured `All of` / `Any of` / `None of` tag predicates
- one activity-wide active saved view, with an implicit immutable **All History** view represented by a null active pointer
- server-calculated inline draft previews that never mutate the active view; Save as creates and activates a new view, and deleting the active view atomically falls back to All History
- optimistic version checks protect both saved-view edits and rapid instance/set assignment replacement; conflicts preserve the local draft and offer reload or Save as recovery
- a collapsed-by-default timeline view control that expands into an incremental predicate editor; `All of`, `Any of`, and `None of` operators are added or removed individually instead of rendering empty buckets
- explicit excluded-current comparisons with no deltas, while raw instance metrics and muted timeline rows remain visible
- canonical effective-time ordering with ID tie-breaking and the rule that a predecessor comes from another session
- live comparison hints while a session is still in progress, filtered by the same active view as completed history
- activity-level and metric-level aggregation configuration
- root-level progress enablement and percent/absolute display settings
- a consolidated activity timeline contract plus dynamically calculated compatibility APIs for instance progress, activity history, and session summaries

Archived tags retain their historical assignments and saved-view meaning. They can be retained on an existing assignment but cannot be newly assigned, and may be restored from tag management. Session list/detail, circuits, and `activities:metricProgress` receive the same active-view comparison payload. Timeline history uses offset-based incremental loading; calculation filters and counts in SQL, fetches lightweight identities for ordering, and eager-loads only the visible page plus required predecessors. Session summaries batch target activities instead of issuing per-instance comparison queries.

Key backend pieces:

- `services/progress_service.py`
- `services/activity_progress_view_service.py`
- `blueprints/activities_api.py`
- `blueprints/sessions_api.py`
- `models/activity.py` (`ActivityTag`, tag junctions, `ActivityProgressView`, and the activity active-view pointer)

Key frontend pieces:

- `client/src/hooks/useProgressComparison.js`
- `client/src/hooks/useActivityProgressViews.js`
- `client/src/hooks/useRootProgressSettings.js`
- `client/src/components/sessionDetail/SessionActivityItem.jsx`
- `client/src/components/sessionDetail/SessionActivityItemView.jsx`
- `client/src/components/sessionDetail/TimelinePanel.jsx`
- `client/src/components/sessionDetail/ActivityTagEditor.jsx`
- `client/src/components/modals/ManageActivityTagsModal.jsx`
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
- `client/src/pages/Logs.jsx`

Session analytics note:

- Session trend analytics are consolidated under `sessions:sessionTrends`, a bar chart with configurable day/week/month/year grain and optional session count and summed duration metrics. Retired duration trend, weekly chart, consistency, activity heatmap, completion rate, and planned-vs-actual panel ids are migrated to this visualization.
- Session start/end time distribution supports optional start and end markers, and the session duration histogram supports configurable bucket counts.

Activity analytics note:

- Activity trend analytics are consolidated under `activities:activityTrends`, a mixed chart where completed activity instances render as bars and activity duration renders as a line on a separate y-axis.
- Activity totals live under `activities:activityFrequency` and can switch between completed instance counts and duration. Retired line graph, time-per-activity, personal-best, and metric-volume panel ids are migrated to the consolidated activity visualizations.
- Individual activity metric analytics include `activities:metricTrends`, which plots up to two selected activity metrics as lines over time, and `activities:metricProgress`, which renders active-view dynamic percent-improvement bars for progress-tracked metrics.
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
- `planning/`: active implementation plans, design explorations, and readiness audits, including the circuit execution architecture at `planning/circuit-activity-architecture.md`, `planning/beta-readiness-2026-07.md`, `planning/beta-readiness-findings-2026-07.md`, and the independent 32-concept basic/SMART icon workbench at `planning/goal-icon-concept-lab-2026-07.html`

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
- lint: ESLint; the checked-in source currently passes the strict `npm run lint -- --max-warnings 0` gate. Responsive media-query hooks subscribe through React's `useSyncExternalStore`, and effects that intentionally implement cross-record/modal/autosave state transitions carry narrow, documented rule exceptions rather than weakening the global ruleset.
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

## Mobile Header Overlay Contract

The shared anchored-overlay positioner keeps portalled controls inside the mobile viewport and aligned through nested scrolling or resizing. Manage Activities uses it for the `+ Create` dropdown so `PageHeader` cannot clip the menu; session-detail activity, set, circuit, and round tag pickers use the same boundary so narrow work cards cannot clip the tag creator. Outside-pointer dismissal, focus containment, and Escape focus restoration remain part of each overlay contract.

## Activity Circuit Interaction Contract

Session activity circuits are mixed section items and intentionally follow the same top-level interaction contract as regular activity instances. The circuit container owns selection, ordering, start/complete timing controls, definition editing, instance options, and removal. Circuit and regular activity headers both use the shared icon-only `RemoveButton`: its X is muted at rest, turns red on hover, and never gains filled destructive-button chrome. Circuit-run deletion, round removal, and circuit-builder slot removal all use that atom rather than composing one-off danger buttons from a raw X icon; local circuit CSS only positions the atom where necessary. The circuit header reuses the regular activity timer primitives and field styling to show synchronized Start, Stop, and Duration metadata beside the lifecycle actions. These fields reflect the parent circuit clock. Lifecycle actions now mirror ordinary activities instead of maintaining a competing disabled-button state machine: planned circuits show Start and Complete, active circuits show Complete and Reset, and completed circuits show the Completed badge and an enabled Reset action. A circuit paused through the parent session displays Paused plus Complete and Reset; resuming the parent session resumes its circuit, so there is no competing per-circuit Resume action. Selecting an unpaused circuit exposes the shared `±` relative-time adjustment control beside populated Start and Stop fields; circuit and ordinary activity adjustments use the same null-safe range validator, wait for persistence before closing, and retain inline server errors. Adjustments use the canonical circuit timing mutation and recalculate duration without adding child timers; runs with paused history require Reset because aggregate pause duration cannot be safely redistributed across corrected boundaries. Completed parent sessions disable lifecycle changes while still preserving their visible state. The compact header metadata identifies the item as a circuit and reports its round count without repeating lifecycle state text already communicated by its controls and styling. Its rounds and members remain compact nested result containers; member indexes are round/activity coordinates (`1.1`, `1.2`, then `2.1`, `2.2`) rather than descendants of the circuit's session position. Member activity titles are plain content rather than nested buttons, and member metrics use the shared set-style editor without rendering a second, redundant set-row index inside the already indexed member. Expanded circuits append rounds through the same shared full-width add-item control used for adding session activities, while each round retains its shared removal control. Those structural controls remain available whether the circuit is planned, active, or completed and lock only when the parent session completes. Circuit timing exists only on the parent run, while nested activity instances keep null start/stop/duration values. Instantiated runs inherit their initial round count from the definition; the former expanded history-correction UI remains removed in favor of the compact shared relative adjustment.

Circuit selection is keyboard-operable at the run, round, and member levels with visible shared focus/selection styling. On narrow screens, each member uses a fixed compact coordinate rail plus a flexible name column so long names retain the available width. Interactive authoring is capped at 100 rounds, 50 slots, and 1,000 generated results; the expanded circuit progressively renders rounds in groups of ten to bound DOM cost without hiding stored work. Circuit definition edits lock the definition row before evaluating the optimistic version, while run creation/deletion, timer actions, and round mutation use one session-first lock order. Definition growth and added rounds both pass incremental storage checks, and restore/add/remove operations emit explicit domain events. The backend is decomposed into definition, round, timing, metric, session-item, and coordinating services so timer ownership and structural mutation rules have one implementation each. Dedicated circuit-history/trend endpoints were removed: historical circuit work is presented through Sessions/session detail and remains queryable through the governed analytics catalog. Quick-entry sessions intentionally remain activity-only because they atomically create and complete work without an interactive circuit lifecycle; standard sessions and templates provide the complete circuit workflow.

Circuit notes use the existing canonical note store rather than a parallel circuit-note implementation. The quick-note bar sits at the bottom of the expanded circuit immediately before Add Round and follows the circuit selection: the run uses `circuit_run`, a selected round uses `circuit_round`, a selected non-set member uses its `activity_instance`, and a selected set-backed member uses that same activity instance plus the actual `activity_set_id`. Selection changes only the destination for the next note: every note belonging to the circuit remains visible in one circuit-wide feed, annotated with its circuit, round, member index, activity, and set scope. This means a circuit round that represents an activity set produces a real set note and carries through every existing set-note surface. The bar and timeline reuse the regular session activity note components, while note creation continues through the session-notes query mutation and cache. Context validation requires circuit runs and rounds to belong to the supplied fractal/session, and deleting a circuit or round soft-deletes notes whose canonical circuit target was removed instead of leaving orphaned generic contexts.
