# Fractal Metrics Library Feature Spec

## Context

Currently, metric definitions (name, unit, is_multiplicative, etc.) are created inline within each activity. "Reps" gets re-defined for every weightlifting activity — no consistency, no reuse. The existing `MetricDefinition` model is tightly coupled to a single `activity_id`.

**Existing DB Grade: C**
- Metrics can't be shared across activities
- Name/unit are free text — no deduplication or consistency
- `is_multiplicative` lives on a per-activity row but logically belongs to the metric concept
- No predefined values, input constraints, display hints, or descriptions
- Activity creation forces re-typing identical metrics repeatedly

**Target: S+ Grade**
Introduce a fractal-scoped metrics library. `MetricDefinition` becomes a join table. Metrics carry full semantic config. Activity builder uses a selector. Management gets a dedicated first-class modal on the ManageActivities page.

---

## Metric Config Fields (on `fractal_metric_definitions`)

| Field | Type | Notes |
|---|---|---|
| `name` | String, required | e.g. "Reps" |
| `unit` | String, required | e.g. "reps", "lbs", "km" |
| `is_multiplicative` | Boolean, default True | When True, this metric can be multiplied with other is_multiplicative metrics on the same activity to derive a computed value on the fly (e.g. Reps × Weight = Volume). Not stored — computed at render/analytics time. |
| `is_additive` | Boolean, default True | When True, values for this metric can be summed across sets/sessions (e.g. total reps across sets). When False, use last/max instead (e.g. 1RM). |
| `input_type` | Enum, default `number` | `number`, `integer`, `duration` (renders MM:SS input). Controls frontend input widget. |
| `default_value` | Float, nullable | Pre-fill session input with this value |
| `higher_is_better` | Boolean, nullable | Analytics hint: trend up = green, or trend down = green. Null = neutral. |
| `predefined_values` | JSON (array of floats), nullable | Quick-pick buttons in session UI (e.g. [5, 8, 10, 12, 15]) |
| `min_value` | Float, nullable | Soft input validation lower bound |
| `max_value` | Float, nullable | Soft input validation upper bound |
| `description` | String, nullable | Tooltip in picker and manage view |
| `sort_order` | Integer, default 0 | User-controlled ordering |
| `is_active` | Boolean, default True | Soft-hide without delete |
| `created_at`, `updated_at`, `deleted_at` | DateTime | Standard soft-delete pattern |

---

## Database Changes

### New table: `fractal_metric_definitions`

All fields above, with `root_id FK → goals.id ON DELETE CASCADE`.

### Changed: `metric_definitions` table

Add `fractal_metric_id FK → fractal_metric_definitions.id` (nullable initially for migration safety).
Keep `name`/`unit`/`is_multiplicative` columns temporarily for backward-compat reads; they become derived from the fractal metric going forward.

### Migration (single Alembic revision)
1. Create `fractal_metric_definitions` table.
2. For each existing `MetricDefinition` row, create a `FractalMetricDefinition` (copy name, unit, is_multiplicative, root_id). Deduplicate by name+unit+root_id so shared names get one fractal-scoped record.
3. Back-fill `fractal_metric_id` on all `metric_definitions` rows.
4. Add FK constraint (nullable initially).

---

## Backend

### New model: `FractalMetricDefinition` (`models/activity.py`)
Same soft-delete, index, and UUID pattern as `ActivityMode`.

### Service methods on `ActivityService` (`services/activity_service.py`)
Mirror activity-modes methods exactly:
- `list_fractal_metrics(root_id)` — filter `deleted_at IS NULL`, order by `sort_order`
- `create_fractal_metric(root_id, payload)` — validate name+unit required, unique per root, auto sort_order, emit event
- `update_fractal_metric(root_id, metric_id, payload)` — partial update, ownership check, emit event
- `delete_fractal_metric(root_id, metric_id)` — soft delete; return usage warning if attached to active activities

### Validators (`validators.py`)

```python
class FractalMetricCreateSchema(BaseModel):
    name: str
    unit: str
    is_multiplicative: bool = True
    is_additive: bool = True
    input_type: str = "number"          # "number" | "integer" | "duration"
    default_value: Optional[float] = None
    higher_is_better: Optional[bool] = None
    predefined_values: Optional[List[float]] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    description: Optional[str] = None

class FractalMetricUpdateSchema(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    is_multiplicative: Optional[bool] = None
    is_additive: Optional[bool] = None
    input_type: Optional[str] = None
    default_value: Optional[float] = None
    higher_is_better: Optional[bool] = None
    predefined_values: Optional[List[float]] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
```

### Serializer (`services/serializers.py`)

```python
def serialize_fractal_metric(m, activity_count=0):
    return {
        "id": m.id,
        "name": m.name,
        "unit": m.unit,
        "is_multiplicative": m.is_multiplicative,
        "is_additive": m.is_additive,
        "input_type": m.input_type,
        "default_value": m.default_value,
        "higher_is_better": m.higher_is_better,
        "predefined_values": m.predefined_values,
        "min_value": m.min_value,
        "max_value": m.max_value,
        "description": m.description,
        "sort_order": m.sort_order,
        "activity_count": activity_count,
    }
```

Update `serialize_metric_definition` to join through to the fractal metric record — all existing consumers continue receiving `name`, `unit`, `is_multiplicative`, etc. transparently with no frontend changes required elsewhere.

### API routes (`blueprints/activities_api.py`)
Follow exact pattern of activity-modes routes:
```
GET    /<root_id>/fractal-metrics
POST   /<root_id>/fractal-metrics
PUT    /<root_id>/fractal-metrics/<metric_id>
DELETE /<root_id>/fractal-metrics/<metric_id>
```

### Update `ActivityService.create_activity` / `update_activity`
Accept metric references by `fractal_metric_id`. Attaching creates the `MetricDefinition` join row; removing soft-deletes the join row (not the fractal metric).

---

## Frontend

### Query key (`client/src/hooks/queryKeys.js`)
```js
fractalMetrics: (rootId) => ['fractal-metrics', rootId],
```

### API client (`client/src/utils/api/fractalActivitiesApi.js`)
```js
getFractalMetrics: (rootId) => axios.get(`${API_BASE}/${rootId}/fractal-metrics`),
createFractalMetric: (rootId, data) => axios.post(`${API_BASE}/${rootId}/fractal-metrics`, data),
updateFractalMetric: (rootId, metricId, data) => axios.put(`${API_BASE}/${rootId}/fractal-metrics/${metricId}`, data),
deleteFractalMetric: (rootId, metricId) => axios.delete(`${API_BASE}/${rootId}/fractal-metrics/${metricId}`),
```

### Hooks (`client/src/hooks/useActivityQueries.js`)
Mirror `useActivityModes` / `useCreateActivityMode` / `useUpdateActivityMode` / `useDeleteActivityMode`:
- `useFractalMetrics(rootId)`
- `useCreateFractalMetric(rootId)`
- `useUpdateFractalMetric(rootId)`
- `useDeleteFractalMetric(rootId)` — also invalidates `queryKeys.activities(rootId)` on success

### New modal: `client/src/components/modals/ManageMetricsModal.jsx`
Mirror `ActivityModesModal.jsx` structure:
- Left: list of fractal metrics (name, unit, badges for is_multiplicative/is_additive/input_type, activity_count)
- Right: create/edit form with all config fields
  - name (required), unit (required)
  - is_multiplicative toggle + tooltip explanation
  - is_additive toggle + tooltip explanation
  - input_type selector (number / integer / duration)
  - default_value input
  - higher_is_better toggle (tri-state: yes / no / unset)
  - predefined_values (comma-separated number input → stored as JSON array)
  - min_value / max_value inputs
  - description textarea
- Delete with `DeleteConfirmModal` — show usage warning if `activity_count > 0`

### `ManageActivities.jsx`
Add **Manage Metrics** button directly to the left of **Manage Modes**:
```jsx
const [showMetricsModal, setShowMetricsModal] = useState(false);
// ...
<button onClick={() => setShowMetricsModal(true)} className={...}>Manage Metrics</button>
<button onClick={() => setShowModesModal(true)} className={...}>Manage Modes</button>
// ...
<ManageMetricsModal isOpen={showMetricsModal} onClose={() => setShowMetricsModal(false)} rootId={rootId} />
```

### `ActivityMetricsSection.jsx` refactor
Replace free-text name/unit inputs with a searchable selector listing `fractalMetrics` by name+unit.
- Bottom option: **+ Create new metric** → inline mini-form or small sub-modal
- Per-activity field that remains: `is_top_set_metric` toggle
- Remove `is_multiplicative` from builder (now read-only, shown from fractal metric record)
- New fields populated from fractal metric and shown read-only in picker: input_type, default_value hint

---

## Implementation Order

1. Alembic migration (new table + data backfill with deduplication)
2. `FractalMetricDefinition` model
3. Service methods (list/create/update/delete)
4. Validators + serializer (update `serialize_metric_definition` to join through)
5. API routes
6. Frontend: queryKeys + API client
7. Frontend: hooks
8. Frontend: `ManageMetricsModal`
9. Frontend: `ManageActivities` button
10. Frontend: `ActivityMetricsSection` selector refactor

---

## Verification

- Create a fractal metric via Manage Metrics modal; verify it appears in the list.
- Attach it to two activities via the activity builder picker.
- Record metric values for both activities in a session; verify values are stored and displayed.
- Rename the fractal metric; verify both activities reflect the new name with no re-configuration.
- Delete a metric in use → confirm usage warning appears.
- Delete a metric not in use → confirm it disappears from list and picker.
- Run `./run-tests.sh backend` and `./run-tests.sh frontend`.
