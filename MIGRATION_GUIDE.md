# Migration to Database-Only Architecture - Implementation Guide

## Status: Phase 1 Complete (Backend Ready)

### Completed Changes

#### Backend (✅ Complete)
1. **New Endpoints Added** (`/blueprints/sessions_api.py` lines 440-622):
   - `GET /<root_id>/sessions/<session_id>/activities` - Fetch all instances
   - `POST /<root_id>/sessions/<session_id>/activities` - Add instance
   - `DELETE /<root_id>/sessions/<session_id>/activities/<instance_id>` - Remove instance
   - `PUT /<root_id>/sessions/<session_id>/activities/<instance_id>/metrics` - Update metrics

2. **Removed Activity Sync**:
   - Session create: Removed `sync_session_activities` call (line ~300)
   - Session update: Removed `sync_session_activities` call (line ~378)
   - `session_data` now only stores UI metadata (section names, notes, order)

3. **Timer Endpoints** (Already existed, no changes needed):
   - Start/stop timer endpoints work independently
   - Create instance endpoint for initialization

#### Frontend API Client (✅ Complete)
- Added new methods to `/client/src/utils/api.js`:
  - `getSessionActivities(rootId, sessionId)`
  - `addActivityToSession(rootId, sessionId, data)`
  - `removeActivityFromSession(rootId, sessionId, instanceId)`
  - `updateActivityMetrics(rootId, sessionId, instanceId, data)`

### Phase 2: Frontend Migration (Next Steps)

#### SessionDetail.jsx Changes Needed

**Current Architecture:**
```javascript
// Activities stored in sessionData.sections[].exercises[]
const [sessionData, setSessionData] = useState({
  sections: [
    {
      name: "Warm Up",
      exercises: [  // ← Activities stored here in JSON
        {
          instance_id: "...",
          activity_id: "...",
          name: "...",
          metrics: [...],
          time_start: "...",
          // ... all activity data in JSON
        }
      ]
    }
  ]
});
```

**New Architecture:**
```javascript
// Activities fetched separately from database
const [sessionData, setSessionData] = useState({
  sections: [
    {
      name: "Warm Up",
      notes: "...",
      activity_ids: ["inst-1", "inst-2"]  // ← Just IDs for ordering
    }
  ]
});

const [activityInstances, setActivityInstances] = useState([
  // Fetched from GET /sessions/<id>/activities
  {
    id: "inst-1",
    activity_definition_id: "...",
    time_start: "...",
    time_stop: "...",
    metric_values: [...]
  }
]);
```

#### Key Changes Required

1. **Separate State Management**:
   ```javascript
   const [sessionData, setSessionData] = useState(null); // UI metadata only
   const [activityInstances, setActivityInstances] = useState([]); // From DB
   ```

2. **Fetch Activities Separately**:
   ```javascript
   useEffect(() => {
     const fetchActivities = async () => {
       const response = await fractalApi.getSessionActivities(rootId, sessionId);
       setActivityInstances(response.data);
     };
     fetchActivities();
   }, [rootId, sessionId]);
   ```

3. **Add Activity**:
   ```javascript
   const handleAddActivity = async (sectionIndex, activityDefId) => {
     // Call API to create instance
     const response = await fractalApi.addActivityToSession(rootId, sessionId, {
       activity_definition_id: activityDefId
     });
     
     // Add to local state
     setActivityInstances(prev => [...prev, response.data]);
     
     // Update section's activity_ids for ordering
     const updatedData = { ...sessionData };
     updatedData.sections[sectionIndex].activity_ids.push(response.data.id);
     setSessionData(updatedData);
   };
   ```

4. **Update Metrics**:
   ```javascript
   const handleMetricChange = async (instanceId, metrics) => {
     // Update in database
     await fractalApi.updateActivityMetrics(rootId, sessionId, instanceId, {
       metrics
     });
     
     // Update local state
     setActivityInstances(prev => prev.map(inst =>
       inst.id === instanceId
         ? { ...inst, metric_values: metrics }
         : inst
     ));
   };
   ```

5. **Remove Auto-Save of Activity Data**:
   ```javascript
   // OLD: Auto-save entire sessionData including activities
   useEffect(() => {
     if (!sessionData) return;
     const timeoutId = setTimeout(async () => {
       await fractalApi.updateSession(rootId, sessionId, {
         session_data: JSON.stringify(sessionData)  // ← Had activities
       });
     }, 1000);
     return () => clearTimeout(timeoutId);
   }, [sessionData]);
   
   // NEW: Only save UI metadata
   useEffect(() => {
     if (!sessionData) return;
     const timeoutId = setTimeout(async () => {
       await fractalApi.updateSession(rootId, sessionId, {
         session_data: JSON.stringify({
           sections: sessionData.sections.map(s => ({
             name: s.name,
             notes: s.notes,
             activity_ids: s.activity_ids  // ← Just IDs for ordering
           }))
         })
       });
     }, 1000);
     return () => clearTimeout(timeoutId);
   }, [sessionData]);
   ```

### Phase 3: Cleanup (After Frontend Migration)

1. **Remove Unused Code**:
   - Delete `sync_session_activities` function from `sessions_api.py`
   - Delete `check_and_complete_goals` if not used elsewhere
   - Remove old session data migration code

2. **Database Migration** (if needed):
   - Script to extract activity data from existing `session_data` JSON
   - Create ActivityInstance records for historical sessions
   - Clear activity data from JSON, keep only metadata

### Benefits After Migration

✅ **No more sync conflicts**
✅ **Timers work reliably**
✅ **Better performance** (no JSON parsing)
✅ **Easier to query** (SQL instead of JSON)
✅ **Clearer separation** (UI state vs. data)
✅ **No more orphan cleanup issues**

### Testing Checklist

- [ ] Can add activity to session
- [ ] Can remove activity from session
- [ ] Can reorder activities
- [ ] Timer start/stop works
- [ ] Metric values persist
- [ ] Session auto-save doesn't break activities
- [ ] Page refresh preserves all data
- [ ] Multiple sections work correctly

### Rollback Plan

If issues arise:
1. Revert `sessions_api.py` changes (restore sync calls)
2. Revert `api.js` changes
3. Keep frontend using old architecture
4. Database data is safe (new endpoints don't modify existing data)

---

**Next Action**: Implement Phase 2 frontend changes in SessionDetail.jsx
