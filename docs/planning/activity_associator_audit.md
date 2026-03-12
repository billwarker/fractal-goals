# Activity Associator — Code Quality Audit

## Scope

Files audited across the activity association feature surface:

| Layer | Files |
|---|---|
| **Component** | [ActivityAssociator.jsx](file:///Users/will/Projects/fractal-goals/client/src/components/goalDetail/ActivityAssociator.jsx) (1125 lines), [ActivityAssociationModal.jsx](file:///Users/will/Projects/fractal-goals/client/src/components/sessionDetail/ActivityAssociationModal.jsx) (310 lines), [ActivityAssociationsField.jsx](file:///Users/will/Projects/fractal-goals/client/src/components/activityBuilder/ActivityAssociationsField.jsx) (88 lines) |
| **Hooks** | [useGoalAssociationMutations.js](file:///Users/will/Projects/fractal-goals/client/src/hooks/useGoalAssociationMutations.js) (187 lines), [useSessionDetailGoalAssociations.js](file:///Users/will/Projects/fractal-goals/client/src/hooks/useSessionDetailGoalAssociations.js) (122 lines) |
| **Query Utils** | [goalDetailQueryUtils.js](file:///Users/will/Projects/fractal-goals/client/src/components/goals/goalDetailQueryUtils.js) (31 lines) |
| **Style** | [ActivityAssociator.module.css](file:///Users/will/Projects/fractal-goals/client/src/components/goalDetail/ActivityAssociator.module.css) (769 lines), [ActivityAssociationModal.module.css](file:///Users/will/Projects/fractal-goals/client/src/components/sessionDetail/ActivityAssociationModal.module.css) (237 lines) |
| **Tests** | [useGoalAssociationMutations.test.jsx](file:///Users/will/Projects/fractal-goals/client/src/hooks/__tests__/useGoalAssociationMutations.test.jsx) (129 lines), [useSessionDetailGoalAssociations.test.jsx](file:///Users/will/Projects/fractal-goals/client/src/hooks/__tests__/useSessionDetailGoalAssociations.test.jsx) (142 lines), [ActivityAssociationModal.test.jsx](file:///Users/will/Projects/fractal-goals/client/src/components/sessionDetail/__tests__/ActivityAssociationModal.test.jsx) (106 lines)

---

## Overall Grade: **B+**

The work is functionally complete, follows the major architecture conventions, and has meaningful test coverage where it matters most. It falls short of an A due to one oversized component, some coupling patterns, and a few style inconsistencies.

---

## Scorecard

| Category | Grade | Weight | Notes |
|---|---|---|---|
| Architecture adherence | **A−** | High | Hooks own data; components consume; query keys are centralized |
| Separation of concerns | **B** | High | `useGoalAssociationMutations` is clean, but `ActivityAssociator.jsx` mixes UI, state, tree-building, and side-effects |
| Code size / modularity | **C+** | Medium | `ActivityAssociator.jsx` at 1125 lines is a clear outlier |
| Data flow / TanStack Query usage | **A** | High | Canonical query keys, proper `invalidateQueries`, optimistic `setQueryData` in the session hook |
| CSS quality | **A−** | Medium | CSS Modules, design tokens, well-organized; a few inline styles leak into JSX |
| Test coverage | **B+** | High | Three focused test files covering the hooks and modal; no tests for `ActivityAssociator.jsx` itself |
| Error handling | **B+** | Medium | `try/catch` with `notify.error` consistently, but some `catch` blocks are bare |
| API / persistence patterns | **A−** | Medium | Uses `setGoalAssociationsBatch` and `setActivityGoals` via the centralized API module; invalidation is coherent |
| Naming & readability | **B+** | Low | Generally clear; some helpers like `resolveLinkedGroupNameForActivity` are descriptive but deeply nested |

---

## What's Done Well

### 1. Query-first data flow ✅
Both mutation hooks (`useGoalAssociationMutations`, `useSessionDetailGoalAssociations`) follow the architecture standard:

> `page/component → query hook or mutation hook → shared query key → API module`

Cache updates use `queryClient.setQueryData` for instant feedback, followed by `invalidateQueries` for correctness — exactly the optimistic pattern recommended in `index.md`.

### 2. Centralized query keys ✅
All query key references go through `queryKeys.*`. No ad-hoc cache key strings.

### 3. Clean hook decomposition ✅
The separation between `useGoalAssociationMutations` (goal-detail context: create/edit modes, batch persistence) and `useSessionDetailGoalAssociations` (session context: activity-to-goal association) is thoughtful. Each hook answers a distinct question:
- *"What activities/groups are associated with this goal?"* → `useGoalAssociationMutations`
- *"What goals can this activity be associated with in this session?"* → `useSessionDetailGoalAssociations`

### 4. Business-aware `persistAssociations` ✅
`useGoalAssociationMutations.persistAssociations` correctly filters to only `isDirectActivityAssociation` before sending to the API — inherited activities are not sent as writes. This is a subtle domain rule implemented correctly.

### 5. Meaningful tests ✅
- `useGoalAssociationMutations.test.jsx` covers the persist path, create-mode buffering, and the critical inherited-vs-direct filter.
- `useSessionDetailGoalAssociations.test.jsx` verifies flattened available goals, cache updates, and invalidation breadth.
- `ActivityAssociationModal.test.jsx` tests rehydration on reopen and async-close-after-persist sequencing.

### 6. CSS Modules with design tokens ✅
Both CSS files use CSS Modules (the architecture standard) and reference `var(--color-*)` design tokens consistently.

---

## Issues & Recommendations

### 🔴 Critical — `ActivityAssociator.jsx` is too large (1125 lines)

This is the single biggest issue. The component owns:
- 12+ `useState` hooks and 3+ `useRef`s
- Tree-building logic (`buildGroupTree`, `buildRelevantTree`, `getGroupDepth`)
- Inheritance logic (parent/child activity merging)
- Side-effects (`handleCreateGroup` with API calls + cache + events)
- Rendering (mini-cards, group containers, discovery area, inline group creator)
- Confirmation dialogs (pending removal modal)

> [!IMPORTANT]
> `index.md` explicitly states: *"Large multi-mode components were decomposed into coordinators plus focused subcomponents/hooks."* This component is exactly the kind of thing that rule was written to prevent.

**Recommended decomposition:**
1. **`useActivityAssociatorState.js`** — owns the 12+ state variables and refs
2. **`useActivityGroupTree.js`** — `buildGroupTree`, `buildRelevantTree`, `getGroupDepth`, group breadcrumbs
3. **`ActivityMiniCard.jsx`** — the `renderMiniCard` render function (~85 lines)
4. **`ActivityGroupContainer.jsx`** — the `renderGroupContainer` render function (~60 lines)
5. **`InlineGroupCreator.jsx`** — the inline group creation form (~45 lines)

### 🟡 Medium — `window.dispatchEvent` as a side-channel

`ActivityAssociator.jsx` fires `CustomEvent`s (`goalAssociationsChanged`, `activityAssociationsChanged`) on `window` in **4 places**. `useGoalAssociationMutations.js` fires the same event in a 5th place.

This is an escape hatch from TanStack Query's own invalidation system. When the same file also calls `onSave` (which itself calls `invalidateGoalAssociationQueries`), the double invalidation means two network round-trips for the same data.

> [!WARNING]
> `index.md` says: *"Do not add new manual fetch/state machines if a query hook should own the data."* `window.dispatchEvent` is effectively a manual event bus that duplicates what `queryClient.invalidateQueries` already does.

**Recommendation:** Audit consumers of `goalAssociationsChanged` events. If they all just invalidate queries, replace them with the query invalidation itself and remove the custom events.

### 🟡 Medium — JSON.stringify for memoization keys in `useGoalAssociationMutations`

```js
const activityGroupsRawKey = JSON.stringify(activityGroupsRaw || []);
const initialActivitiesKey = JSON.stringify(initialActivities || []);
// ...
const normalizedActivityGroupsRaw = useMemo(
    () => parseSerializedItems(activityGroupsRawKey),
    [activityGroupsRawKey]
);
```

This JSON-serialize → parse round-trip is a creative solution to unstable array references, but it has two problems:
1. **Performance**: `JSON.stringify` on every render for potentially large arrays
2. **Semantic fragility**: field ordering in serialized objects affects key stability

**Recommendation:** Use a lightweight shallow-compare utility or accept stable references from the parent via `useMemo`.

### 🟡 Medium — Inline styles in JSX

`ActivityAssociator.jsx` has inline style objects in several places (lines 844, 867, 894, 898, 912, 924-933, 1003, 1044, 1073), despite having a 769-line CSS Module file that should house these.

For example:
```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
```

This directly contradicts the CSS Modules architecture. These should be moved into `ActivityAssociator.module.css`.

### 🟡 Medium — No test coverage for `ActivityAssociator.jsx`

The 1125-line component has **zero** test coverage. The hooks and the `ActivityAssociationModal` are tested, but the main surface — including group linking/unlinking, inheritance toggling, discovery mode, and the confirmation dialog — has no automated assertions.

### 🟢 Minor — Bare `catch` blocks

Several `catch` blocks in `ActivityAssociator.jsx` catch errors without logging them:
```js
} catch {
    notify.error('Failed to create group');
}
```
The error object should be captured and logged to `console.error` for debuggability, as the backend services do.

### 🟢 Minor — `eligibleParentGroups` useMemo has a stale closure

```js
const eligibleParentGroups = useMemo(() => {
    return sortGroupsTreeOrder((activityGroups || []).filter(g => getGroupDepth(g.id) < 2));
}, [activityGroups]); // ← missing getGroupDepth in deps
```

`getGroupDepth` is a regular function, rebuilt every render, so the dep array is technically incomplete. In practice it works because `activityGroups` is the only input that matters, but ESLint's `exhaustive-deps` rule would flag this.

### 🟢 Minor — Redundant default export + named export

Both `useGoalAssociationMutations.js` and `useSessionDetailGoalAssociations.js` have:
```js
export function useSessionDetailGoalAssociations(...) { ... }
export default useSessionDetailGoalAssociations;
```

Pick one export style and stick with it. The codebase convention in `index.md` doesn't mandate either, but consistency helps.

### 🟢 Minor — Dead CSS

`ActivityAssociationModal.module.css` defines `.modalOverlay`, `.modalContent`, `.modalHeader`, and `.closeButton` classes (lines 1–47), but the component uses the shared `Modal`, `ModalBody`, `ModalFooter` atoms instead. These selectors appear to be dead CSS from before the atom migration.

---

## Architecture Adherence Summary

| Rule from `index.md` | Adherence |
|---|---|
| *"TanStack Query is the canonical remote-data layer."* | ✅ Fully compliant |
| *"Query keys are centralized in `queryKeys.js`"* | ✅ Fully compliant |
| *"Large multi-mode components → coordinators + focused subcomponents/hooks"* | ❌ `ActivityAssociator.jsx` violates this |
| *"Do not add new manual fetch/state machines if a query hook should own the data"* | ⚠️ `window.dispatchEvent` side-channel |
| *"Keep route files thin, service logic testable, and serializer behavior centralized"* | ✅ API calls go through `fractalApi` |
| *"Prefer explicit rollback-safe optimistic behavior, or use invalidate-and-refetch"* | ✅ Using `setQueryData` + `invalidateQueries` |
| *"Prefer extending existing query-key families over inventing one-off cache keys"* | ✅ All invalidations use canonical key families |

---

## Final Assessment

The **hooks layer** (`useGoalAssociationMutations`, `useSessionDetailGoalAssociations`, `goalDetailQueryUtils`) is genuinely well-done — clean, testable, properly integrated with TanStack Query, and respecting domain rules. The **test coverage** for these hooks is targeted and meaningful.

The **main drag on the grade** is `ActivityAssociator.jsx` — it's a 1125-line monolith that houses state, logic, tree-building, API calls, event dispatch, and rendering all in one file. Breaking it apart would improve testability, readability, and alignment with the architecture goals already stated in `index.md`.

Think of it as: the groundwork is A-grade, but the surface component needs the same decomposition treatment that other large components in the codebase have already received.
