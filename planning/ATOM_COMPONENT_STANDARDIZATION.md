# Atom & Component Standardization Campaign

## Context

Fractal Goals has a mature atoms/common component library (`client/src/components/atoms/`, `client/src/components/common/`), but adoption is **partial and inconsistent**. The same UI primitive is implemented many ways across the app. A three-part audit (close controls, form/button/modal atoms, headers/badges/empty-loading states) found drift at every scale:

- **Foundational split:** the `Modal` atom renders its own close button as a raw `&times;` that hovers **gray**, while the `CloseButton` atom renders an SVG X that hovers **red** — two different "close" affordances at the base of the system.
- **~362 raw `<button>`** across ~107 files vs. 39 files using the `Button` atom.
- **~90 raw `<input>`, 44 `<select>`, 18 `<textarea>`, 36 `<input type="checkbox">`** bypassing `Input`/`Select`/`TextArea`/`Checkbox`.
- **124 bespoke `Badge/Pill/Chip/Tag` CSS class definitions across 35 files**, with **no generic Badge atom** — even the four "shared" badges (`GoalNameBadge`, `SessionTemplateNameBadge`, `SessionTemplateTypePill`, `CompletionCheckBadge`) are each fully bespoke.
- **~30 ad-hoc empty states** and **~35 ad-hoc "Loading…" states** despite `EmptyState` (16 adopters) and `LoadingState` (2 adopters) existing.
- **`EditIcon` atom has zero real adopters** — replaced by `✎`/`✏️` glyphs in 6 places; two competing local icon sets exist (`ProgramSvgIcons.jsx`, `AnalyticsIcons.jsx`).
- **No `IconButton`, `Tooltip`, `Spinner`, or `RemoveButton` primitive** exists; each is re-implemented per file.

**Intended outcome:** one canonical implementation for every small UI primitive, adopted app-wide, so the app renders as a single consistent system. Per user direction this is a **full sweep** — convert all drift, not just the high-leverage cascade — plus creating the missing shared atoms.

---

## Current Grade: **C+**

| Dimension | Grade | Notes |
|---|---|---|
| Atom library *exists* & is well-built | A− | Button/Input/Modal/CloseButton/Typography are clean, token-driven, tested. |
| Atom library *adoption* | D | Button 39/107 files; EditIcon 0 real adopters; LoadingState 2; SectionHeader 2; StatusState 1. |
| Foundational consistency | C | Modal atom's own close ≠ CloseButton atom; two competing icon sets. |
| Missing primitives | D | No Badge/IconButton/Tooltip/Spinner despite 100+ bespoke instances. |
| Design-token discipline | B+ | Tokens are strong and widely used; the problem is *structural* duplication, not raw hex values. |

**Net C+:** the foundation is strong, but the app is only half-built on it, and four heavily-repeated patterns have no home.

---

## Target: **S+**

An S+ result means: (1) every "close/remove/edit/add/loading/empty/badge/tab/meta" primitive resolves to exactly one shared component; (2) the missing primitives exist, are documented, token-driven, tested, and accessible; (3) bespoke CSS class definitions for these patterns are deleted, not just orphaned; (4) the maintainability audit gains guardrails so drift can't silently return; (5) `index.md` documents the canonical component map so future work extends rather than re-invents.

---

## Plan (phased for reviewable PRs; end state = full sweep)

### Phase 0 — New shared atoms (create the missing homes first)

Create in `client/src/components/atoms/`, each with a `.module.css`, JSDoc header (match the existing `CloseButton`/`DeleteButton` style), and a `__tests__` entry:

1. **`Badge.jsx` / `Badge.module.css`** — generalize the existing clean base at `common/SessionTemplateTypePill.module.css` (already `border-radius: 999px`, `sizeSm`/`sizeMd`). Props: `variant` (`neutral` | `info` | `success` | `warning` | `danger` | `accent`), `size` (`sm` | `md`), `pill` (bool, full-round vs. rounded-rect), `leftIcon`. All colors from tokens (`--color-bg-input`, `--color-border`, `--color-brand-*`).
2. **`IconButton.jsx` / `.module.css`** — icon-only button primitive (transparent, padding, border-radius, focus ring, `aria-label` required via prop). `CloseButton` and `DeleteButton` should be **refactored to compose it** so all three share one hover/focus/sizing base.
3. **`Tooltip.jsx` / `.module.css`** — CSS-driven hover/focus tooltip wrapper (no external dep; inline `title=` is not keyboard/AT-friendly). Generalize the hand-rolled `iconBtnTooltip` pattern in `programs/ProgramBlockView.module.css`.
4. **`Spinner.jsx` / `.module.css`** — the single `@keyframes spin` home (currently duplicated in `pages/Sessions.module.css` and `atoms/Button.module.css`). Then extend `common/LoadingState.jsx` to optionally render `Spinner` + label so ad-hoc loaders can converge on `LoadingState`.
5. **`RemoveButton.jsx`** (worthy addition) — for the ~20 remove-item / remove-chip / cancel-edit controls (audit category C) that are semantically distinct from "Close". Composes `IconButton` + `CloseIcon`, but with caller-supplied destructive `aria-label` (e.g. "Remove template"). Keeps "Close a dialog" vs. "Remove this item" as two clear, consistent affordances.

Consolidate the two competing icon sets: fold overlapping glyphs from `components/programs/ProgramSvgIcons.jsx` and `components/analytics/AnalyticsIcons.jsx` into `atoms/` icon components (reuse existing `EditIcon`/`PlusIcon`/`LinkIcon`/`TrashIcon`), deleting duplicates.

### Phase 1 — Foundational close-control unification (cascading win)

- Rewrite `atoms/Modal.jsx:66` to render `<CloseButton onClick={onClose} />` instead of the raw `&times;`; delete the now-unused `.closeButton` block in `Modal.module.css`. This upgrades **every** modal built on the atom at once.
- Replace the ~13 hand-rolled X close buttons (audit B1/B2/B3) with `CloseButton`:
  - B1 (bare `<button aria-label="Close…">` around `CloseIcon`): `modals/DayViewModal.jsx:224`, `activityPicker/ActivityPicker.jsx:340`, `goalDetail/ActivityAssociator.jsx:623`, `sessionDetail/SessionDetailPaneLayout.jsx:35`, `analytics/AnnotationModal.jsx:86`, `analytics/AnalyticsViewsModal.jsx:77`, `analytics/AnalyticsViewNameModal.jsx:21`, `analytics/ProfileWindow.jsx:519,547`, `pages/Notes.jsx:51`.
  - B2/B3 (raw `&times;` / literal `x`): `modals/SettingsModal.jsx:222`, `pages/Admin.jsx:567`, `analytics/ProfileWindow.jsx:569`, `surface/SurfaceWidget.jsx:59`.
- Route remove/cancel controls (C1–C5) through the new `RemoveButton`.

### Phase 2 — Modal structure unification

- Convert the fully hand-rolled modal in `modals/SettingsModal.jsx:217` (`.overlay` + `.modal` divs) to the `Modal` atom.
- Convert hand-rolled overlays that are true dialogs to `Modal` / `ModalBackdrop`: `TemplateBuilderModal.jsx:792,857` (nested), `pages/Sessions.jsx:401,457`, `pages/Analytics.jsx:504`. Leave genuinely-non-modal draggable windows (`ProfileWindow`, `FlowTree` metrics overlay) as-is but note them.
- For the 7 `createPortal + ModalBackdrop` hand-pairings, standardize on the `Modal` atom where the surface is a centered dialog.

### Phase 3 — Form controls sweep

Replace all raw form elements with atoms, densest files first:
- **Checkbox (36):** `GoalCharacteristicsSettings.jsx`, `SettingsModal.jsx`, `GoalHierarchySelector.jsx`, then singletons. (Add a `Radio` atom — 4+ raw radios exist with no home.)
- **Select (44):** `ActivityMetricControls.jsx` (5), `SettingsModal.jsx`, `Admin.jsx`, `TargetManager.jsx`, `AnalyticsQueryConsole.jsx`, etc.
- **Input (~90)** and **TextArea (18):** `Admin.jsx`, `GoalCharacteristicsSettings.jsx`, `SettingsModal.jsx`, `TargetManager.jsx` lead the list.

### Phase 4 — Button sweep

Convert ~362 raw `<button>` across ~107 files to the `Button` atom (variants `primary`/`secondary`/`success`/`danger`/`ghost`) and icon-only ones to `IconButton`. Retire hand-rolled `primaryButton`/`secondaryButton`/`dangerButton`/`flowtree-surface-btn*` classes. Sequence by density: `Admin.jsx` (31), `FlowTreeOptionsPane.jsx` (13), `ProgramCalendarPage.jsx` (12), `SessionActivityItemView.jsx` (12), `NoteComposer.jsx` (12), `Notes.jsx` (11), `GoalDetailModalFooter.jsx` (11), `ActivityPicker.jsx` (11)…
Route hand-rolled delete/trash buttons (audit cat. 5) through `DeleteButton`/`RemoveButton`; replace `✎`/`✏️` edit glyphs (cat. 6) with `EditIcon`, `+` add glyphs with `PlusIcon`.

### Phase 5 — Badge / Pill sweep

Adopt the new `Badge` atom at the ~40 concrete render sites and refactor the four existing bespoke badge components to compose it. Delete the 124 bespoke `.badge/.pill/.chip/.tag` class definitions across the 35 CSS files as each site converts. Densest: `ProgramCalendarView`, `SessionActivityItem`, `SessionInfoPanel`, `TemplateBuilderModal`, `ActivityBuilder`, `TemplateCard`.

### Phase 6 — Empty / Loading / SectionHeader / MetaField / Tabs adoption

- **EmptyState** at the ~30 ad-hoc sites; fold local re-abstractions in (`analytics/AnalyticsExtraCharts.jsx:17` `EmptyChart`, `notes/NoteTimeline.jsx:73` `emptyMessage`).
- **LoadingState (+Spinner)** at the ~35 ad-hoc "Loading…" sites; retire `GraphProfileLoadingFallback.jsx` bespoke loader.
- **SectionHeader / SidePaneHeader** at the dozens of ad-hoc `h2/h3 + actions` rows (`SettingsModal`, `DayViewModal`, `AnalyticsQueryConsole`, `SessionsList`…).
- **MetaField** at the label+value clusters, biggest being `sessionDetail/SessionInfoPanel.jsx` (10+ rows).
- **ViewToggleTabs** at the hand-rolled segmented switchers (`NoteComposer` Goal/Activity, `SessionsList` filter, `SettingsModal` tabs, `AuthModal` login/signup, `SessionsQuerySidebar`).

### Phase 7 — Guardrails & docs (locks in S+)

- Extend `client/scripts/maintainability-audit.mjs` with lint rules that **flag new drift**: raw `&times;`/`✕` close glyphs, raw `<button className="...btn...">`, and new bespoke `.badge/.pill` definitions outside the atom. This prevents regression.
- Add a **canonical component map** section to `index.md` (and a short `client/src/components/README.md`) listing each primitive and its single owning atom, so future work extends rather than re-invents.
- Ensure every new atom has Vitest coverage mirroring `atoms/__tests__/` and passes the ESLint + responsive + maintainability audits.

---

## Key files

**Create:** `atoms/Badge.{jsx,module.css}`, `atoms/IconButton.{jsx,module.css}`, `atoms/Tooltip.{jsx,module.css}`, `atoms/Spinner.{jsx,module.css}`, `atoms/RemoveButton.jsx`, `atoms/Radio.{jsx,module.css}`.
**Refactor to compose new base:** `atoms/CloseButton.jsx`, `atoms/DeleteButton.jsx` → `IconButton`; `common/LoadingState.jsx` → `Spinner`.
**Foundational edit:** `atoms/Modal.jsx` + `atoms/Modal.module.css`.
**Consolidate icon sets:** `programs/ProgramSvgIcons.jsx`, `analytics/AnalyticsIcons.jsx` → `atoms/` icons.
**Highest-density sweep targets:** `pages/Admin.jsx`, `modals/SettingsModal.jsx`, `GoalCharacteristicsSettings.jsx`, `flowTree/FlowTreeOptionsPane.jsx`, `sessionDetail/SessionActivityItemView.jsx`, `sessionDetail/SessionInfoPanel.jsx`.
**Guardrails/docs:** `client/scripts/maintainability-audit.mjs`, `index.md`, new `client/src/components/README.md`.

## Reuse (do not re-invent)
- `atoms/CloseIcon.jsx` (glyph), `atoms/EditIcon/PlusIcon/LinkIcon/TrashIcon.jsx`, `atoms/Card.jsx`, `atoms/Typography.jsx`.
- `common/SessionTemplateTypePill.module.css` as the `Badge` base.
- `common/EmptyState.jsx`, `common/LoadingState.jsx`, `common/SectionHeader.jsx`, `common/SidePaneHeader.jsx`, `common/MetaField.jsx`, `common/ViewToggleTabs.jsx`, `common/CardCornerActionButton.jsx` — adopt, don't duplicate.

## Verification

After **each phase** (keep PRs small and green):
1. `cd client && npm run lint` — no new violations.
2. `./run-tests.sh frontend` — existing + new atom tests pass.
3. `node client/scripts/maintainability-audit.mjs` and `node client/scripts/responsive-audit.mjs` — pass; from Phase 7 they actively block regressions.
4. **Visual parity:** re-capture the `client/_migration_screenshots/` baselines (GoalDetailModal, Programming, Sessions, ActivityBuilder, SettingsModal/ProfileWindow) and diff against the committed `_baseline.png` files — the sweep must be visually neutral except the intended close-affordance unification (gray-hover × → red-hover X on `Modal`-atom modals).
5. **Manual smoke** of one screen per phase (e.g. open Settings modal, close via X; open a program day modal; verify a badge, an empty state, a loading state, a tab switch render identically).

**Rollout order:** Phase 0 → 1 → 2 → 7-guardrails (early, so later phases can't regress) → 3 → 4 → 5 → 6, each as its own reviewable PR.
