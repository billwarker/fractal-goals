# Fractal Goals - Refactoring Status & Recommendations

**Last Updated:** December 29, 2025

This document tracks the refactoring progress and outlines the remaining high-impact improvements for the Fractal Goals codebase.

---

## 📊 Application Grade: B+ / A-
**Production Quality Assessment (Top-Tier Standard):**
- **Architecture (A-):** Backend is well-modularized. Frontend utilizes React Contexts efficiently. Key visualization logic (`FractalView`) and UI components (`Sidebar`, `Modals`) are fully extracted and modular.
- **Maintainability (B+):** `FractalGoals.jsx` has been significantly reduced (~230 lines) and serves as a clean controller. Component reusability is high.
- **Reliability (B):** Core features work well. Context integration improves state consistency.
- **Code Cleanliness (B):** Dead code (e.g., `App.jsx`) removed. Inline logic extracted. The primary remaining issue is the extensive use of inline styles (`style={{...}}`).

---

## 🏗️ Work In Progress / Recently Completed

### 1. Cleanup & Component Integration (✅ Completed)
**Goal:** Remove dead code and unify component usage.
- ✅ **Dead Code Removal**: `App.jsx` deleted.
- ✅ **Sidebar Integration**: `Sidebar.jsx` updated with full feature parity (Targets, Edit Mode) and integrated into `FractalGoals.jsx`.
- ✅ **Modal Integration**: Inline modals in `FractalGoals.jsx` replaced with reusable `GoalModal`, `PracticeSessionModal`, and `DeleteConfirmModal`.
- ✅ **Helper Functions**: Centralized in `utils/goalHelpers.js`.

### 2. Backend Modularization (✅ Completed)
**Goal:** Split the monolithic `blueprints/api.py`.
- ✅ **Structure**: Split into `activities`, `sessions`, `goals` blueprints.

### 3. Frontend State Management (✅ Completed)
**Goal:** Centralize state logic.
- ✅ **Contexts**: `GoalsContext`, `SessionsContext`, `ActivitiesContext` implemented and fully integrated.

---

## 🚀 High Priority (Immediate Next Steps)

### 1. UI/UX Standardization (Styles)
**Problem:** The application still relies heavily on inline styles, making theming and consistency difficult.
**Plan:**
- **CSS Modules**: Migrate inline styles from `Sidebar.jsx` and `FractalGoals.jsx` to `*.module.css` or global classes.
- **Design Tokens**: Standardize colors (e.g., `#2a2a2a`, `#4caf50`) into CSS variables.

### 2. TypeScript Migration
**Problem:** Loose typing leads to `attributes.id` vs `id` confusion and prop errors.
**Plan:**
- **Install TypeScript**: Add TS configuration.
- **Interfaces**: Define interfaces for `Goal`, `Session`, `Activity`.
- **Conversion**: incrementally convert `utils` and `components`.

---

## 📋 Medium Priority (Future Improvements)

### 1. Error Boundaries
**Problem:** A crash in the Grid/Tree breaks the whole app.
**Plan:**
- Wrap `FractalView` and `Sidebar` in Error Boundaries.

### 2. Testing
**Problem:** No automated tests.
**Plan:**
- Add Vitest/Jest for unit testing Context logic and Helper functions.

---

## 📉 Low Priority / Housekeeping

- **Normalize Data Access**: Standardize `node.id` vs `node.attributes.id` usage in frontend.
- **Remove Backup Files**: Delete `.bak` and `.backup` files.
