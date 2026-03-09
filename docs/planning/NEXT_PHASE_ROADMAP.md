# Next Phase Roadmap

This document captures the next focused roadmap after the completed A+ / S-rank quality pass.

The goal of this phase is not another broad refactor. It is to stabilize the live product, harden production behavior, and improve user-facing quality.

## Priorities

### Phase 1: Stabilization

1. Add an end-to-end smoke suite for the highest-risk flows:
   login, load root, open session detail, save session changes, create goal, update goal.
2. Add startup and config verification that fails fast on bad environment selection, missing database configuration, bad JWT settings, or invalid API target assumptions.
3. Improve backend error visibility with cleaner logs, request IDs, and better diagnosis for `500`-class failures.
4. Validate migrations in real development and staging-like environments, not only freshly created test databases.
5. Audit the auth and token lifecycle end to end:
   login, refresh, logout, expired token handling, and invalid token handling.

### Phase 2: Production Hardening

6. Review secrets and environment handling across development, testing, and production.
7. Tighten production defaults for CORS, JWT, and security headers.
8. Add abuse-case and rate-limit coverage for auth and high-write endpoints.
9. Add backup, restore, and rollback documentation for database changes.
10. Add health and readiness checks that validate both database reachability and migration state.
11. Document deploy-time migration strategy:
    when migrations run, how failures surface, and how rollback works.
12. Add monitoring coverage:
    Sentry, backend error alerting, and a minimal operational dashboard.

### Phase 3: Performance

13. Profile the heaviest real user flows:
    fractal load, session detail, analytics, and logs.
14. Add frontend bundle analysis and identify the next code-splitting wins.
15. Add backend endpoint timing for the slowest reads and writes.
16. Revisit query-budget thresholds against real-world data sizes.
17. Trim any remaining over-fetched payloads in session detail and analytics.
18. Add pagination or incremental loading anywhere large datasets still hit the UI at once.

### Phase 4: Product Quality

19. Improve empty, loading, and failure states on the core pages.
20. Standardize user-facing error messages so they are clear and consistent.
21. Add a first-run path for brand-new users with no fractals or sessions.
22. Audit responsive behavior on the highest-frequency daily-use flows.
23. Add safer undo or recovery affordances for destructive actions where practical.
24. Review accessibility basics:
    keyboard flow, focus management, labels, contrast, and modal behavior.

### Phase 5: Confidence And Maintainability

25. Add a thin full-confidence CI or nightly suite that combines backend integration, frontend tests, and smoke checks.
26. Set coverage targets for business-critical paths rather than only broad global coverage.
27. Add a lightweight architecture review checklist for future changes:
    query keys, service boundaries, validation, tests, and no generated artifacts.
28. Keep `index.md` and the ADR/docs set current when major architectural changes land.

## Suggested Execution Order

If time is limited, do these first:

1. Items `1-5`
2. Items `10-12`
3. Items `13-18`
4. Items `19-24`

## Success Criteria

This roadmap is successful when:

- critical flows are covered by smoke tests
- configuration failures surface immediately and clearly
- production deployment and migration behavior are documented and predictable
- the heaviest user flows are profiled and tuned with real measurements
- the UI feels more polished, resilient, and understandable during empty/loading/error states
