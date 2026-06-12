# Sectional Landing Page Redesign

## Context

The landing page (`client/src/pages/Landing.jsx`) is currently a typical continuous-scroll page: hero → examples/tree explorer → audience → features → beta CTA. The sections act as windows into the app but compete for vertical space and never get the full viewport.

This redesign turns the page into a **segmented, one-section-at-a-time experience**: five discrete full-viewport panels, with scrolling settling on exactly one section at a time so each app window (goal tree, feature stage) can be maximized.

**Approved UX decisions:**
- Desktop paging via **CSS scroll-snap** (`y mandatory`) — native scrolling, no JS scroll-hijacking
- **Mobile keeps today's continuous scroll** (snap applies ≥981px only, the existing breakpoint)
- A fixed **dot rail** on the right edge (IntersectionObserver-driven, click to jump, hidden on mobile)
- FlowTree **keeps zoom-on-scroll** (faithful app mirror; ReactFlow's wheel handler calls preventDefault so it won't fight the snap container)

**Five sections (each `100dvh` on desktop):**
1. **Hero** — header + headline + goal-level icon stack + the **example picker (moved here)**. Picking an example auto-scrolls to section 2 (user interaction only, never on initial default selection)
2. **Goals view** (`id="examples"` kept for back-compat) — FlowTree explorer maximized, compact header
3. **Audience** — "who the app is for" cards, centered
4. **Features** (`id="features"`) — detached toggle tabs + maximized feature stage
5. **Beta CTA** (`id="beta"`) — signup form

## Grade of Existing Implementation (re: this plan)

**Overall: B+**

| Dimension | Grade | Notes |
|---|---|---|
| Data/content architecture | S | Snapshot-driven explorer, markdown content pipeline, prefetch + skeletons, fallback demo — all reusable as-is; zero backend changes needed |
| Component reuse | A | Real FlowTree/OptionsPane/GoalDetailModal mirrors; features section already detached-toggle + stage |
| Layout architecture (vs goal) | C | Continuous flow with fixed `min(72vh, …)` heights; no snap container, no section nav, picker buried in tree section; duplicated conditional `#examples` markup |
| A11y/testing posture | A- | Labelled regions, tablists, strong test suite — but tests pin the picker's location and there's no IntersectionObserver tooling yet |

The data layer and demo surfaces are S-grade and untouched; the work is a layout-architecture rebuild plus navigation affordances to reach S+.

## Architecture Decisions

### Snap container: `main.page`
Landing renders inside the shared `.content-container` scroller (`AppRouter.jsx:346`, `App.css:500`, `overflow-y: auto`; html/body are overflow-hidden). Make `.page` itself the desktop scroll container: `height: 100%; overflow-y: auto; scroll-snap-type: y mandatory`. It then exactly fills `.content-container` (which stops scrolling) — no changes to shared app-shell CSS. IO root = the `.page` ref; `scrollIntoView` and `#hash` links scroll the nearest scrollable ancestor, so both keep working.

### Snap CSS (≥981px only)
```css
@media (min-width: 981px) {
    .page { height: 100%; overflow-y: auto; padding: 0; scroll-snap-type: y mandatory; scroll-behavior: smooth; outline: none; }
    .snapSection {
        height: var(--app-viewport-height);
        scroll-snap-align: start;
        scroll-snap-stop: always;
        overflow: hidden;
        display: flex; flex-direction: column;
        padding: 0 var(--landing-page-x-padding);
    }
}
@media (prefers-reduced-motion: reduce) { .page { scroll-behavior: auto; } }
```
Below 981px: current continuous-scroll rules remain the base styles, untouched.

### Tall-content guard (short laptops)
```css
@media (min-width: 981px) and (max-height: 720px) {
    .page { scroll-snap-type: y proximity; }
    .snapSection { height: auto; min-height: var(--app-viewport-height); overflow: visible; }
}
```
Plus a `max-height: 820px` tier that shrinks hero type/icon sizes so hero + picker fit.

### Keyboard & a11y
- `main.page` gets `tabIndex={-1}` + focus on mount (`preventScroll: true`) so Space/PageDown/arrows page the snap container (document isn't scrollable).
- Dot rail: `<nav aria-label="Page sections">` → `<ol>` of buttons with `aria-label` + `aria-current` on the active dot; visible `:focus-visible`; hidden <981px.
- One shared `scrollToSection(id)` helper: `scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' })`.
- All sections stay labelled regions; all content stays in the DOM (no SEO regression).

### Structural simplification
Merge the two conditional `<section id="examples">` blocks (skeleton vs loaded) into one always-rendered section whose **inner content** switches — removes duplication once the picker moves to the hero and keeps the section node stable for the IntersectionObserver.

## File-by-File Changes

### `client/src/pages/Landing.jsx`
1. `mainRef` on `<main className={styles.page} tabIndex={-1}>`; focus on mount.
2. Module-level `scrollToSection(sectionId)` helper (reduced-motion aware).
3. **Hero**: add `id="hero"` + `styles.snapSection`; append the example picker — the existing `role="tablist"` "Example goal trees" block moved verbatim, with a `LandingSkeleton` pill row (testid `example-picker-skeleton`) while loading.
4. `handleExampleSelect(exampleId, { scrollToTree = false })` — existing state updates plus `scrollToSection('examples')` when `scrollToTree`. Hero tabs pass `{ scrollToTree: true }`; the default-selection `useEffect` (calls `setSelectedExampleId` directly) never scrolls.
5. **Goals section**: single merged `#examples` section with compact header (`styles.sectionHeaderCompact`); inner skeleton vs explorer (FlowTreeOptionsPane + FlowTree + docked/modal GoalDetailModal unchanged). Keep `data-testid="examples-skeleton"`.
6. **Audience / Beta**: add ids (`audience`, `beta` exists) + `snapSection` + centering wrappers.
7. `handleFeatureGoalSelect`: swap inline `document.getElementById('examples')?.scrollIntoView(...)` for `scrollToSection('examples')`.
8. Render `<LandingSectionNav sections activeId onNavigate={scrollToSection} />`; `activeId` from `useActiveLandingSection(mainRef, SECTION_IDS)` with `SECTION_IDS = ['hero','examples','audience','features','beta']`.
9. Pass `className={styles.snapSection}` to `LandingFeaturesSection`.

### `client/src/pages/Landing.module.css`
- Desktop snap container + `.snapSection` + max-height fallbacks (above).
- `.hero` desktop: flex column; header `flex: 0`; copy block vertically centered; picker pinned below.
- `.sectionHeaderCompact`: h2 ~`clamp(1.5rem, 2.2vw, 2.2rem)`, single-line body, tight margins.
- `.treeSection` desktop: flex column; `.goalExplorer { flex: 1; min-height: 0; }`; `.goalTreeCanvas { height: 100%; min-height: 0; }` (keep `min(72vh,720px)` for <981px and the 620px block).
- `.audienceSection` / `.betaSection` desktop: `justify-content: center`, drop `margin-top: 72px` inside the snap query.

### `client/src/components/landing/LandingFeaturesSection.jsx` + module CSS
- Accept `className` prop on the `<section>`.
- Wrap `renderStage()` in `<div className={styles.stageBody}>` (flex: 1, min-height: 0, internal `overflow-y: auto`).
- Desktop: `.featuresSection` flex column (height from shared snap class), compact header, `.featureStage { flex: 1; min-height: 0; }`, `.landingSessionScreen { height: 100%; flex: 1; }`. Keep current fixed heights for <981px. Detached tablist stays outside the stage (tests assert this).

### `client/src/content/landing.md` + `client/src/content/landingContent.js`
- Add `**Nav Label:** …` per section (Top / Goals / Who it's for / Features / Beta). `normalizeMetaKey` auto-camelCases to `navLabel` — **no parser change**; add matching defaults to `fallbackContent`.

## New Files

- **`client/src/hooks/useActiveLandingSection.js`** — `useActiveLandingSection(containerRef, sectionIds)` → `activeId`. One IO with `root: containerRef.current`, `rootMargin: '-50% 0px -50% 0px'`, `threshold: 0` (viewport-center wins; robust with the proximity fallback). Runtime guard for missing `IntersectionObserver` (mirror `NoteCard.jsx`).
- **`client/src/components/landing/LandingSectionNav.jsx` + `.module.css`** — dot rail; `display: none` base, fixed right-center ≥981px, `z-index: 30` (above the docked panel's 10), ~10px dots with ≥24px hit targets, hover/focus label tooltip.

## Test Changes (`client/src/pages/__tests__/Landing.test.jsx`)

- **Setup**: stub `IntersectionObserver` class + `Element.prototype.scrollIntoView = vi.fn()` (jsdom lacks both); restore in `afterEach`.
- **Unchanged**: section-order test (order preserved), `#examples`/`#features`/`#beta` ids, "Example goal trees" tablist role queries, features detached-toggle test, FlowTree data props, docked/modal detail tests, beta form flows.
- **Adjusted**: loading test gains the hero `example-picker-skeleton` assertion; add containment check that the picker tablist is inside the hero section.
- **New**: pick example → `scrollIntoView` on `#examples` with smooth/start; **no** scroll on initial default selection; reduced-motion (`matchMedia` stub) → `behavior: 'auto'`; dot rail renders 5 labelled buttons, click "Features" dot → scroll to `#features`, exactly one `aria-current`; Activity-feature lineage goal click still scrolls to `#examples`.
- `landingContent.test.js`: `navLabel` parses from markdown + falls back.

## Implementation Order

1. Save this plan to `/planning/landing-sectional-redesign.md` (per project convention).
2. `landing.md` + `landingContent.js` navLabel + content test.
3. `useActiveLandingSection.js`, `LandingSectionNav.jsx` + CSS.
4. `Landing.jsx` restructure (merge sections, move picker, scroll helper, ids, rail, focus).
5. `Landing.module.css` snap layout.
6. `LandingFeaturesSection.jsx` + CSS flexed stage.
7. Tests per above.

## Verification

- `./run-tests.sh frontend`
- Manual: `cd client && npm run dev` → `http://localhost:5173/landing`
  - Desktop (>980px): wheel/PageDown/Space snap one section at a time; wheel over FlowTree zooms (doesn't page); dot rail tracks + jumps; hero example pick smooth-scrolls to goals view; lineage click in Activity feature jumps back with goal selected; header `#features`/`#beta` links land flush; docked detail panel doesn't break section height.
  - <981px: continuous scroll, rail hidden, mobile detail modal at ≤768px intact.
  - Short window (~700px): proximity fallback, nothing clipped.
  - OS reduced-motion: instant jumps. Check Safari/Chrome/Firefox snap.

## Risks

- **FlowTree re-fit on flexed height**: canvas moves from fixed to flex-filled; FlowTree already re-fits on container resize (docked-panel flex-sibling design relies on it) — verify first paint of the lazy chunk inside a flexed parent.
- **Mandatory snap + tall content**: mitigated by exact-height panels, internal `.stageBody` scroll, and the `max-height: 720px` proximity fallback.
- **Safari `scroll-snap-stop`**: pre-15 may fling past a section — degradation only.
- **Keyboard target**: keys page only while focus is inside the scroller — handled by `tabIndex={-1}` + mount focus.
- **Admin banner** (`AppRouter.jsx:347`) above Landing would offset heights — only with admin query params on /landing; accept as known.
- **`client/index.html` inline preload script must remain untouched.**

## S+ Justification

- **Engineering**: zero backend/data changes; native CSS snap (no scroll-hijack JS); one new hook + one new component; shared app-shell CSS untouched; content-driven nav labels through the existing markdown pipeline; full test coverage including reduced-motion and IO stubs.
- **Product usability**: each app window gets the full viewport; picker at the moment of intent (hero) with auto-advance; dot rail orientation; graceful degradation on short viewports and mobile; a11y-first (regions, nav landmark, aria-current, reduced motion).
- **Overall**: preserves every existing behavior contract (ids, tablists, detached toggles, skeletons, SEO DOM) while changing only the layout architecture.
