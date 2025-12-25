# Data Integrity Strategy for Activity Metric Schema Changes

## Problem Statement

When an activity's metric definitions are modified (metrics added, removed, or changed), 
existing session data can contain metric values that reference metric_ids that no longer 
exist in the activity definition. This creates "orphaned" metrics that display as `: value` 
without labels.

## Current Architecture

### What You Have:
1. **Relational Tables** (defined but not fully used):
   - `ActivityDefinition` - defines activity types
   - `MetricDefinition` - defines metrics for activities
   - `ActivityInstance` - instances of activities in sessions
   - `MetricValue` - actual metric values recorded

2. **JSON Storage** (currently used):
   - `PracticeSession.session_data` - stores all session data as JSON
   - Includes activity instances and metric values inline
   - No referential integrity constraints

### Current Behavior:
- ✅ Flexible and easy to query
- ✅ Fast reads (no joins needed)
- ❌ No referential integrity
- ❌ Orphaned metrics when definitions change
- ❌ Can't enforce constraints at database level

## Solution Options

### Option 1: Full Relational with Soft Deletes ⭐ RECOMMENDED

**Implementation:**
1. Migrate session activity data from JSON to relational tables
2. Add soft delete columns to `MetricDefinition`:
   - `deleted_at` (DateTime, nullable)
   - `is_active` (Boolean, default True)
3. Add `ON DELETE RESTRICT` to `MetricValue.metric_definition_id`
4. When "deleting" a metric, mark it inactive instead

**Workflow:**
```
User edits activity → Removes metric → 
  ↓
Check if metric has recorded values →
  ↓
If YES: Soft delete (mark inactive, keep definition)
If NO: Hard delete (remove from database)
  ↓
New activities only show active metrics
Old sessions still reference the metric definition
```

**Benefits:**
- ✅ **Complete data integrity**: Database enforces all relationships
- ✅ **Historical preservation**: Old data always has context
- ✅ **Prevents orphans**: Can't delete metrics with recorded values
- ✅ **Query power**: Can analyze metrics across all sessions with SQL
- ✅ **Migration support**: Can update metric names/units and migrate data

**Drawbacks:**
- ⚠️ Requires migration of existing JSON data
- ⚠️ More complex queries (need joins)
- ⚠️ Slightly slower writes (multiple inserts vs. one JSON update)

**Migration Path:**
1. Add new columns to `MetricDefinition`
2. Run migration script to convert existing JSON to relational
3. Update frontend to use relational endpoints
4. Keep JSON as backup/cache for performance

---

### Option 2: Hybrid Approach (JSON + Snapshots)

**Implementation:**
1. Keep JSON storage for session data
2. Add metric snapshot to session data:
   ```json
   {
     "metric_id": "abc-123",
     "name": "Speed",      // Snapshot at time of recording
     "unit": "bpm",        // Snapshot at time of recording
     "value": 120
   }
   ```
3. Display uses snapshot if definition is missing

**Benefits:**
- ✅ Minimal changes to current architecture
- ✅ Historical context preserved
- ✅ Fast queries (still JSON)
- ✅ Works with existing data

**Drawbacks:**
- ⚠️ Data duplication (name/unit stored in both places)
- ⚠️ No database-level integrity
- ⚠️ Can't easily update historical metric names
- ⚠️ Harder to query metrics across sessions

---

### Option 3: Current Approach + Cleanup Tools

**Implementation:**
1. Keep current JSON approach
2. Add UI warnings when deleting metrics with recorded values
3. Provide cleanup tool to remove orphaned metric values
4. Continue filtering orphaned metrics in display (already done)

**Benefits:**
- ✅ No migration needed
- ✅ Works with existing code
- ✅ Simple to understand

**Drawbacks:**
- ⚠️ Manual intervention required
- ⚠️ No automatic integrity
- ⚠️ Risk of data loss if user isn't careful
- ⚠️ Orphaned data accumulates over time

---

## Detailed Recommendation: Option 1 Implementation

### Phase 1: Schema Updates

```python
# Add to MetricDefinition
deleted_at = Column(DateTime, nullable=True)
is_active = Column(Boolean, default=True)

# Update MetricValue foreign key
metric_definition_id = Column(
    String, 
    ForeignKey('metric_definitions.id', ondelete='RESTRICT'),
    nullable=False
)
```

### Phase 2: API Changes

**Update Activity Endpoint:**
```python
@api_bp.route('/<root_id>/activities/<activity_id>', methods=['PUT'])
def update_activity(root_id, activity_id):
    # When updating metrics
    if 'metrics' in data:
        # Check which metrics are being removed
        current_metrics = session.query(MetricDefinition).filter_by(
            activity_id=activity_id
        ).all()
        
        new_metric_ids = [m.get('id') for m in data['metrics'] if m.get('id')]
        
        for metric in current_metrics:
            if metric.id not in new_metric_ids:
                # Check if metric has recorded values
                has_values = session.query(MetricValue).filter_by(
                    metric_definition_id=metric.id
                ).first() is not None
                
                if has_values:
                    # Soft delete
                    metric.deleted_at = datetime.now()
                    metric.is_active = False
                else:
                    # Hard delete
                    session.delete(metric)
```

**Add Migration Endpoint:**
```python
@api_bp.route('/<root_id>/sessions/<session_id>/migrate', methods=['POST'])
def migrate_session_to_relational(root_id, session_id):
    """
    Migrate a session's JSON data to relational tables.
    This is a one-time operation per session.
    """
    # Implementation in proposed_schema_changes.py
```

### Phase 3: Frontend Updates

**Activity Builder:**
- Show warning when removing metrics with recorded values
- Indicate which metrics are "archived" (soft deleted)
- Allow viewing archived metrics for historical context

**Session Display:**
- Query from relational tables instead of JSON
- Show inactive metrics with special styling (e.g., grayed out)
- Provide option to "clean up" old sessions by removing inactive metrics

### Phase 4: Migration Strategy

**For Existing Data:**
1. Run migration script on all existing sessions
2. Keep JSON as backup for 30 days
3. Verify data integrity
4. Remove JSON backup after verification

**For New Data:**
1. All new sessions use relational tables
2. JSON is generated on-the-fly for API responses (for backwards compatibility)
3. Gradually phase out JSON dependency

---

## Quick Win: Immediate Improvement

While planning the full migration, you can implement this quick fix:

**Add Warning When Editing Activities:**
```javascript
// In ManageActivities.jsx
const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (editingId) {
        // Check if metrics are being removed
        const originalActivity = activities.find(a => a.id === editingId);
        const removedMetrics = originalActivity.metric_definitions.filter(
            oldMetric => !metrics.find(newMetric => newMetric.id === oldMetric.id)
        );
        
        if (removedMetrics.length > 0) {
            const confirmed = window.confirm(
                `Warning: Removing ${removedMetrics.length} metric(s). ` +
                `This may affect existing session data. Continue?`
            );
            if (!confirmed) return;
        }
    }
    
    // Continue with update...
};
```

---

## Summary

**For Maximum Data Integrity:**
→ Implement Option 1 (Full Relational with Soft Deletes)

**For Quick Fix:**
→ Add warning dialog + continue with current filtering approach

**Timeline Suggestion:**
1. **Now**: Add warning dialog (1 hour)
2. **This week**: Plan migration strategy
3. **Next sprint**: Implement relational schema
4. **Following sprint**: Migrate existing data

The relational approach is the gold standard for data integrity and will make your 
application more robust as it grows. The soft delete strategy ensures you never lose 
historical context while maintaining clean, active metric definitions.
