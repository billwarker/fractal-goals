# Activity Associator — Post-Audit Re-Review

**Previous Grade: B+ → Revised Grade: A−**

All 7 issues from the original audit have been addressed. The feature surface is now well-decomposed, architecturally compliant, and follows the patterns established in `index.md`.

---

## Issue Resolution Summary

| # | Original Issue | Severity | Status | Notes |
|---|---|---|---|---|
| 1 | `ActivityAssociator.jsx` monolith (1125 lines) | 🔴 Critical | ✅ Fixed | Reduced to **723 lines** via 4 extracted files |
| 2 | `window.dispatchEvent` side-channel | 🟡 Medium | ✅ Fixed | All 5 dispatch sites removed; relying on query invalidation only |
| 3 | `JSON.stringify` memoization keys | 🟡 Medium | ✅ Fixed | Replaced with `useStableNormalizedList` shallow-compare utility |
| 4 | Inline styles in JSX | 🟡 Medium | ✅ Fixed | Moved to CSS module classes; accent color via CSS custom property |
| 5 | Bare `catch` blocks | 🟢 Minor | ✅ Fixed | Error objects now captured and logged to `console.error` |
| 6 | `eligibleParentGroups` stale closure | 🟢 Minor | ✅ Fixed | `getGroupDepth` wrapped in `useCallback`; properly listed in deps |
| 7 | Dead CSS in `ActivityAssociationModal.module.css` | 🟢 Minor | ✅ Fixed | `.modalOverlay`, `.modalContent`, `.modalHeader`, `.closeButton` removed |

---

## Decomposition Quality

The extraction created 4 new focused files co-located with the coordinator:

| File | Lines | Responsibility |
|---|---|---|
| [ActivityMiniCard.jsx](file:///Users/will/Projects/fractal-goals/client/src/components/goalDetail/ActivityMiniCard.jsx) | 96 | Single activity card with inheritance indicators |
| [ActivityGroupContainer.jsx](file:///Users/will/Projects/fractal-goals/client/src/components/goalDetail/ActivityGroupContainer.jsx) | 82 | Recursive collapsible group container |
| [InlineGroupCreator.jsx](file:///Users/will/Projects/fractal-goals/client/src/components/goalDetail/InlineGroupCreator.jsx) | 60 | Inline group creation form |
| [useActivityAssociatorDerivedData.js](file:///Users/will/Projects/fractal-goals/client/src/components/goalDetail/useActivityAssociatorDerivedData.js) | 197 | Tree-building, display activities, counts, group utilities |

This follows the **coordinator + focused subcomponents + dedicated hook** pattern that `index.md` calls for. The coordinator (`ActivityAssociator.jsx`) now owns state and handlers while delegating rendering and derived computation.

---

## `useStableNormalizedList` Pattern

The new memoization utility in `useGoalAssociationMutations.js` replaces `JSON.stringify`/`JSON.parse` with a proper approach:

```
useStableNormalizedList(items, normalize?)
  → useMemo to normalize
  → ref-based shallow equality check (areItemListsEquivalent)
  → returns stable reference when content hasn't changed
```

This is both more performant and semantically correct — field ordering no longer affects stability.

---

## Updated Architecture Adherence

| Rule from `index.md` | Previous | Now |
|---|---|---|
| *"Large multi-mode components → coordinators + focused subcomponents/hooks"* | ❌ | ✅ |
| *"Do not add new manual fetch/state machines if a query hook should own the data"* | ⚠️ | ✅ |
| All other rules | ✅ | ✅ |

---

## Why A− and Not A

Two minor observations remain (neither warranting a deduction below A−):

1. **`ActivityAssociator.jsx` is still 723 lines** — this is reasonable for a coordinator that owns ~12 state variables and multiple async handlers, but it's at the upper end. If the component grows further, the handlers (`handleCreateGroup`, `handleInheritFromParentChange`) could be extracted into a dedicated hook.

2. **No unit tests for the new subcomponents** — `ActivityMiniCard`, `ActivityGroupContainer`, and `InlineGroupCreator` are pure presentation components that would benefit from simple render tests. The hooks and modal remain well-tested.

Neither of these is a blocking concern — they're the kind of incremental improvements that can happen naturally as the feature evolves.
