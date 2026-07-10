# UX Facelift + First-Run Onboarding

## Adversarial audit (implementation pass, 2026-07-09)

The direction is sound, but the original plan over-couples a visual migration, a new state machine, seven product journeys, telemetry, and navigation changes. Shipping all of that behind one flag would make failures hard to isolate and would delay the one correction that immediately affects every new user: removing the template dead-end.

Corrections applied to the plan:

- Treat activation facts as server/domain facts, not as durable client checklist state. Query-cache-only derivation is opportunistic and cannot be the canonical record because unloaded or evicted queries look indistinguishable from incomplete steps.
- Do not accept last-write-wins for onboarding preferences. The current shallow preference merge is safe only for a single full onboarding blob writer. Before a persistent checklist ships, add a namespaced server operation or optimistic concurrency/version check so concurrent tabs and Settings writes cannot erase manual visits or hint dismissals.
- Separate recovery from onboarding flags. Starter-template seeding and the empty-fractal recovery CTA are product correctness fixes and remain available when onboarding is disabled.
- Emit the seeded-template domain event only after the encompassing fractal transaction commits. Emitting before commit would expose rolled-back entities to event consumers.
- Roll out in vertical slices with explicit activation measurements. A default-off flag without an enablement cohort and baseline cannot validate onboarding effectiveness.
- Keep contextual hints anchored to stable semantic actions, not DOM layout. Coachmarks on frequently changing graph controls are brittle and impose a hidden regression burden.
- Replace the single broad “S+” verification claim with per-slice accessibility, data consistency, responsive, and rollback checks. Screenshot comparison alone cannot validate keyboard flow, async recovery, or concurrency.

### Implemented foundation

- Atomic, quota-aware `Simple Empty Template` seeding for new fractals.
- One-click starter-template recovery and immediate selection in Create Session for existing empty fractals.
- Direct navigation from successful fractal creation to its goal tree.
- `onboarding_v1` feature-flag definition and onboarding telemetry allowlist.
- Motion, tint, layering, and layout design tokens; all radius/accent call sites now use canonical names and no compatibility aliases remain.
- Removed the Analytics debug-red outline in favor of a semantic debug outline.
- Integration coverage for seeded template shape, plus focused Selection/TemplatePicker tests and a production frontend build.

### Full execution status (2026-07-09)

Implemented:

- Revisioned `GET/PATCH /api/auth/onboarding` contract with stale-write conflicts returning the current state.
- Server-derived completion for fractal, child goal, SMART goal, activity metric, completed session, and program creation; client persistence is limited to presentation/manual visit state.
- Returning-user grandfathering, welcome state, persistent responsive checklist, deep links, dismiss/resume/restart, contextual starter-template hint, Analytics/Notes visit completion, onboarding telemetry, first-session celebration, and reduced-motion-safe evidence highlight.
- Mobile bottom navigation with safe-area spacing and 48px targets; neutral exit styling, active indicator, and focus-visible treatment.
- Canonical radius and brand token migration with zero remaining legacy references; semantic tint/motion/z-index/layout tokens; pre-hydration theme resolution and OS theme listener; canonical modal animation.
- Teaching empty states on FlowTree, Manage Activities, Programs, Selection, and the Create Session template dead-end.
- Undefined global design-token regression gate in the maintainability audit.
- Full frontend verification: 170 files / 800 tests pass, ESLint passes, and the production build passes.

Final verification after the Sessions badge and modal-accessibility follow-ups: 171 frontend test files / 802 tests pass. ESLint, production build, responsive audit, maintainability audit, `git diff --check`, focused onboarding/auth/fractal/template database tests, and the 54-test auth integration suite pass.

Additional completed production work:

- Settings is migrated to `atoms/Modal`; its bespoke overlay, mobile/desktop modal shells, close control, and three local animations were deleted.
- `App.css` is 723 lines (down from 1,470). Its one non-competing companion stylesheet owns the extracted shell/navigation/session compatibility rules, and the responsive audit follows that boundary.
- Contextual hints now anchor to the root add-goal action, activity metrics, starter template, and program goal/rhythm setup. Hints are independently persistent and non-trapping.
- Evidence celebration targets only nodes that actually have evidence; reduced-motion users receive a static highlight.
- The maintainability gate is green and now ratchets undefined global tokens, bespoke overlay files, raw motion literals, inline styles, raw controls, badge selectors, imports, and per-file sizes. Stale starting-size baselines were corrected to measured no-growth caps rather than silently ignored.
- Long session-template names no longer clip on Sessions cards. Shared badge sizing now permits flex shrink and multiline height, and expanded session titles provide a min-width-zero 100% wrapping context. The responsive audit protects those constraints.
- The canonical Modal now traps keyboard focus, restores the previously focused element, and has direct regression coverage. SMART editing includes a live collapsible 5-criterion guide, while Analytics and Notes teach new users what appears after the first recorded session.
- Follow-up regression fix: Modal lifecycle effects depend only on actual open/close state, while changing close callbacks are synchronized through refs. Controlled confirmation fields therefore retain focus across every keystroke instead of returning focus to the close button; a rerender-per-character test protects the fractal deletion flow.

Repository-wide structural debt recorded by the final audit:

- Several pre-existing coordinators remain large. Each now has an explicit measured no-growth cap, while new onboarding code is decomposed by responsibility. Reducing those caps is follow-on repository decomposition, not hidden acceptance debt in this implementation.
- Nine specialized overlay files remain under a no-growth gate; the five high-traffic overlays named by this plan all compose `atoms/Modal`, including the newly migrated Settings surface.
- Full backend wrapper verification requires local PostgreSQL access. Focused database-backed onboarding/fractal tests and the complete auth suite passed; the sandbox rejected the full wrapper's database connection escalation.

### Release controls for the checklist

1. Keep `onboarding_v1` disabled until the intended cohort and baseline observation window are selected.
2. Enable progressively and compare the new onboarding telemetry events with domain activation events.
3. Roll back by disabling the flag; starter-template correctness and the empty-template recovery remain available independently.

> The execution record and adversarial corrections above are canonical. The original proposal below is retained as design history; where it mentions shallow preference writes or cache-derived truth, the revisioned onboarding endpoint and server-derived activation summary supersede it.

## Context

Fractal Goals is a powerful but complex app with **zero onboarding**: a new user signs up, logs in manually, and lands on a bare Selection page with only a "+ New Fractal" card. A new fractal is a single childless root goal — no templates, activities, or metrics — and the create-session flow **hard dead-ends** with zero templates (it requires one). Meanwhile the authenticated app sits visually a full tier below the polished landing page, including **live rendering bugs**: 58 uses of undefined `--radius-*` tokens (square corners) and an undefined `--color-accent` (Notes renders in off-brand `#6c8ebf`).

**Goal**: bring the app to a high B2C SaaS bar ("refined focus tool" — calm, premium, Linear/Things-like, extending the landing's quality) and build a guided-journey + checklist onboarding that walks a new user through goals (SMART) → activities/metrics → first session (from a seeded **Simple Empty Template**) → programs → analytics/notes.

**Confirmed decisions**: audience = deliberate-practice enthusiasts · aesthetic = refined focus tool · mechanism = welcome moment + persistent dismissible Getting Started checklist deep-linking into real flows + contextual hints · seeding = Simple Empty Template only (no demo goals/activities) · aha moment = first completed session lighting up goal evidence in the tree.

**Key leverage found in exploration**: SMART scoring **already exists** (`client/src/utils/smartHelpers.js`, `SMARTIndicator.jsx`, live recalc in GoalDetailModal) — onboarding guides users to the 5 fields, no new scoring. `EmptyState` atom exists but is under-used. `User.preferences` JSON blob + `PATCH /api/auth/preferences` (shallow-merge) is the natural home for onboarding state.

## Baseline Grades Before Implementation (F → S)

| Area | Grade | Why |
|---|---|---|
| First-run onboarding | **F** | Doesn't exist; CreateSession dead-ends from zero |
| Empty states | **D** | Terse mechanical copy; inconsistent EmptyState adoption |
| Design tokens | **C+** | Good foundation; undefined `--radius-*`/`--color-accent`/Badge tint tokens are live bugs; light theme duplicated; no motion/z-index/tint tokens |
| Modal system | **C** | Strong Modal atom (27 importers) vs 24 bespoke overlays, z-index 900→9999 |
| App shell / nav | **C−** | Global App.css (1470 lines), danger-red home link, no mobile bottom nav |
| Selection (front door) | **C−** | Inline-styled, no zero-state, no post-create navigation |
| FractalGoals / FlowTree | **C** | Global non-module CSS, least token-migrated core surface |
| Notes | **D+** | 17 hardcoded hex + off-brand accent fallback |
| ManageActivities / Programs | **C** | Inline styles, hand-rolled empties, 1122-line page |
| Sessions / SessionDetail / Analytics | **B−/B** | Best pages; Analytics has a leftover `4px solid red` debug class |
| Motion | **C** | No shared motion language; each modal invents its own |
| Telemetry funnel | **D** | Only `page_view` + `settings_opened`; no activation visibility |

**Path to S+**: S = landing-page quality everywhere (one token vocabulary incl. motion/elevation/tints, zero undefined references, one modal system, teaching empty states, restrained consistent motion). **S+** adds what a static facelift can't: a product that teaches itself — data-derived checklist progress (not fake tour state), contextual hints inside real flows, the seeded template removing the product's only hard dead-end, a designed first-evidence celebration, a measurable activation funnel in existing telemetry, and regression-proofing via ratcheted maintainability-audit budgets (incl. a new undefined-token check that makes this bug class impossible).

---

## Workstream A — UX Facelift

### A1. Token repairs + new token systems (first; everything builds on it)

1. **Fix undefined tokens** (mechanical, big visual win):
   - `--radius-sm/md/lg/xl` → `--border-radius-*` (canonical name, no aliases) across 10 module CSS files: `GoalDetailModal`, `ActivityCard`, `ManageActivities`, `Selection`, `ProgramBlockView`, `ActivityPicker(+Modal)`, `ActivityAssociator`, `GoalTimelineView`, `TargetAnalyticsModal`.
   - `--color-accent` → `--color-brand-primary` (or correct semantic token) in `Notes.module.css`, `NoteCard`, `NoteComposer`, `GoalTreePicker`, `ChartJSWrapper.jsx`, `Selection`, `Admin`.
2. **New tokens** in `client/src/design-tokens.css`:
   - Soft tints via `color-mix` (auto light/dark parity): `--color-brand-{primary,success,danger,warning,accent}-soft/-muted`, `--color-bg-selected` (defines the tokens Badge already references; `--color-brand-accent` = existing violet `--color-mode-splits`).
   - Motion: `--duration-fast: 120ms / -base: 200ms / -slow: 320ms`; `--ease-standard / --ease-out / --ease-emphasized`.
   - Z-index scale preserving current relative order: `--z-nav: 100`, `--z-dropdown: 500`, `--z-sheet: 900`, `--z-modal: 1000`, `--z-modal-2: 2000`, `--z-modal-3: 3300`, `--z-modal-4: 3500`, `--z-toast: 4000`, `--z-tooltip: 4500`.
   - Layout constants: `--panel-width-details: 390px`, `--surface-grid-size: 20px`, `--sheet-radius`.
3. **De-duplicate light theme**: `ThemeContext` resolves "system" to an explicit `data-theme` attribute (matchMedia listener); delete the duplicated `@media (prefers-color-scheme: light)` block. Guard against FOUC with a pre-hydration inline script in `client/index.html` if flash observed.
4. Update `atoms/Badge.module.css` to drop divergent rgba fallbacks.

### A2. App shell / nav

- Extract nav styles from `App.css` into module CSS; tokenize; `--z-nav`.
- Home link: neutral → brand hover (not danger-red). Active route: brand text + indicator bar; `focus-visible` with offset (landing pattern).
- Mobile: proper fixed bottom nav bar (safe-area, 44px targets) for primary sections — contained change in the Navigation component inside `AppRouter.jsx`.
- Shrink `App.css` (1470 lines) as pages migrate; target < 800.

### A3. Modal consolidation

Migrate bespoke overlays onto `atoms/Modal.jsx` in traffic order: **SettingsModal → AuthModal → GoalModal → ProgramBuilder → TemplateBuilderModal**. Map z-indexes to the new scale; delete local backdrop/scaleIn CSS. `Modal.module.css` gets the single canonical enter animation (fade + 4px rise, `--duration-base --ease-emphasized`, reduced-motion safe). Remaining ~19 overlays convert during page passes.

### A4. Page-by-page facelift (priority order)

Per-page checklist: kill inline styles · adopt atoms · tokenize · `EmptyState` with intentional teaching copy · `focus-visible` · page-header rhythm (generous spacing, muted subcopy).

1. **Selection** — front door + onboarding welcome surface. Remove inline styles; card hover-lift; dashed "+ New Fractal" affordance; zero-fractal hero (B, step 0).
2. **Notes** — 17 hex → tokens; accent → brand.
3. **FractalGoals / FlowTree** — start migrating `FlowTree.css`/`FractalGoals.css` to modules (split to respect 450/800 size caps); upgrade "No active goals exist" → `EmptyState` with "Add your first goal" action.
4. **ManageActivities** — 8 inline styles out; empty state with create CTA.
5. **CreateSession** — template picker cards on Card-atom styling; zero-template `EmptyState` gains one-click **"Create a starter template"** (posts the seed shape via existing templates API — serves existing fractals without a backfill).
6. **Programs** — tokenize; `EmptyState` ("Programs turn intent into a schedule…").
7. **Analytics** — delete `4px solid red` debug class; teaching first-run state (B, step 7).

### A5. Motion language

All transitions on `--duration-*`/`--ease-*`. One shared page-load reveal utility (12px rise + fade, staggered via `--reveal-index`) for headers/card grids on Selection, Sessions, Notes, Programs. Consistent hover lift / press scale. Everything respects the global reduced-motion kill switch (`client/src/index.css:119-128`).

### A6. Ratchet the audit

`client/scripts/maintainability-audit.mjs:173-176`: inline styles 356 → 280, raw buttons 137 → 105, bespoke badges 162 → 135 (staged with phases). **New checks**: undefined-token detector (var(--x) not defined in design-tokens.css), bespoke-overlay count budget, raw duration/cubic-bezier literal budget.

---

## Workstream B — Onboarding

### B1. Backend

1. **State shape** in `User.preferences.onboarding` (no new endpoint; existing `PATCH /api/auth/preferences`):
```json
{ "version": 1, "status": "active|dismissed|completed",
  "started_at": "...", "dismissed_at": null, "completed_at": null,
  "steps": { "create_fractal": {"done_at": "...", "source": "derived"}, ... },
  "hints_dismissed": ["..."], "celebrated_first_session": false }
```
   Shallow top-level merge (`services/user_service.py:26-41`) means the client always sends the **full** onboarding blob (read-modify-write from AuthContext, debounced; derived steps self-heal on loss).
2. **Telemetry**: extend `ALLOWED_EVENTS` (`services/telemetry_service.py:22-24`) with `onboarding_started / onboarding_step_completed / onboarding_completed / onboarding_dismissed` — flows into product_events → admin usage → BigQuery automatically.
3. **Feature flag** `onboarding_v1` (default off) in `FEATURE_FLAG_DEFINITIONS` — gates onboarding *surfaces* only.
4. **Seed "Simple Empty Template"** in `create_fractal` (`services/_goal_fractals.py:69-99`) — **not** flag-gated (fixes a real dead-end):
   - Change commit-at-97 to flush → seed → single atomic commit.
   - Shared helper `seed_default_template(db_session, root_id)` in `template_service.py`; shape `{"session_type":"normal","sections":[{"name":"Main","activities":[]}]}` validated through `validate_session_template_data`; description "A blank one-section session. Start here, add activities as you go."
   - Quota-guarded: if `session_templates` quota unavailable, **skip silently** — fractal creation never fails because of the seed. Emit `SESSION_TEMPLATE_CREATED` for audit consistency.
   - **No backfill migration** for existing fractals — the CreateSession zero-template CTA (A4.5) covers them user-initiated.

### B2. Frontend architecture (new files)

- `client/src/components/onboarding/onboardingSteps.js` — pure step registry: `{ id, title, blurb, ctaLabel, getPath(rootId), isComplete(data), hintIds }`.
- `client/src/contexts/OnboardingContext.jsx` — provider mounted in `AppRouter.jsx` inside the auth boundary. Reads `user.preferences.onboarding` + `onboarding_v1` flag (inert API when off). Derives completion from **already-cached** queries (`queryKeys.fractals/fractalTree/activities/sessions/programs`) via cache subscription — never force-fetches. Reconciles derived flips → debounced preferences write → `setUser(res.data)` → `trackEvent`. Exposes `{ enabled, status, steps, activeStep, completeStep, dismiss, resume, replay, isHintVisible, dismissHint, celebrateFirstSessionOnce }`.
- `client/src/components/onboarding/GettingStartedChecklist.jsx` — Selection: inline card while active. In-fractal routes: docked bottom-right pill ("Getting started · 3/7" + progress ring, `--z-sheet`) expanding to the checklist with deep-link "Go" buttons. Mobile: pill above bottom nav → bottom sheet via `ModalBackdrop`. Collapse in localStorage; dismissal in preferences (+ undo toast).
- `client/src/components/onboarding/Hint.jsx` — in-house coachmark (no tour lib): wraps its anchor child, popover renders only when `show && status==='active' && !dismissed`. Card bg, brand left rule, ghost "Got it" persisting dismissal, `role="note"`, non-trapping, positioning borrowed from Tooltip atom, reduced-motion safe.
- `client/src/components/onboarding/FirstSessionCelebration.jsx` + `client/src/hooks/useOnboarding.js`.

### B3. The guided sequence

Copy voice: second person, calm, concrete, practice-oriented — never exclamation-heavy.

| # | Step | Surface & mechanics | Completion |
|---|---|---|---|
| 0 | **Welcome** (non-blocking) | Selection zero-fractal hero: "Deliberate practice starts with a structure." + CTA → existing GoalModal; writes `status:'active'`, fires `onboarding_started` | — |
| 1 | Create your fractal | Change `createFractalMutation.onSuccess` (`client/src/pages/Selection.jsx:65-78`) to use returned fractal → `handleSelectRoot(id)` → auto-navigate to goals | derived: `fractals.length ≥ 1` |
| 2 | Break it down | Hint on FlowTree add-goal: "Add 1–3 long-term goals under your ultimate goal." | derived: root has children |
| 3 | Make one goal SMART | Collapsible SMART guidance panel in GoalDetailModal create/edit (5 criteria, met/unmet from existing `calculateSMARTStatus`) | hybrid: manual flag on save when `getSMARTCount===5`; derived fallback if tree payload carries SMART inputs (verify fields early) |
| 4 | Create an activity + metric | ManageActivities; Hint on ActivityBuilder metric section: "Metrics are how sessions produce evidence." | derived: any activity with ≥1 metric |
| 5 | **Run your first session (aha)** | CreateSession → seeded template card (Hint) → SessionDetail inline activity add → complete. On first completion: `FirstSessionCelebration` Modal ("Evidence recorded." → "See your goal tree") + one-time soft pulse on newly-lit tree nodes (`data-just-lit` in FlowTreeNode via location state; reduced-motion → static highlight) | derived: any session with `completed_at` |
| 6 | Schedule a program | Hint on ProgramBuilder: goal + date range + rhythm | derived: `programs.length ≥ 1` |
| 7 | See your progress | Teaching empty states on Analytics ("Your sessions become charts here…") and Notes ("Notes capture what the numbers can't…") | manual: both pages visited while active |

All done → `status:'completed'`, quiet "You're set up" state, replayable from Settings.

### B4. Guards & semantics

- **Skippable everywhere**; hints independently dismissible forever; dismissal ≠ deletion (resumable).
- **Settings row**: "Show Getting Started checklist" (resume) / "Restart" (resets steps+hints; `celebrated_first_session` stays true).
- **Returning-user guard**: first evaluation with no `onboarding` key → if `fractals.length ≥ 1`, silently write `status:'dismissed'` (grandfathered, can opt in); if zero fractals → new-user hero. Data-derived, no launch-date heuristics.

## Sequencing

1. **A1** tokens → 2. **B1** backend → 3. **A2+A3** shell/modals ∥ **B2** onboarding infra → 4. **A4.1 Selection + B3 step 0/1** together (same surface) → 5. **B3 steps 2–7** ride along **A4.2–A4.7** page passes → 6. **A5 motion + A6 ratchet** last.

## Risks

- Shallow prefs merge / concurrent tabs → last-write-wins; derived steps self-heal, only manual flags lossy (acceptable).
- Tree payload may lack SMART inputs → hybrid manual-flag design covers; verify serializer early.
- Token renames touch ~17 files → screenshot-diff Selection, GoalDetailModal, ManageActivities, Notes, Programs before/after.
- Z-index remap → migrate via mapping table preserving exact relative order.
- Light-theme de-dup → FOUC risk; pre-hydration script fallback.
- Seeding couples domains → small tested helper; quota-guarded skip means fractal creation can never regress.

## Verification

1. `./run-tests.sh backend` — new tests: seeding (valid template, atomic, quota-skip path, counts toward quota after), preferences nested-merge round-trip, telemetry allowlist accepts new/drops unknown, flag present.
2. `./run-tests.sh frontend` — `onboardingSteps` derivations against fixtures; OnboardingContext guard (existing-data→dismissed, zero-data→active), debounced write + AuthContext push, flag-off inert; Hint dismissal persistence; checklist progress/deep-links; Selection auto-navigate.
3. Maintainability audit passes at ratcheted budgets; new undefined-token check green.
4. Grep gates: `var(--radius-` → 0 hits; `var(--color-accent` → 0 (bar definition); `solid red` in Analytics → 0.
5. **Manual E2E (new user, flag on)**: invite → signup → login → hero → create fractal → auto-land on goals → steps 2–7 → first session completion fires celebration + tree pulse → checklist completes; onboarding events visible in Admin usage panel.
6. **Manual E2E (returning user)**: existing account sees nothing; Settings opt-in works; flag off hides all surfaces; seeded template appears on new fractals regardless of flag.
7. Theme parity (light/dark on Selection/Notes/GoalDetailModal/checklist/Hint) + OS reduced-motion (no reveals/pulses).
