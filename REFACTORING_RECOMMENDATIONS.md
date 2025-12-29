# Fractal Goals - Refactoring Status & Recommendations

**Last Updated:** December 29, 2025

This document tracks the refactoring progress and outlines the remaining high-impact improvements for the Fractal Goals codebase.

---

## 📊 Application Grade: B- / C+
**Production Quality Assessment (Top-Tier Standard):**
- **Architecture (B):** Backend is well-modularized. Frontend now uses React Contexts efficiently, reducing prop drilling. Key visualization logic is encapsulated in `FractalView`.
- **Maintainability (C+):** Significant technical debt remains in `FractalGoals.jsx` (large file, inline logic) and excessive inline styles (`style={{...}}`) which hampers UI consistency and theming. Use of dead files (`App.jsx`) confuses development.
- **Reliability (B):** Core features work well. Context integration improves state consistency.
- **Code Cleanliness (C):** Needs aggressive removal of dead code and extraction of inline UI components (Sidebar, Modals) into dedicated files.

---

## 🏗️ Work In Progress / Recently Completed

### 1. Backend Modularization (✅ Completed)
**Goal:** Split the monolithic `blueprints/api.py`.
- ✅ **Activities, Sessions, Goals APIs**: Extracted to specific blueprints.
- ✅ **Cleanup**: `api.py` deleted.

### 2. Frontend State Management (✅ Completed)
**Goal:** Centralize state logic.
- ✅ **Contexts Implemented**: `GoalsContext`, `SessionsContext`, `ActivitiesContext`.
- ✅ **Integrated**: `FractalGoals.jsx` now uses these contexts, removing manual `axios` calls and local state.

### 3. Component Extraction (✅ Completed)
**Goal:** Break down monoliths.
- ✅ **FractalView**: Visualization logic moved to `components/FractalView.jsx`.
- ✅ **Sidebar**: `Sidebar.jsx` created (but currently unused due to missing features).
- ✅ **Modals**: Extracted generic modals to `components/modals/`.

---

## 🚀 High Priority (Immediate Next Steps)

### 1. Cleanup & Dead Code Removal (Phase 5)
**Problem:** `App.jsx` and other files are unused remnants of the old architecture, causing confusion.
**Plan:**
- **Delete `App.jsx`**: Verify it is safely unused and delete it.
- **Normalize `Sidebar.jsx`**: Update `components/Sidebar.jsx` to include Target management features found in `FractalGoals.jsx`.
- **Integrate Sidebar**: Replace the inline sidebar in `FractalGoals.jsx` with the updated `Sidebar` component.

### 2. UI/UX Standardization
**Problem:** `FractalGoals.jsx` relies heavily on inline styles.
**Plan:**
- **CSS Modules**: Move styles to `FractalGoals.module.css` or global `App.css` classes.
- **Theme Variables**: Use CSS variables for colors (already partially present in `index.css`).

---

## 📋 Medium Priority (Future Improvements)

### 1. TypeScript Migration
**Problem:** Loose typing leads to `attributes.id` vs `id` confusion.
**Plan:**
- Add `typescript` and define interfaces for `Goal`, `Session`, `Activity`.

### 2. Error Boundaries
**Problem:** A crash in the Grid/Tree breaks the whole app.
**Plan:**
- Wrap `FractalView` and `Sidebar` in Error Boundaries.

### 3. Testing
**Problem:** No automated tests.
**Plan:**
- Add Vitest/Jest for unit testing Context logic and Helper functions.

---

## 📉 Low Priority / Housekeeping

- **Normalize Data Access**: Standardize `node.id` vs `node.attributes.id` usage in frontend.
- **Remove Backup Files**: Delete `.bak` and `.backup` files.
