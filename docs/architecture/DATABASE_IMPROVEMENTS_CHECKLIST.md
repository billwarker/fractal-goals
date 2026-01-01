# Database Improvements Implementation Checklist

**Date Started:** ___________  
**Target Completion:** ___________  
**Status:** Not Started

---

## Pre-Migration

- [ ] **Backup all databases**
  ```bash
  cp goals.db goals.db.backup_$(date +%Y%m%d_%H%M%S)
  cp goals_dev.db goals_dev.db.backup_$(date +%Y%m%d_%H%M%S)
  cp goals_test.db goals_test.db.backup_$(date +%Y%m%d_%H%M%S)
  ```

- [ ] **Review documentation**
  - [ ] Read `DATABASE_IMPROVEMENTS.md`
  - [ ] Read `DATABASE_REVIEW_SUMMARY.md`
  - [ ] Read `MULTI_USER_ARCHITECTURE.md`

- [ ] **Test migration script**
  ```bash
  python python-scripts/migrate_database_improvements.py --dry-run
  ```

---

## Phase 1: Root ID Denormalization

### 1.1 Goals Table
- [ ] Make `goals.root_id` NOT NULL
- [ ] Set root_id for UltimateGoals (self-reference)
- [ ] Backfill root_id for all descendants
- [ ] Verify no NULL root_ids

### 1.2 Activity Instances
- [ ] Add `root_id` column
- [ ] Backfill from practice_session
- [ ] Verify all rows have root_id
- [ ] Update INSERT statements in code

### 1.3 Metric Values
- [ ] Add `root_id` column
- [ ] Backfill from activity_instances
- [ ] Verify all rows have root_id
- [ ] Update INSERT statements in code

### 1.4 Metric Definitions
- [ ] Add `root_id` column
- [ ] Backfill from activity_definitions
- [ ] Verify all rows have root_id
- [ ] Update INSERT statements in code

### 1.5 Split Definitions
- [ ] Add `root_id` column
- [ ] Backfill from activity_definitions
- [ ] Verify all rows have root_id
- [ ] Update INSERT statements in code

**Phase 1 Complete:** ___________

---

## Phase 2: Data Integrity

### 2.1 Update models.py
- [ ] Add unique constraints to `__table_args__`
  - [ ] `activity_groups(root_id, name)`
  - [ ] `activity_definitions(root_id, name)`
  - [ ] `metric_definitions(activity_id, name)`
  - [ ] `split_definitions(activity_id, name)`
  - [ ] `session_templates(root_id, name)`

- [ ] Add check constraints to `__table_args__`
  - [ ] `goals.deadline >= created_at`
  - [ ] `activity_instances.time_stop >= time_start`
  - [ ] `activity_instances.duration_seconds >= 0`
  - [ ] `metric_values.value >= 0` (if applicable)

### 2.2 Application-Level Validation
- [ ] Add validation in API endpoints
- [ ] Add error handling for constraint violations
- [ ] Update tests for constraint validation

**Phase 2 Complete:** ___________

---

## Phase 3: Performance Optimization

### 3.1 Foreign Key Indexes
- [ ] Create indexes on all FK columns (18 indexes)
- [ ] Verify indexes with `PRAGMA index_list(table_name)`

### 3.2 Composite Indexes
- [ ] Create composite indexes (5 indexes)
- [ ] Test query performance improvement

### 3.3 Partial Indexes
- [ ] Create partial indexes (3 indexes)
- [ ] Verify with EXPLAIN QUERY PLAN

### 3.4 Performance Testing
- [ ] Benchmark queries before/after
- [ ] Document performance improvements
- [ ] Update slow queries to use indexes

**Phase 3 Complete:** ___________

---

## Phase 4: Soft Deletes & Audit Trail

### 4.1 Add Soft Delete Columns
- [ ] Add `deleted_at` to 6 tables
- [ ] Update all DELETE operations to soft delete
- [ ] Add filters for `deleted_at IS NULL` in queries

### 4.2 Add Timestamp Columns
- [ ] Add `updated_at` to 7 tables
- [ ] Add `created_at` to metric_values
- [ ] Update models.py with auto-update triggers

### 4.3 Add Sort Order Columns
- [ ] Add `sort_order` to activity_instances
- [ ] Add `sort_order` to metric_definitions
- [ ] Add `sort_order` to goals
- [ ] Update UI to use sort_order

### 4.4 Update Application Logic
- [ ] Implement soft delete in API
- [ ] Add "restore" functionality
- [ ] Create admin endpoints for hard delete
- [ ] Update tests for soft delete

**Phase 4 Complete:** ___________

---

## Code Updates

### Update models.py
- [ ] Add `root_id` to all model classes
- [ ] Add `deleted_at` to all model classes
- [ ] Add `updated_at` to all model classes
- [ ] Add `sort_order` where needed
- [ ] Add constraints to `__table_args__`
- [ ] Update `to_dict()` methods

### Update API Endpoints

#### goals_api.py
- [ ] Include `root_id` in INSERT statements
- [ ] Add soft delete logic
- [ ] Update queries to filter deleted_at

#### sessions_api.py
- [ ] Include `root_id` in INSERT statements
- [ ] Add soft delete logic
- [ ] Use `root_id` for scoping queries

#### activities_api.py
- [ ] Include `root_id` in INSERT statements
- [ ] Add soft delete logic
- [ ] Use `root_id` for scoping queries

#### timers_api.py
- [ ] Include `root_id` in INSERT statements
- [ ] Update queries to use `root_id`

#### templates_api.py
- [ ] Include `root_id` in INSERT statements
- [ ] Add soft delete logic

### Update Tests
- [ ] Add tests for root_id validation
- [ ] Add tests for soft delete
- [ ] Add tests for constraints
- [ ] Add performance benchmarks

---

## Deployment

### Development Environment
- [ ] Run migration on dev database
- [ ] Test all CRUD operations
- [ ] Verify no errors in logs
- [ ] Test analytics queries

### Testing Environment
- [ ] Run migration on test database
- [ ] Run full test suite
- [ ] Performance testing
- [ ] User acceptance testing

### Production Environment
- [ ] **BACKUP DATABASE AGAIN**
- [ ] Schedule maintenance window
- [ ] Run migration on production
- [ ] Verify migration success
- [ ] Monitor application logs
- [ ] Monitor query performance
- [ ] Rollback plan ready

---

## Post-Migration Verification

### Data Integrity
- [ ] Verify no NULL root_ids
- [ ] Verify all FKs valid
- [ ] Check row counts match pre-migration
- [ ] Spot check data accuracy

### Performance
- [ ] Run benchmark queries
- [ ] Compare with pre-migration metrics
- [ ] Document improvements
- [ ] Identify any regressions

### Application Testing
- [ ] Test all major features
- [ ] Test edge cases
- [ ] Test error handling
- [ ] User acceptance testing

---

## Documentation Updates

- [ ] Update `index.md` with completion date
- [ ] Document any issues encountered
- [ ] Update API documentation
- [ ] Create migration retrospective

---

## Rollback Plan (If Needed)

If migration fails:

1. [ ] Stop application: `./shell-scripts/kill-all.sh`
2. [ ] Restore backup: `cp goals.db.backup_YYYYMMDD goals.db`
3. [ ] Restart application: `./shell-scripts/start-all.sh`
4. [ ] Document failure reason
5. [ ] Fix issues and retry

---

## Success Criteria

- [x] All tables have `root_id` column
- [x] No NULL `root_id` values
- [x] All indexes created successfully
- [x] Queries 10-100x faster
- [x] All tests passing
- [x] No data loss
- [x] Application fully functional

---

## Notes

_Use this space to document issues, decisions, or observations during migration_

```
Date: ___________
Note: 




Date: ___________
Note: 




Date: ___________
Note: 




```

---

**Migration Completed:** ___________  
**Completed By:** ___________  
**Total Time:** ___________  
**Issues Encountered:** ___________
