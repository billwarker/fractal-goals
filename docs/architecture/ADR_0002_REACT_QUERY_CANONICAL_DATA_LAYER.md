# ADR 0002: React Query As The Canonical Client Data Layer

## Status

Accepted

## Date

March 7, 2026

## Context

The frontend historically mixed several patterns for loading and synchronizing server state:

- direct API calls inside components
- context-owned fetch/mutate flows
- local mirrored state used as a cache substitute
- React Query hooks in newer surfaces

That mixture caused cache drift, duplicated query keys, manual array patching, and regressions where UI surfaces stopped refreshing after mutations.

Recent refactoring has moved high-risk goal/session surfaces toward React Query and introduced shared query keys plus invalidation helpers.

## Decision

React Query is the canonical client data layer for server-backed state.

That means:

- New read paths should use query hooks rather than direct component fetches.
- Mutation flows should prefer invalidation/refetch semantics over ad hoc local reconciliation unless optimistic rollback is explicit.
- Query keys should be defined centrally and reused rather than handwritten across components and contexts.
- Contexts may still coordinate UI state and actions, but they should not become bespoke cache layers.

## Consequences

### Positive

- Cache consistency improves because mutations can invalidate shared query families.
- Server-state logic becomes easier to test in isolation.
- Components can focus more on orchestration and rendering than fetch lifecycle code.

### Negative

- Some existing contexts and legacy surfaces need migration work to fully align with this decision.
- Teams need discipline around shared query keys and mutation invalidation patterns.

## Follow-up

- Continue replacing handwritten query-key strings with `client/src/hooks/queryKeys.js`.
- Extract oversized server-state coordinators, especially goal/session surfaces, into dedicated hooks over time.
- Add regression coverage around invalidation-sensitive flows as the migration continues.
