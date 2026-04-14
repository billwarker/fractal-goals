# Plan: Simplified Progress System with Auto-Aggregation Display

## Context

The current progress system requires users to manually pick a `progress_aggregation` comparison method per metric/activity. This adds friction and cognitive overhead. The new design **removes that choice** — instead, the system auto-detects the right aggregation from the metric's structural properties (`is_additive`, `is_multiplicative`) and always shows all relevant progress summaries on every activity card.

The feature also adds a **"best set"** indicator on every activity card that shows the best individual set result at a glance.

---

## Database Grade

**Current grade: B**

The schema already has `is_additive`, `is_multiplicative`, `is_best_set_metric`, and `progress_aggregation` fields, which gives us the foundation. However:
- `progress_aggregation` being user-configurable adds unnecessary complexity
- `ActivityDefinition.progress_aggregation` + `MetricDefinition.progress_aggregation` creates redundant configuration layers
- `is_best_set_metric` is a useful user-controlled override (e.g., weight matters more than reps for best-set selection) — keep as-is

**Target grade: S+** — simplify config, auto-derive everything, surface richer per-card data.

---

## Goal

Auto-compute all meaningful progress aggregations from metric types. Display them all on each activity card in both the session detail view (`SessionActivityItem`) and the sessions list (`ActivityCard`). Remove user-facing aggregation configuration. Add best-set display.

---

## Rules for Auto-Aggregation

| Metric type | Aggregation shown |
|---|---|
| Additive metric(s) | **Total** = sum of values across all sets |
| Multiplicative metric(s) | **Yield per set** = product of all multiplicative metrics for that set; **Total yield** = sum of per-set yields |
| Mixed (both additive + multiplicative) | Show total for additives; show yield for multiplicatives |
| Single non-additive metric | Show "best set" value (max or min based on `higher_is_better`) |

**Best set:** The set with the highest yield (if multiplicative metrics exist), unless the user has designated a specific metric via `is_best_set_metric` — in which case, the set with the best value on that metric (respecting `higher_is_better`) determines the best set. For additive/single-metric activities, the set with the best single metric value (per `higher_is_better`).

---

## Implementation Plan

### Phase 1 — Backend: Auto-compute multi-aggregation in progress service

**File:** `services/progress_service.py`

1. Add `_compute_auto_aggregations(instance, metrics, sets)` method that returns a dict:
   ```python
   {
     "additive_totals": { metric_id: total_value, ... },           # sum across sets per additive metric
     "yield_per_set": [ { "set_index": i, "yield": float }, ... ], # product of multiplicative metrics per set
     "total_yield": float,                                          # sum of per-set yields
     "best_set_index": int,                                         # determined by: is_best_set_metric metric (if any), else highest yield, respecting higher_is_better
     "best_set_yield": float,                                       # yield of best set (if multiplicative)
     "best_set_values": { metric_id: value, ... },                  # metric values in best set
   }
   ```

   **Best set resolution logic:**
   - If any metric has `is_best_set_metric=True`: find the set with the best value on that metric (using `higher_is_better`)
   - Otherwise if multiplicative metrics exist: find the set with the highest yield
   - Otherwise: find the set with the best value on the sole/primary metric (using `higher_is_better`)

2. Call this method inside `_build_comparison()` and include `auto_aggregations` in the returned `derived_summary`.

3. Modify `_resolve_aggregation()` to no longer cascade through user-configured `progress_aggregation` for the *display layer* — keep it for comparison purposes but the card display always shows all modes.

4. In `compute_live_comparison()` and `compute_final_progress()`, ensure `derived_summary` includes `auto_aggregations`.

### Phase 2 — Backend: Serializer update

**File:** `services/serializers.py` or `services/view_serializers.py`

Ensure `derived_summary` (including `auto_aggregations`) is included in the serialized ProgressRecord response and in live comparison responses.

### Phase 3 — Backend: Remove user-facing aggregation config (optional, non-breaking)

- Keep `progress_aggregation` fields in DB for backward compat, but stop using them as display config.
- The backend still uses aggregation internally for historical ProgressRecord comparisons, so don't remove the DB column.
- No migration needed.

### Phase 4 — Frontend: Update `ActivityCard.jsx` (sessions list)

**File:** `client/src/components/sessions/ActivityCard.jsx`

Add a new section below existing metric rows:

```
[Activity Name]          ✓ Completed  2:30

  Set 1: 100kg × 8 = 800      ↑ from 720
  Set 2:  95kg × 8 = 760
  Set 3:  90kg × 6 = 540

  Total yield: 2,100          ↑12% from 1,875
  Best set: Set 1 — 100kg × 8 = 800
```

Specifically:
1. Read `progressComparison.derived_summary.auto_aggregations` (or compute client-side from sets data if not present).
2. Render **additive totals row** if any metric has `is_additive`.
3. Render **yield per set** and **total yield** rows if any metric has `is_multiplicative`.
4. Render **best set badge** — a compact inline chip showing set number and key values.
5. Keep `ProgressHint` (▲/▼%) adjacent to totals.

### Phase 5 — Frontend: Update `SessionActivityItem.jsx` (session detail)

**File:** `client/src/components/sessionDetail/SessionActivityItem.jsx`

1. After the existing per-set metric rows, add a summary bar:
   - **Additive totals** row (e.g., "Total volume: 2,100 kg")
   - **Total yield** (if multiplicative metrics)
   - **Best set highlight** — visually distinguish the best-performing set row (using `is_best_set_metric` + `higher_is_better` logic)
2. Remove or hide the aggregation method selector in the detail view (was shown per metric in some flows).
3. Keep per-set progress hints (▲/▼) as they are.

### Phase 6 — Frontend: Remove aggregation picker from ActivityBuilder

**Files:**
- `client/src/components/activityBuilder/ActivityMetricsSection.jsx`
- `client/src/utils/activityBuilder.js`

1. Remove the `progress_aggregation` dropdown from the metric configuration UI.
2. Remove the activity-level `progressAggregation` selector if one exists.
3. Keep `is_multiplicative`, `is_additive`, `higher_is_better`, and `is_best_set_metric` flags as they drive auto-detection.
4. Update `buildActivityPayload()` to no longer send `progress_aggregation`.

### Phase 7 — Frontend: Client-side auto-aggregation utility

**File:** `client/src/utils/progressAggregations.js` (new small utility)

```js
// Given sets data and metric definitions, compute:
// - additive totals per metric
// - yield per set (product of multiplicative metrics)
// - total yield
// - best set index and values
export function computeAutoAggregations(sets, metricDefs) { ... }
```

This allows `ActivityCard` and `SessionActivityItem` to compute aggregations client-side from live data, so the display works even before a ProgressRecord is persisted.

---

## Critical Files

| File | Change |
|---|---|
| `services/progress_service.py` | Add `_compute_auto_aggregations()`, include in `derived_summary` |
| `services/serializers.py` | Ensure `derived_summary` / `auto_aggregations` is serialized |
| `client/src/components/sessions/ActivityCard.jsx` | Add total/yield/best-set summary section |
| `client/src/components/sessionDetail/SessionActivityItem.jsx` | Add summary bar, best-set highlight, remove aggregation picker |
| `client/src/components/activityBuilder/ActivityMetricsSection.jsx` | Remove `progress_aggregation` dropdown |
| `client/src/utils/activityBuilder.js` | Remove `progress_aggregation` from payload builder |
| `client/src/utils/progressAggregations.js` | New client-side aggregation utility |

---

## Reusable Existing Code

- `getBestSetIndexes()` in `SessionActivityItem.jsx` — reuse for best-set detection
- `ProgressHint` component in `ActivityCard.jsx` — reuse for total/yield deltas
- `_resolve_yield()` in `progress_service.py` — reuse logic for per-set yields
- `_resolve_is_additive()` in `progress_service.py` — reuse for sum logic
- `metricProgressById` map construction in `SessionActivityItem.jsx` — extend for auto-agg data

---

## Verification

1. Create an activity with 2+ multiplicative metrics (e.g., weight + reps). Complete a session with multiple sets. Verify:
   - Per-set yields shown on card
   - Total yield shown
   - Best set highlighted
2. Create an activity with 1 additive metric (e.g., distance). Complete multiple sets. Verify:
   - Total sum shown
   - Best set (best value) shown
3. Complete a second session for each. Verify ▲/▼ progress indicators show on totals.
4. Open ActivityBuilder. Verify the aggregation method picker is gone.
5. Check Sessions list page — same summaries appear in collapsed/expanded cards.
6. Run `./run-tests.sh frontend` and `./run-tests.sh backend` — no regressions.
