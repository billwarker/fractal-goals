# Architecture Notes - Activity Data Storage

## Current Issue: Dual Source of Truth

### Problem
Activity data is stored in two places:
1. **session_data JSON** (in `goals.attributes` column) - Frontend-managed
2. **activity_instances table** - Backend-managed for timers/metrics

This creates synchronization conflicts, especially with:
- Auto-save race conditions
- Timer data getting deleted by sync function
- Unclear ownership of data

### Recent Fixes
- **2025-12-31**: Modified `sync_session_activities` to preserve instances with timer data
- Added check: only delete orphans if `time_start` and `time_stop` are both NULL

### Recommended Future Architecture

#### Option A: Database-Only (Best Long-term)
**Eliminate session_data JSON for activities entirely**

Pros:
- Single source of truth
- No sync conflicts
- Better for analytics
- Timers work naturally

Changes:
1. Remove activity data from session_data JSON
2. Frontend fetches instances via API
3. Store only UI metadata in JSON (section names, notes, display order)
4. Remove sync_session_activities function

#### Option B: Make Sync More Robust (Quick Fix)
**Keep current structure but improve sync logic**

Changes:
1. ✅ Don't delete instances with timer data (DONE)
2. Add instance_id to session_data JSON when timer starts
3. Make sync bidirectional (update JSON from DB too)
4. Add conflict resolution strategy

#### Option C: Separate Template from Instance
**Use JSON for templates, DB for actual instances**

Changes:
1. session_data stores template structure only
2. Instances reference template items
3. Clear separation: template = what to do, instance = what was done

### Migration Path

If choosing Option A (recommended):

1. **Phase 1**: Add endpoints to fetch instances separately
2. **Phase 2**: Update frontend to use new endpoints
3. **Phase 3**: Remove activity data from session_data JSON
4. **Phase 4**: Remove sync function
5. **Phase 5**: Keep JSON only for section metadata

### Current Workaround Rules

Until migration:
- **Timer API**: Creates/updates ActivityInstance directly
- **Session API**: Syncs from JSON but preserves timer data
- **Frontend**: Updates both JSON and calls timer API
- **Orphan cleanup**: Only delete if no timer data exists

### Code Locations

- Sync function: `/blueprints/sessions_api.py` lines 21-109
- Timer endpoints: `/blueprints/timers_api.py`
- Frontend session state: `/client/src/pages/SessionDetail.jsx`
- Auto-save logic: SessionDetail.jsx useEffect (line ~114)

### Decision Needed

Choose architecture direction before adding more features that depend on current structure.
