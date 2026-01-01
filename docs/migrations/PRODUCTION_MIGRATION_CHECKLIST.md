# Production Migration - Quick Checklist

**Print this page and check off each step as you complete it.**

---

## ⏰ Time Required: ~10 minutes

---

## 📋 PRE-MIGRATION (5 min)

- [ ] **1. Stop Application** (optional but recommended)
  ```bash
  ./shell-scripts/kill-all.sh
  ```

- [ ] **2. Create Backup** (CRITICAL - DO NOT SKIP!)
  ```bash
  cp goals.db goals.db.backup_$(date +%Y%m%d_%H%M%S)
  ```

- [ ] **3. Verify Backup**
  ```bash
  ls -lh goals.db*
  # Confirm backup file exists and size matches original
  ```

- [ ] **4. Copy Backup to Safe Location**
  ```bash
  cp goals.db.backup_* ~/Desktop/
  ```

- [ ] **5. Check Database Integrity**
  ```bash
  sqlite3 goals.db "PRAGMA integrity_check;"
  # Must show: "ok"
  ```

---

## 🚀 MIGRATION (3 min)

- [ ] **6. Run Migration Script**
  ```bash
  python python-scripts/migrate_database_improvements.py
  # Type "yes" when prompted
  ```

- [ ] **7. Apply Hotfix** (CRITICAL!)
  ```bash
  sqlite3 goals.db "
  ALTER TABLE activity_instances ADD COLUMN completed BOOLEAN DEFAULT 0;
  ALTER TABLE activity_instances ADD COLUMN notes STRING;
  ALTER TABLE activity_instances ADD COLUMN data STRING;
  "
  ```

---

## ✅ VERIFICATION (2 min)

- [ ] **8. Verify root_id Columns**
  ```bash
  sqlite3 goals.db "SELECT COUNT(*) FROM pragma_table_info('activity_instances') WHERE name='root_id';"
  # Must show: 1
  ```

- [ ] **9. Verify No NULL root_ids**
  ```bash
  sqlite3 goals.db "SELECT COUNT(*) FROM activity_instances WHERE root_id IS NULL;"
  # Must show: 0
  ```

- [ ] **10. Verify Indexes Created**
  ```bash
  sqlite3 goals.db "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';"
  # Must show: 26 or more
  ```

- [ ] **11. Verify Hotfix Applied**
  ```bash
  sqlite3 goals.db "PRAGMA table_info(activity_instances);"
  # Must show 13 columns including: completed, notes, data
  ```

- [ ] **12. Final Integrity Check**
  ```bash
  sqlite3 goals.db "PRAGMA integrity_check;"
  # Must show: "ok"
  ```

---

## 🔄 RESTART (1 min)

- [ ] **13. Start Application**
  ```bash
  ./shell-scripts/start-all.sh production
  ```

- [ ] **14. Check Logs**
  ```bash
  tail -20 logs/production_backend.log
  # Look for: "Starting Fractal Goals Flask Server"
  # No errors about missing columns
  ```

---

## 🧪 TESTING (5 min)

- [ ] **15. Application Loads**
  - Open browser to production URL
  - Verify no errors

- [ ] **16. View Existing Data**
  - Can view fractals
  - Can view sessions
  - Can view activities

- [ ] **17. Create New Session**
  - Create a test session
  - Verify it saves successfully

- [ ] **18. Add Activity**
  - Add activity to session
  - Verify no errors

- [ ] **19. Verify root_id in New Records**
  ```bash
  sqlite3 goals.db "SELECT id, root_id FROM activity_instances ORDER BY created_at DESC LIMIT 1;"
  # root_id must NOT be NULL
  ```

---

## ✅ SUCCESS CRITERIA

All of the following must be TRUE:

- [x] Backup created and verified
- [x] Migration completed without errors
- [x] Hotfix applied
- [x] All verification checks passed
- [x] Application started successfully
- [x] Can view existing data
- [x] Can create new records
- [x] New records have root_id
- [x] No errors in logs

---

## 🆘 IF SOMETHING GOES WRONG

### ROLLBACK IMMEDIATELY:

```bash
# 1. Stop app
./shell-scripts/kill-all.sh

# 2. Restore backup (use your actual backup filename)
cp goals.db.backup_20260101_HHMMSS goals.db

# 3. Restart app
./shell-scripts/start-all.sh production

# 4. Investigate issue
tail -50 logs/production_backend.log
```

---

## 📝 NOTES

**Migration Start Time:** ___________

**Migration End Time:** ___________

**Backup Filename:** goals.db.backup_______________

**Issues Encountered:**
- 
- 
- 

**Resolution:**
- 
- 
- 

---

## ✅ MIGRATION COMPLETE

**Completed By:** _______________

**Date:** _______________

**Signature:** _______________

---

**Keep this checklist for your records.**
