# Production vs Development Migration - Key Differences

**Date:** 2026-01-01  
**Purpose:** Highlight important differences when migrating production database

---

## Overview

The development database (`goals_dev.db`) has already been successfully migrated. This document highlights key differences and considerations for the production database (`goals.db`).

---

## Database State Comparison

### Development Database (goals_dev.db)
- ✅ **Fully migrated** (2026-01-01 15:30)
- ✅ **Hotfix applied** (completed, notes, data columns)
- ✅ **Tested and verified**
- **Data:** 45 goals, 79 activities, 116 metrics
- **Status:** Clean, no issues

### Production Database (goals.db)
- ⚠️ **Partially migrated** (during initial testing)
- ❌ **Hotfix NOT applied**
- ⏳ **Needs full migration**
- **Data:** Unknown (likely more than dev)
- **Status:** Needs migration

---

## Critical Differences

### 1. Partial Migration History

**Development:**
- Clean slate → Full migration → Success

**Production:**
- Attempted migration → Error at Phase 3 → Stopped
- **Result:** Phases 1-3 partially completed, Phase 4 not started

**Implication:**
- Production migration script will skip some already-completed steps
- This is NORMAL and expected
- Script uses `IF NOT EXISTS` clauses to handle this

### 2. Data Volume

**Development:**
- Small dataset (45 goals, 79 activities)
- Migration took ~3 seconds

**Production:**
- Potentially larger dataset
- Migration may take longer (still under 1 minute expected)

**Implication:**
- Monitor migration progress
- Expect slightly longer execution time

### 3. Hotfix Requirement

**Development:**
- Hotfix applied immediately after migration
- All 13 columns present in activity_instances

**Production:**
- Hotfix NOT yet applied
- **MUST** apply hotfix after migration script
- Missing columns: completed, notes, data

**Implication:**
- **CRITICAL:** Don't forget hotfix step
- Application will fail without it

---

## Migration Script Behavior

### What Will Happen

**Already Completed (from partial migration):**
- Some root_id columns may already exist
- Some indexes may already exist
- Script will skip these with "already exists" messages

**Will Be Completed:**
- Any missing root_id columns
- Any missing indexes
- All Phase 4 changes (soft deletes, audit trail)
- Hotfix columns (manual step)

### Expected Output Differences

**Development Migration Output:**
```
✓ Success (all new)
✓ Success (all new)
✓ Success (all new)
```

**Production Migration Output:**
```
⚠ Column already exists, skipping (expected)
✓ Success (new)
⚠ Index already exists, skipping (expected)
✓ Success (new)
```

**This is NORMAL!** The script is designed to be idempotent.

---

## Risk Assessment

### Development Migration
- **Risk:** LOW
- **Impact if failed:** Minimal (can restore and retry)
- **Downtime:** None (test environment)

### Production Migration
- **Risk:** LOW (same migration, tested in dev)
- **Impact if failed:** Medium (production downtime)
- **Downtime:** Optional (5-10 min recommended)

---

## Testing Differences

### Development Testing
- ✅ Comprehensive testing completed
- ✅ All CRUD operations verified
- ✅ Performance improvements confirmed
- ⚠️ Delete session issue discovered (under investigation)

### Production Testing
- ⏳ Must repeat all tests
- ⏳ Verify with production data
- ⏳ Monitor for 24 hours post-migration
- ⏳ Check for any production-specific issues

---

## Backup Strategy

### Development Backup
- **Created:** goals_dev.db.backup_20260101_152821
- **Location:** Project directory
- **Retention:** Kept for reference

### Production Backup
- **Must Create:** goals.db.backup_YYYYMMDD_HHMMSS
- **Locations:** 
  1. Project directory
  2. ~/Desktop/ (or safe location)
  3. Cloud storage (recommended)
- **Retention:** Keep for 30 days minimum

---

## Rollback Considerations

### Development Rollback
- Simple: `cp backup goals_dev.db`
- Low stakes (test environment)
- Can retry immediately

### Production Rollback
- **CRITICAL:** Must be fast
- High stakes (production data)
- Must have backup verified BEFORE migration
- Document rollback if needed

---

## Post-Migration Monitoring

### Development
- Monitored for 1 hour
- No issues found (except delete session)
- Considered stable

### Production
- **Must monitor for 24 hours**
- Watch for:
  - Application errors
  - Slow queries
  - NULL root_ids in new records
  - User-reported issues
- Document any issues

---

## Checklist: Production-Specific Steps

- [ ] **Verify production database path**
  ```bash
  # Should be: /Users/will/Projects/fractal-goals/goals.db
  # NOT: goals_dev.db
  ```

- [ ] **Check production data volume**
  ```bash
  sqlite3 goals.db "
  SELECT 'goals' as table, COUNT(*) FROM goals
  UNION ALL
  SELECT 'activities', COUNT(*) FROM activity_instances
  UNION ALL
  SELECT 'metrics', COUNT(*) FROM metric_values;
  "
  ```

- [ ] **Verify production is NOT running during migration**
  ```bash
  ps aux | grep "flask\|vite" | grep -v grep
  # Should show no results
  ```

- [ ] **Create multiple backup copies**
  ```bash
  # Local
  cp goals.db goals.db.backup_$(date +%Y%m%d_%H%M%S)
  
  # Desktop
  cp goals.db ~/Desktop/goals.db.backup_$(date +%Y%m%d_%H%M%S)
  
  # Verify both
  ls -lh goals.db* ~/Desktop/goals.db*
  ```

- [ ] **Set environment correctly**
  ```bash
  # For production, either:
  python python-scripts/migrate_database_improvements.py
  # OR explicitly:
  ENV=production python python-scripts/migrate_database_improvements.py
  ```

- [ ] **Apply hotfix IMMEDIATELY after migration**
  ```bash
  sqlite3 goals.db "
  ALTER TABLE activity_instances ADD COLUMN completed BOOLEAN DEFAULT 0;
  ALTER TABLE activity_instances ADD COLUMN notes STRING;
  ALTER TABLE activity_instances ADD COLUMN data STRING;
  "
  ```

- [ ] **Verify production application starts**
  ```bash
  ./shell-scripts/start-all.sh production
  tail -f logs/production_backend.log
  ```

- [ ] **Test with production data**
  - View existing fractals
  - View existing sessions
  - Create test session
  - Delete test session
  - Verify all operations work

- [ ] **Monitor for 24 hours**
  - Check logs daily
  - Verify no NULL root_ids
  - Confirm performance improvements
  - Document any issues

---

## Success Criteria Comparison

### Development Success
- [x] Migration completed
- [x] Hotfix applied
- [x] All tests passed
- [x] No data loss
- [x] Performance improved

### Production Success
- [ ] Migration completed
- [ ] Hotfix applied
- [ ] All tests passed
- [ ] No data loss
- [ ] Performance improved
- [ ] **24 hours stable**
- [ ] **No user issues**
- [ ] **Production verified**

---

## Key Takeaways

1. **Production migration is the SAME as development** - just different database
2. **Partial migration state is EXPECTED** - script handles it
3. **Hotfix is CRITICAL** - don't forget this step
4. **Backup is MANDATORY** - create multiple copies
5. **Testing is REQUIRED** - repeat all tests with production data
6. **Monitoring is ESSENTIAL** - watch for 24 hours

---

## Quick Reference

### Development Migration
```bash
# Already completed:
ENV=development python python-scripts/migrate_database_improvements.py
sqlite3 goals_dev.db "ALTER TABLE activity_instances ADD COLUMN completed..."
```

### Production Migration
```bash
# To be done:
cp goals.db goals.db.backup_$(date +%Y%m%d_%H%M%S)
python python-scripts/migrate_database_improvements.py
sqlite3 goals.db "ALTER TABLE activity_instances ADD COLUMN completed..."
./shell-scripts/start-all.sh production
```

---

**Remember:** The production migration is LOW RISK because:
1. ✅ Already tested in development
2. ✅ All changes are additive (no data deletion)
3. ✅ Backup required before starting
4. ✅ Easy rollback if needed
5. ✅ Script is idempotent (safe to re-run)

**Confidence Level:** HIGH  
**Recommended:** Proceed with production migration

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-01
