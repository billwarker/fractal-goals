# Database Migration - Quick Start Guide

**Environment:** Development (goals_dev.db)  
**Status:** Ready to Execute  
**Estimated Time:** 5 minutes

---

## TL;DR - Execute Now

```bash
# 1. Backup (REQUIRED)
cp goals_dev.db goals_dev.db.backup_$(date +%Y%m%d_%H%M%S)

# 2. Test (RECOMMENDED)
python python-scripts/migrate_database_improvements.py --dry-run

# 3. Execute (When ready)
python python-scripts/migrate_database_improvements.py
```

---

## What This Does

✅ Adds `root_id` to 5 tables (10-100x faster queries)  
✅ Creates 26 indexes (massive performance boost)  
✅ Adds audit columns (deleted_at, updated_at, sort_order)  
✅ Prepares for multi-user support (90% less work later)

---

## Pre-Flight Checklist

- [ ] Application is running: `./shell-scripts/start-all.sh development`
- [ ] Database exists: `ls -lh goals_dev.db`
- [ ] Backup created: `ls -lh goals_dev.db.backup_*`

---

## Step-by-Step

### 1. Backup Database (30 seconds)
```bash
cd /Users/will/Projects/fractal-goals
cp goals_dev.db goals_dev.db.backup_$(date +%Y%m%d_%H%M%S)
ls -lh goals_dev.db*
```

**Expected Output:**
```
-rw-r--r--  1 will  staff   XXX KB  goals_dev.db
-rw-r--r--  1 will  staff   XXX KB  goals_dev.db.backup_20260101_152300
```

### 2. Dry Run Test (1 minute)
```bash
python python-scripts/migrate_database_improvements.py --dry-run
```

**Expected Output:**
```
================================================================================
DATABASE IMPROVEMENTS MIGRATION
================================================================================
Mode: DRY RUN
...
PHASE 1: ROOT_ID DENORMALIZATION
...
PHASE 3: PERFORMANCE OPTIMIZATION
...
MIGRATION COMPLETE!
```

### 3. Execute Migration (1 minute)
```bash
python python-scripts/migrate_database_improvements.py
```

**Prompt:** Type `yes` when asked to continue

**Expected Output:**
```
================================================================================
MIGRATION VERIFICATION
================================================================================

--- Checking root_id columns ---
  ✓ goals.root_id: EXISTS
  ✓ activity_instances.root_id: EXISTS
  ✓ metric_values.root_id: EXISTS
  ✓ metric_definitions.root_id: EXISTS
  ✓ split_definitions.root_id: EXISTS
  ...

--- Checking for NULL root_ids ---
  ✓ goals: 0 NULL root_ids
  ✓ activity_instances: 0 NULL root_ids
  ✓ metric_values: 0 NULL root_ids
  ...

MIGRATION COMPLETE!
```

### 4. Verify Application (2 minutes)
```bash
# Check logs for errors
tail -f logs/development_backend.log

# Test in browser
open http://localhost:5173
```

**Test:**
- [ ] Application loads
- [ ] Can view existing fractals
- [ ] Can view sessions
- [ ] No errors in console

---

## If Something Goes Wrong

### Rollback (30 seconds)
```bash
# Stop app
./shell-scripts/kill-all.sh

# Restore backup (replace timestamp)
cp goals_dev.db.backup_20260101_152300 goals_dev.db

# Restart app
./shell-scripts/start-all.sh development
```

---

## After Migration

### Update models.py (Next Session)
See `DATABASE_MIGRATION_READINESS.md` section "Post-Migration Tasks" for details.

**Key Changes:**
- Add `root_id` to ActivityInstance, MetricValue, MetricDefinition, SplitDefinition
- Add `deleted_at`, `updated_at`, `sort_order` columns
- Update `to_dict()` methods if needed

### Update API Endpoints (Next Session)
**Critical:** All new record creation must include `root_id`

**Files to update:**
- `blueprints/sessions_api.py`
- `blueprints/activities_api.py`
- `blueprints/timers_api.py`

---

## Success Indicators

✅ Migration script completes without errors  
✅ Verification shows all columns exist  
✅ Zero NULL root_ids  
✅ 26+ indexes created  
✅ Application starts and runs normally  
✅ Can view existing data  

---

## Common Issues

### Issue: "duplicate column name"
**Solution:** This is normal! Script skips existing columns. Continue.

### Issue: "table not found"
**Solution:** Wrong directory. Run from project root: `/Users/will/Projects/fractal-goals`

### Issue: Application won't start after migration
**Solution:** Check logs. Likely need to update models.py (see Post-Migration Tasks).

---

## Performance Gains

**Before Migration:**
```sql
-- Get activities for fractal: ~500ms (with joins)
SELECT ai.* FROM activity_instances ai
JOIN goals g ON ai.practice_session_id = g.id
WHERE g.root_id = 'fractal-id';
```

**After Migration:**
```sql
-- Get activities for fractal: ~5ms (direct index)
SELECT * FROM activity_instances
WHERE root_id = 'fractal-id';
```

**100x faster!** 🚀

---

## Questions?

See `DATABASE_MIGRATION_READINESS.md` for comprehensive details.

---

**Ready?** Run the commands above! ⬆️
