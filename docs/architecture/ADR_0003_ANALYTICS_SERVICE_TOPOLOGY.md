# ADR 0003: Analytics Service Topology

## Status

Accepted

## Date

June 29, 2026

## Context

Analytics now spans several service modules. That is intentional, but the
ownership boundaries need to be explicit so new charts and query features do
not recreate competing read paths.

## Decision

Use these backend ownership boundaries:

- `services/analytics_engine.py` owns the user-wide governed SQL/query layer,
  tenant-safe catalog CTEs, saved query profiles, query execution, and result
  caching.
- `services/dashboard_service.py` owns saved analytics objects and dashboard
  or view persistence. It does not compute chart data.
- `services/session_analytics_service.py` owns legacy/root-scoped session and
  activity read models still needed by existing visualizations, landing publish,
  and FlowTree metrics until their equivalents are catalog-backed.
- `services/goal_analytics_service.py` owns the older goal analytics summary
  endpoint and should stay narrow while charts migrate to the engine.
- `services/goal_target_service.py` owns target-specific analytics because it
  shares target evidence rules with target CRUD and evaluation.
- `services/analytics_cache.py` and `services/analytics_query_cache.py` own
  cache plumbing only.

Frontend chart profiles should prefer catalog-backed query profiles whenever
the catalog exposes the needed fields. Read-model-backed visualizations must be
labeled as such in `visualizationQueryExplanations.js` and must not offer SQL
console handoff until the backend catalog can run the equivalent query.

## Consequences

- New analytics surfaces have a single default path: catalog-backed query
  profile, saved as an analytics view when appropriate.
- Existing handcrafted charts can remain while they are actively migrated, but
  they need an explicit explanation and should not grow new service-specific
  data contracts.
- Dashboard/view persistence stays separate from query execution, keeping saved
  layout state from becoming a hidden analytics engine.

## Follow-up

- Migrate the remaining `read_model_sql` visualizations to catalog-backed SQL.
- Keep catalog additions tenant-policy-first: new datasets must inject
  authenticated-user ownership constraints server-side.
- Remove legacy summary endpoints only after their chart and landing consumers
  have catalog-backed replacements.
