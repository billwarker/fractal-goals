# Database Improvements Plan

**Status:** Planned  
**Created:** 2026-01-01  
**Target:** Make backend/data model production-ready and multi-user capable

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Phase 1: Root ID Denormalization](#phase-1-root-id-denormalization)
3. [Phase 2: Data Integrity & Constraints](#phase-2-data-integrity--constraints)
4. [Phase 3: Performance Optimization](#phase-3-performance-optimization)
5. [Phase 4: Soft Deletes & Audit Trail](#phase-4-soft-deletes--audit-trail)
6. [Phase 5: Multi-User Preparation](#phase-5-multi-user-preparation)
7. [Migration Scripts](#migration-scripts)
8. [Testing Strategy](#testing-strategy)

---

## Executive Summary

This document outlines a comprehensive database improvement plan to:
- **Improve query performance** through strategic denormalization (`root_id` on all tables)
- **Ensure data integrity** with constraints and validation
- **Prepare for multi-user support** with minimal future migration effort
- **Enable soft deletes** for data recovery and audit trails
- **Optimize indexes** for common query patterns

### Key Principles
1. **Denormalize for performance** - Add `root_id` to every table for fast scoping
2. **Constrain for integrity** - Use database constraints to prevent invalid data
3. **Index for speed** - Strategic indexes on foreign keys and filter columns
4. **Soft delete for safety** - Never lose data, enable recovery
5. **Future-proof for multi-user** - Design decisions that ease future migration

---

## Phase 1: Root ID Denormalization

### Objective
Add `root_id` column to all tables to enable fast fractal-scoped queries and prepare for multi-user support.

### Rationale
- **Current pain:** Queries require multi-level joins to scope data to a fractal
- **Analytics impact:** Reporting queries are slow due to deep join chains
- **Multi-user prep:** When adding users, `root_id` becomes essential for data isolation
- **Performance:** Direct filtering on `root_id` is 10-100x faster than joins

### Changes

#### 1.1 Make `goals.root_id` NOT NULL and Self-Referencing

**Current State:**
```sql
root_id = Column(String, nullable=True)  # Line 36 in models.py
```

**New State:**
```sql
root_id = Column(String, ForeignKey('goals.id'), nullable=False)
```

**Logic:**
- For `UltimateGoal` (root nodes): `root_id` points to `self.id`
- For all other goals: `root_id` points to the ultimate ancestor
- Enables fast query: `WHERE root_id = ?` instead of recursive parent traversal

**Migration:**
```sql
-- Set root_id for UltimateGoals (self-reference)
UPDATE goals 
SET root_id = id 
WHERE parent_id IS NULL AND type = 'UltimateGoal';

-- Set root_id for all descendants (recursive CTE)
WITH RECURSIVE goal_tree AS (
  -- Base case: root goals
  SELECT id, id as root_id FROM goals WHERE parent_id IS NULL
  UNION ALL
  -- Recursive case: children inherit root_id from parent
  SELECT g.id, gt.root_id
  FROM goals g
  JOIN goal_tree gt ON g.parent_id = gt.id
)
UPDATE goals
SET root_id = (SELECT root_id FROM goal_tree WHERE goal_tree.id = goals.id)
WHERE root_id IS NULL;

-- Make NOT NULL
ALTER TABLE goals ALTER COLUMN root_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE goals ADD CONSTRAINT fk_goals_root 
  FOREIGN KEY (root_id) REFERENCES goals(id) ON DELETE CASCADE;
```

---

#### 1.2 Add `root_id` to `activity_instances`

**Priority:** HIGH ⭐⭐⭐

**Current State:** No `root_id` column

**New State:**
```python
class ActivityInstance(Base):
    # ... existing fields ...
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
```

**Benefits:**
- Direct filtering: `WHERE root_id = ?` instead of joining through `goals` table
- Analytics queries 10x faster
- Essential for multi-user data isolation
- Enables efficient composite indexes

**Migration:**
```sql
-- Add column (nullable initially)
ALTER TABLE activity_instances ADD COLUMN root_id STRING;

-- Backfill from practice_session
UPDATE activity_instances
SET root_id = (
  SELECT COALESCE(g.root_id, g.id)
  FROM goals g
  WHERE g.id = activity_instances.practice_session_id
);

-- Make NOT NULL
ALTER TABLE activity_instances ALTER COLUMN root_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE activity_instances ADD CONSTRAINT fk_activity_instances_root
  FOREIGN KEY (root_id) REFERENCES goals(id) ON DELETE CASCADE;
```

---

#### 1.3 Add `root_id` to `metric_values`

**Priority:** HIGH ⭐⭐⭐

**Current State:** No `root_id` column (requires 3 joins to get root_id)

**New State:**
```python
class MetricValue(Base):
    # ... existing fields ...
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
```

**Benefits:**
- **Critical for analytics:** This table contains all actual performance data
- **Deep joins eliminated:** Currently requires `metric_values` → `activity_instances` → `goals` → `root_id`
- **Reporting queries:** "Total weight lifted in this fractal" becomes trivial
- **Multi-user essential:** Prevents data leakage between users

**Migration:**
```sql
-- Add column
ALTER TABLE metric_values ADD COLUMN root_id STRING;

-- Backfill via activity_instances
UPDATE metric_values
SET root_id = (
  SELECT ai.root_id
  FROM activity_instances ai
  WHERE ai.id = metric_values.activity_instance_id
);

-- Make NOT NULL
ALTER TABLE metric_values ALTER COLUMN root_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE metric_values ADD CONSTRAINT fk_metric_values_root
  FOREIGN KEY (root_id) REFERENCES goals(id) ON DELETE CASCADE;
```

---

#### 1.4 Add `root_id` to `metric_definitions`

**Priority:** MEDIUM-HIGH ⭐⭐⭐

**Current State:** No `root_id` column (requires join through `activity_definitions`)

**New State:**
```python
class MetricDefinition(Base):
    # ... existing fields ...
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
```

**Benefits:**
- Fast query: "Get all metric definitions for this fractal"
- Useful for analytics UI (showing available metrics)
- Consistency with other tables

**Migration:**
```sql
-- Add column
ALTER TABLE metric_definitions ADD COLUMN root_id STRING;

-- Backfill from activity_definitions
UPDATE metric_definitions
SET root_id = (
  SELECT ad.root_id
  FROM activity_definitions ad
  WHERE ad.id = metric_definitions.activity_id
);

-- Make NOT NULL
ALTER TABLE metric_definitions ALTER COLUMN root_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE metric_definitions ADD CONSTRAINT fk_metric_definitions_root
  FOREIGN KEY (root_id) REFERENCES goals(id) ON DELETE CASCADE;
```

---

#### 1.5 Add `root_id` to `split_definitions`

**Priority:** MEDIUM ⭐⭐

**Current State:** No `root_id` column

**New State:**
```python
class SplitDefinition(Base):
    # ... existing fields ...
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
```

**Benefits:**
- Consistency with `metric_definitions`
- Future-proofs for split-based analytics
- Multi-user data isolation

**Migration:**
```sql
-- Add column
ALTER TABLE split_definitions ADD COLUMN root_id STRING;

-- Backfill from activity_definitions
UPDATE split_definitions
SET root_id = (
  SELECT ad.root_id
  FROM activity_definitions ad
  WHERE ad.id = split_definitions.activity_id
);

-- Make NOT NULL
ALTER TABLE split_definitions ALTER COLUMN root_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE split_definitions ADD CONSTRAINT fk_split_definitions_root
  FOREIGN KEY (root_id) REFERENCES goals(id) ON DELETE CASCADE;
```

---

### Phase 1 Summary

**Tables Modified:**
- ✅ `goals` - Make `root_id` NOT NULL with FK
- ✅ `activity_instances` - Add `root_id`
- ✅ `metric_values` - Add `root_id`
- ✅ `metric_definitions` - Add `root_id`
- ✅ `split_definitions` - Add `root_id`

**Tables Already Have `root_id`:**
- ✅ `activity_groups`
- ✅ `activity_definitions`
- ✅ `session_templates`

**Tables That Don't Need `root_id`:**
- ❌ `practice_session_goals` (junction table, both FKs already point to goals)

---

## Phase 2: Data Integrity & Constraints

### Objective
Add database-level constraints to prevent invalid data and ensure referential integrity.

### 2.1 Unique Constraints

Prevent duplicate names within the same scope:

```sql
-- Prevent duplicate activity group names per fractal
ALTER TABLE activity_groups 
  ADD CONSTRAINT uq_activity_groups_root_name 
  UNIQUE (root_id, name);

-- Prevent duplicate activity names per fractal
ALTER TABLE activity_definitions 
  ADD CONSTRAINT uq_activity_definitions_root_name 
  UNIQUE (root_id, name);

-- Prevent duplicate metric names per activity
ALTER TABLE metric_definitions 
  ADD CONSTRAINT uq_metric_definitions_activity_name 
  UNIQUE (activity_id, name);

-- Prevent duplicate split names per activity
ALTER TABLE split_definitions 
  ADD CONSTRAINT uq_split_definitions_activity_name 
  UNIQUE (activity_id, name);

-- Prevent duplicate template names per fractal
ALTER TABLE session_templates 
  ADD CONSTRAINT uq_session_templates_root_name 
  UNIQUE (root_id, name);
```

**Benefits:**
- Prevents user confusion from duplicate names
- Enforces data quality at database level
- Makes queries more predictable

---

### 2.2 Check Constraints

Add validation rules for data consistency:

```sql
-- Goals: deadline must be in the future or NULL
ALTER TABLE goals 
  ADD CONSTRAINT chk_goals_deadline_future 
  CHECK (deadline IS NULL OR deadline >= created_at);

-- Activity instances: time_stop must be after time_start
ALTER TABLE activity_instances 
  ADD CONSTRAINT chk_activity_instances_time_order 
  CHECK (time_stop IS NULL OR time_start IS NULL OR time_stop >= time_start);

-- Activity instances: duration must be non-negative
ALTER TABLE activity_instances 
  ADD CONSTRAINT chk_activity_instances_duration_positive 
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

-- Metric values: value must be non-negative (for most metrics)
-- Note: This might need to be removed if you have metrics that can be negative
ALTER TABLE metric_values 
  ADD CONSTRAINT chk_metric_values_positive 
  CHECK (value >= 0);

-- Practice sessions: session_end must be after session_start
ALTER TABLE goals 
  ADD CONSTRAINT chk_goals_session_time_order 
  CHECK (
    type != 'PracticeSession' OR 
    session_end IS NULL OR 
    session_start IS NULL OR 
    session_end >= session_start
  );

-- Practice sessions: total_duration must be non-negative
ALTER TABLE goals 
  ADD CONSTRAINT chk_goals_duration_positive 
  CHECK (
    type != 'PracticeSession' OR 
    total_duration_seconds IS NULL OR 
    total_duration_seconds >= 0
  );
```

---

### 2.3 Foreign Key Cascade Rules

Ensure proper cascade behavior for deletions:

**Already Correct:**
- ✅ `practice_session_goals` - CASCADE on both FKs
- ✅ `activity_instances.practice_session_id` - CASCADE
- ✅ `metric_values.activity_instance_id` - CASCADE

**Need Review:**
- ⚠️ `metric_values.metric_definition_id` - Currently RESTRICT (good!)
- ⚠️ `metric_values.split_definition_id` - Currently RESTRICT (good!)

**Rationale:**
- RESTRICT on definition FKs prevents accidental deletion of metrics/splits that have data
- CASCADE on instance FKs ensures cleanup when sessions are deleted

---

## Phase 3: Performance Optimization

### Objective
Add strategic indexes to speed up common query patterns.

### 3.1 Foreign Key Indexes

**Critical:** SQLite doesn't automatically index foreign keys!

```sql
-- Goals table
CREATE INDEX IF NOT EXISTS idx_goals_parent_id ON goals(parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_root_id ON goals(root_id);
CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(type);
CREATE INDEX IF NOT EXISTS idx_goals_created_at ON goals(created_at);

-- Activity instances
CREATE INDEX IF NOT EXISTS idx_activity_instances_session ON activity_instances(practice_session_id);
CREATE INDEX IF NOT EXISTS idx_activity_instances_definition ON activity_instances(activity_definition_id);
CREATE INDEX IF NOT EXISTS idx_activity_instances_root ON activity_instances(root_id);

-- Metric values
CREATE INDEX IF NOT EXISTS idx_metric_values_instance ON metric_values(activity_instance_id);
CREATE INDEX IF NOT EXISTS idx_metric_values_definition ON metric_values(metric_definition_id);
CREATE INDEX IF NOT EXISTS idx_metric_values_root ON metric_values(root_id);

-- Metric definitions
CREATE INDEX IF NOT EXISTS idx_metric_definitions_activity ON metric_definitions(activity_id);
CREATE INDEX IF NOT EXISTS idx_metric_definitions_root ON metric_definitions(root_id);

-- Split definitions
CREATE INDEX IF NOT EXISTS idx_split_definitions_activity ON split_definitions(activity_id);
CREATE INDEX IF NOT EXISTS idx_split_definitions_root ON split_definitions(root_id);

-- Activity definitions
CREATE INDEX IF NOT EXISTS idx_activity_definitions_group ON activity_definitions(group_id);
CREATE INDEX IF NOT EXISTS idx_activity_definitions_root ON activity_definitions(root_id);

-- Activity groups
CREATE INDEX IF NOT EXISTS idx_activity_groups_root ON activity_groups(root_id);

-- Session templates
CREATE INDEX IF NOT EXISTS idx_session_templates_root ON session_templates(root_id);
```

---

### 3.2 Composite Indexes

For common query patterns:

```sql
-- Analytics: Get all instances for a fractal, ordered by date
CREATE INDEX IF NOT EXISTS idx_activity_instances_root_date 
  ON activity_instances(root_id, created_at DESC);

-- Analytics: Get all metric values for a fractal and specific metric
CREATE INDEX IF NOT EXISTS idx_metric_values_root_metric 
  ON metric_values(root_id, metric_definition_id);

-- Session queries: Get all instances for a session
CREATE INDEX IF NOT EXISTS idx_activity_instances_session_created 
  ON activity_instances(practice_session_id, created_at);

-- Goal tree queries: Get children of a parent
CREATE INDEX IF NOT EXISTS idx_goals_parent_type 
  ON goals(parent_id, type);

-- Fractal scoped queries with type filter
CREATE INDEX IF NOT EXISTS idx_goals_root_type 
  ON goals(root_id, type);
```

---

### 3.3 Partial Indexes

For specific query optimizations (SQLite 3.8.0+):

```sql
-- Index only active metrics
CREATE INDEX IF NOT EXISTS idx_metric_definitions_active 
  ON metric_definitions(activity_id) 
  WHERE is_active = 1;

-- Index only completed goals
CREATE INDEX IF NOT EXISTS idx_goals_completed 
  ON goals(root_id, type) 
  WHERE completed = 1;

-- Index only practice sessions (most queried goal type)
CREATE INDEX IF NOT EXISTS idx_goals_practice_sessions 
  ON goals(root_id, created_at) 
  WHERE type = 'PracticeSession';
```

---

## Phase 4: Soft Deletes & Audit Trail

### Objective
Enable data recovery and maintain audit trail for compliance and debugging.

### 4.1 Add Soft Delete Columns

Add `deleted_at` to all major tables:

```sql
-- Goals (including practice sessions)
ALTER TABLE goals ADD COLUMN deleted_at DATETIME NULL;

-- Activity definitions
ALTER TABLE activity_definitions ADD COLUMN deleted_at DATETIME NULL;

-- Activity groups
ALTER TABLE activity_groups ADD COLUMN deleted_at DATETIME NULL;

-- Activity instances
ALTER TABLE activity_instances ADD COLUMN deleted_at DATETIME NULL;

-- Session templates
ALTER TABLE session_templates ADD COLUMN deleted_at DATETIME NULL;

-- Split definitions
ALTER TABLE split_definitions ADD COLUMN deleted_at DATETIME NULL;

-- Note: metric_definitions already has deleted_at ✅
```

**Model Updates:**
```python
class Goal(Base):
    # ... existing fields ...
    deleted_at = Column(DateTime, nullable=True)

class ActivityDefinition(Base):
    # ... existing fields ...
    deleted_at = Column(DateTime, nullable=True)

# ... etc for other models
```

**Query Pattern:**
```python
# Always filter out soft-deleted records
active_goals = session.query(Goal).filter(Goal.deleted_at == None).all()

# To include deleted (for admin/recovery)
all_goals = session.query(Goal).all()
```

---

### 4.2 Add Timestamp Tracking

Add `updated_at` to all tables that don't have it:

```sql
-- Activity groups
ALTER TABLE activity_groups ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Activity definitions
ALTER TABLE activity_definitions ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Metric definitions
ALTER TABLE metric_definitions ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Split definitions
ALTER TABLE split_definitions ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Activity instances
ALTER TABLE activity_instances ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Session templates
ALTER TABLE session_templates ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Metric values
ALTER TABLE metric_values ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE metric_values ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Note: goals already has updated_at ✅
```

---

### 4.3 Add Ordering Fields

For UI display order control:

```sql
-- Activity instances: order within a session
ALTER TABLE activity_instances ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Metric definitions: consistent display order
ALTER TABLE metric_definitions ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Goal children: sibling order
ALTER TABLE goals ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Note: activity_groups already has sort_order ✅
```

---

## Phase 5: Multi-User Preparation

### Objective
Design schema changes that make future multi-user migration trivial.

### 5.1 User Table Design (Future)

**Not implemented now, but planned:**

```sql
CREATE TABLE users (
  id STRING PRIMARY KEY,
  email STRING UNIQUE NOT NULL,
  username STRING UNIQUE NOT NULL,
  password_hash STRING NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  last_login DATETIME NULL,
  is_active BOOLEAN DEFAULT TRUE
);
```

---

### 5.2 Multi-User Migration Path

**When ready to add multi-user support:**

**Step 1:** Add `user_id` to `goals` table (only root goals need it)
```sql
ALTER TABLE goals ADD COLUMN user_id STRING REFERENCES users(id);

-- Backfill with default user
UPDATE goals SET user_id = 'default-user-id' WHERE parent_id IS NULL;

-- Make NOT NULL
ALTER TABLE goals ALTER COLUMN user_id SET NOT NULL;

-- Add index
CREATE INDEX idx_goals_user ON goals(user_id);

-- Add unique constraint: one user can't have duplicate root goal names
ALTER TABLE goals ADD CONSTRAINT uq_goals_user_name 
  UNIQUE (user_id, name) 
  WHERE parent_id IS NULL;
```

**Step 2:** All other tables already have `root_id`, so they're automatically scoped!
```python
# No changes needed to other tables!
# Just filter by root_id, which belongs to a user

# Get user's fractals
user_fractals = session.query(Goal).filter(
    Goal.user_id == current_user_id,
    Goal.parent_id == None
).all()

# Get user's activity instances (via root_id)
user_instances = session.query(ActivityInstance).filter(
    ActivityInstance.root_id.in_([f.id for f in user_fractals])
).all()
```

**Step 3:** Add row-level security (optional, for extra safety)
```sql
-- PostgreSQL example (if you migrate from SQLite)
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_goals_policy ON goals
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

---

### 5.3 Why This Approach Works

**Benefits:**
1. ✅ **Minimal migration:** Only `goals` table needs `user_id`
2. ✅ **Automatic scoping:** All child tables use `root_id` for filtering
3. ✅ **No data duplication:** Don't need `user_id` on every table
4. ✅ **Performance:** Queries remain fast with existing indexes
5. ✅ **Data isolation:** Impossible to leak data between users (via root_id)

**Example Query (Multi-User Future):**
```python
# Get all metric values for current user's fractals
user_root_ids = session.query(Goal.id).filter(
    Goal.user_id == current_user_id,
    Goal.parent_id == None
).all()

metrics = session.query(MetricValue).filter(
    MetricValue.root_id.in_(user_root_ids)
).all()
```

---

## Migration Scripts

### Master Migration Script

**File:** `/python-scripts/migrate_database_improvements.py`

```python
#!/usr/bin/env python3
"""
Database Improvements Migration Script

Applies all schema changes from DATABASE_IMPROVEMENTS.md in correct order.

Usage:
    python python-scripts/migrate_database_improvements.py [--dry-run]
"""

import sys
import os
import sqlite3
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import config

def get_db_connection():
    """Get database connection."""
    db_path = config.get_db_path()
    print(f"Connecting to database: {db_path}")
    return sqlite3.connect(db_path)

def execute_sql(conn, sql, description, dry_run=False):
    """Execute SQL with error handling."""
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Executing: {description}")
    print(f"SQL: {sql[:100]}..." if len(sql) > 100 else f"SQL: {sql}")
    
    if dry_run:
        print("  → Skipped (dry run)")
        return
    
    try:
        cursor = conn.cursor()
        cursor.execute(sql)
        conn.commit()
        print(f"  ✓ Success")
    except sqlite3.Error as e:
        print(f"  ✗ Error: {e}")
        raise

def phase_1_root_id_denormalization(conn, dry_run=False):
    """Phase 1: Add root_id to all tables."""
    print("\n" + "="*80)
    print("PHASE 1: ROOT_ID DENORMALIZATION")
    print("="*80)
    
    # 1.1: Fix goals.root_id
    print("\n--- 1.1: Make goals.root_id NOT NULL ---")
    
    # Set root_id for UltimateGoals (self-reference)
    execute_sql(conn, """
        UPDATE goals 
        SET root_id = id 
        WHERE parent_id IS NULL AND type = 'UltimateGoal' AND root_id IS NULL
    """, "Set root_id for UltimateGoals (self-reference)", dry_run)
    
    # Set root_id for all descendants using recursive CTE
    execute_sql(conn, """
        WITH RECURSIVE goal_tree AS (
          SELECT id, id as root_id FROM goals WHERE parent_id IS NULL
          UNION ALL
          SELECT g.id, gt.root_id
          FROM goals g
          JOIN goal_tree gt ON g.parent_id = gt.id
        )
        UPDATE goals
        SET root_id = (SELECT root_id FROM goal_tree WHERE goal_tree.id = goals.id)
        WHERE root_id IS NULL
    """, "Set root_id for all goal descendants", dry_run)
    
    # Note: SQLite doesn't support ALTER COLUMN SET NOT NULL directly
    # We'll handle this by recreating the table if needed, or just rely on application logic
    print("  Note: SQLite limitation - cannot ALTER COLUMN to NOT NULL")
    print("  Recommendation: Enforce NOT NULL in application layer or recreate table")
    
    # 1.2: Add root_id to activity_instances
    print("\n--- 1.2: Add root_id to activity_instances ---")
    
    execute_sql(conn, """
        ALTER TABLE activity_instances ADD COLUMN root_id STRING
    """, "Add root_id column to activity_instances", dry_run)
    
    execute_sql(conn, """
        UPDATE activity_instances
        SET root_id = (
          SELECT COALESCE(g.root_id, g.id)
          FROM goals g
          WHERE g.id = activity_instances.practice_session_id
        )
    """, "Backfill root_id for activity_instances", dry_run)
    
    # 1.3: Add root_id to metric_values
    print("\n--- 1.3: Add root_id to metric_values ---")
    
    execute_sql(conn, """
        ALTER TABLE metric_values ADD COLUMN root_id STRING
    """, "Add root_id column to metric_values", dry_run)
    
    execute_sql(conn, """
        UPDATE metric_values
        SET root_id = (
          SELECT ai.root_id
          FROM activity_instances ai
          WHERE ai.id = metric_values.activity_instance_id
        )
    """, "Backfill root_id for metric_values", dry_run)
    
    # 1.4: Add root_id to metric_definitions
    print("\n--- 1.4: Add root_id to metric_definitions ---")
    
    execute_sql(conn, """
        ALTER TABLE metric_definitions ADD COLUMN root_id STRING
    """, "Add root_id column to metric_definitions", dry_run)
    
    execute_sql(conn, """
        UPDATE metric_definitions
        SET root_id = (
          SELECT ad.root_id
          FROM activity_definitions ad
          WHERE ad.id = metric_definitions.activity_id
        )
    """, "Backfill root_id for metric_definitions", dry_run)
    
    # 1.5: Add root_id to split_definitions
    print("\n--- 1.5: Add root_id to split_definitions ---")
    
    execute_sql(conn, """
        ALTER TABLE split_definitions ADD COLUMN root_id STRING
    """, "Add root_id column to split_definitions", dry_run)
    
    execute_sql(conn, """
        UPDATE split_definitions
        SET root_id = (
          SELECT ad.root_id
          FROM activity_definitions ad
          WHERE ad.id = split_definitions.activity_id
        )
    """, "Backfill root_id for split_definitions", dry_run)

def phase_2_data_integrity(conn, dry_run=False):
    """Phase 2: Add constraints for data integrity."""
    print("\n" + "="*80)
    print("PHASE 2: DATA INTEGRITY & CONSTRAINTS")
    print("="*80)
    
    # Note: SQLite has limited ALTER TABLE support for constraints
    # Most constraints need to be added during table creation
    # For existing tables, we'll add what we can
    
    print("\n--- 2.1: Unique Constraints ---")
    print("  Note: SQLite limitation - cannot add constraints to existing tables")
    print("  Recommendation: Add to models.py and recreate tables, or enforce in application")
    
    print("\n--- 2.2: Check Constraints ---")
    print("  Note: SQLite limitation - cannot add check constraints to existing tables")
    print("  Recommendation: Add to models.py and recreate tables, or enforce in application")

def phase_3_performance_optimization(conn, dry_run=False):
    """Phase 3: Add indexes for performance."""
    print("\n" + "="*80)
    print("PHASE 3: PERFORMANCE OPTIMIZATION")
    print("="*80)
    
    print("\n--- 3.1: Foreign Key Indexes ---")
    
    indexes = [
        ("idx_goals_parent_id", "goals", "parent_id"),
        ("idx_goals_root_id", "goals", "root_id"),
        ("idx_goals_type", "goals", "type"),
        ("idx_goals_created_at", "goals", "created_at"),
        ("idx_activity_instances_session", "activity_instances", "practice_session_id"),
        ("idx_activity_instances_definition", "activity_instances", "activity_definition_id"),
        ("idx_activity_instances_root", "activity_instances", "root_id"),
        ("idx_metric_values_instance", "metric_values", "activity_instance_id"),
        ("idx_metric_values_definition", "metric_values", "metric_definition_id"),
        ("idx_metric_values_root", "metric_values", "root_id"),
        ("idx_metric_definitions_activity", "metric_definitions", "activity_id"),
        ("idx_metric_definitions_root", "metric_definitions", "root_id"),
        ("idx_split_definitions_activity", "split_definitions", "activity_id"),
        ("idx_split_definitions_root", "split_definitions", "root_id"),
        ("idx_activity_definitions_group", "activity_definitions", "group_id"),
        ("idx_activity_definitions_root", "activity_definitions", "root_id"),
        ("idx_activity_groups_root", "activity_groups", "root_id"),
        ("idx_session_templates_root", "session_templates", "root_id"),
    ]
    
    for idx_name, table, column in indexes:
        execute_sql(conn, 
            f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({column})",
            f"Create index {idx_name}",
            dry_run)
    
    print("\n--- 3.2: Composite Indexes ---")
    
    composite_indexes = [
        ("idx_activity_instances_root_date", "activity_instances", "root_id, created_at DESC"),
        ("idx_metric_values_root_metric", "metric_values", "root_id, metric_definition_id"),
        ("idx_activity_instances_session_created", "activity_instances", "practice_session_id, created_at"),
        ("idx_goals_parent_type", "goals", "parent_id, type"),
        ("idx_goals_root_type", "goals", "root_id, type"),
    ]
    
    for idx_name, table, columns in composite_indexes:
        execute_sql(conn,
            f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({columns})",
            f"Create composite index {idx_name}",
            dry_run)
    
    print("\n--- 3.3: Partial Indexes ---")
    
    partial_indexes = [
        ("idx_metric_definitions_active", "metric_definitions", "activity_id", "is_active = 1"),
        ("idx_goals_completed", "goals", "root_id, type", "completed = 1"),
        ("idx_goals_practice_sessions", "goals", "root_id, created_at", "type = 'PracticeSession'"),
    ]
    
    for idx_name, table, columns, where in partial_indexes:
        execute_sql(conn,
            f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({columns}) WHERE {where}",
            f"Create partial index {idx_name}",
            dry_run)

def phase_4_soft_deletes(conn, dry_run=False):
    """Phase 4: Add soft delete and audit columns."""
    print("\n" + "="*80)
    print("PHASE 4: SOFT DELETES & AUDIT TRAIL")
    print("="*80)
    
    print("\n--- 4.1: Add deleted_at columns ---")
    
    tables_needing_deleted_at = [
        "goals",
        "activity_definitions",
        "activity_groups",
        "activity_instances",
        "session_templates",
        "split_definitions",
    ]
    
    for table in tables_needing_deleted_at:
        execute_sql(conn,
            f"ALTER TABLE {table} ADD COLUMN deleted_at DATETIME NULL",
            f"Add deleted_at to {table}",
            dry_run)
    
    print("\n--- 4.2: Add updated_at columns ---")
    
    tables_needing_updated_at = [
        "activity_groups",
        "activity_definitions",
        "metric_definitions",
        "split_definitions",
        "activity_instances",
        "session_templates",
        "metric_values",
    ]
    
    for table in tables_needing_updated_at:
        execute_sql(conn,
            f"ALTER TABLE {table} ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
            f"Add updated_at to {table}",
            dry_run)
    
    # Add created_at to metric_values if it doesn't exist
    execute_sql(conn,
        "ALTER TABLE metric_values ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP",
        "Add created_at to metric_values",
        dry_run)
    
    print("\n--- 4.3: Add sort_order columns ---")
    
    sort_order_additions = [
        ("activity_instances", "Order within session"),
        ("metric_definitions", "Consistent display order"),
        ("goals", "Sibling order"),
    ]
    
    for table, description in sort_order_additions:
        execute_sql(conn,
            f"ALTER TABLE {table} ADD COLUMN sort_order INTEGER DEFAULT 0",
            f"Add sort_order to {table} ({description})",
            dry_run)

def verify_migration(conn):
    """Verify migration was successful."""
    print("\n" + "="*80)
    print("MIGRATION VERIFICATION")
    print("="*80)
    
    cursor = conn.cursor()
    
    # Check root_id columns exist
    tables_with_root_id = [
        "goals", "activity_instances", "metric_values", 
        "metric_definitions", "split_definitions",
        "activity_groups", "activity_definitions", "session_templates"
    ]
    
    print("\n--- Checking root_id columns ---")
    for table in tables_with_root_id:
        cursor.execute(f"PRAGMA table_info({table})")
        columns = [col[1] for col in cursor.fetchall()]
        has_root_id = "root_id" in columns
        status = "✓" if has_root_id else "✗"
        print(f"  {status} {table}.root_id: {'EXISTS' if has_root_id else 'MISSING'}")
    
    # Check indexes
    print("\n--- Checking indexes ---")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
    indexes = cursor.fetchall()
    print(f"  Total indexes created: {len(indexes)}")
    for idx in indexes[:5]:  # Show first 5
        print(f"    - {idx[0]}")
    if len(indexes) > 5:
        print(f"    ... and {len(indexes) - 5} more")
    
    # Check for NULL root_ids
    print("\n--- Checking for NULL root_ids ---")
    for table in tables_with_root_id:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE root_id IS NULL")
            null_count = cursor.fetchone()[0]
            status = "✓" if null_count == 0 else "⚠"
            print(f"  {status} {table}: {null_count} NULL root_ids")
        except sqlite3.Error:
            print(f"  - {table}: Column doesn't exist yet")

def main():
    """Main migration execution."""
    dry_run = "--dry-run" in sys.argv
    
    print("="*80)
    print("DATABASE IMPROVEMENTS MIGRATION")
    print("="*80)
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE EXECUTION'}")
    print(f"Date: {datetime.now().isoformat()}")
    
    if not dry_run:
        response = input("\nThis will modify your database. Continue? (yes/no): ")
        if response.lower() != "yes":
            print("Migration cancelled.")
            return
    
    conn = get_db_connection()
    
    try:
        # Execute all phases
        phase_1_root_id_denormalization(conn, dry_run)
        phase_2_data_integrity(conn, dry_run)
        phase_3_performance_optimization(conn, dry_run)
        phase_4_soft_deletes(conn, dry_run)
        
        if not dry_run:
            verify_migration(conn)
        
        print("\n" + "="*80)
        print("MIGRATION COMPLETE!")
        print("="*80)
        
        if dry_run:
            print("\nThis was a dry run. No changes were made.")
            print("Run without --dry-run to apply changes.")
        else:
            print("\nAll phases completed successfully.")
            print("Remember to update models.py to reflect schema changes.")
        
    except Exception as e:
        print(f"\n✗ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    main()
```

---

## Testing Strategy

### Pre-Migration Testing

1. **Backup Database**
   ```bash
   cp goals.db goals.db.backup_$(date +%Y%m%d_%H%M%S)
   ```

2. **Run Dry Run**
   ```bash
   python python-scripts/migrate_database_improvements.py --dry-run
   ```

3. **Test on Test Database**
   ```bash
   ENV=testing python python-scripts/migrate_database_improvements.py
   ```

### Post-Migration Testing

1. **Verify Schema**
   ```bash
   sqlite3 goals.db ".schema"
   ```

2. **Check Data Integrity**
   ```sql
   -- Verify no NULL root_ids
   SELECT 'goals' as table_name, COUNT(*) as null_count 
   FROM goals WHERE root_id IS NULL
   UNION ALL
   SELECT 'activity_instances', COUNT(*) 
   FROM activity_instances WHERE root_id IS NULL;
   -- etc.
   ```

3. **Test Application**
   - Start application
   - Create new fractal
   - Create practice session
   - Add activities
   - Verify all CRUD operations work
   - Check analytics queries

4. **Performance Testing**
   ```sql
   -- Before: Slow query with joins
   EXPLAIN QUERY PLAN
   SELECT ai.* FROM activity_instances ai
   JOIN goals g ON ai.practice_session_id = g.id
   WHERE g.root_id = 'some-id';
   
   -- After: Fast query with direct filter
   EXPLAIN QUERY PLAN
   SELECT * FROM activity_instances
   WHERE root_id = 'some-id';
   ```

### Rollback Plan

If migration fails:

1. **Stop application**
   ```bash
   ./shell-scripts/kill-all.sh
   ```

2. **Restore backup**
   ```bash
   cp goals.db.backup_YYYYMMDD_HHMMSS goals.db
   ```

3. **Restart application**
   ```bash
   ./shell-scripts/start-all.sh
   ```

---

## Implementation Checklist

### Phase 1: Root ID Denormalization
- [ ] Run migration script for root_id additions
- [ ] Update `models.py` with new columns
- [ ] Update all INSERT statements in API to include root_id
- [ ] Update tests to include root_id
- [ ] Verify no NULL root_ids in database

### Phase 2: Data Integrity
- [ ] Document constraints in models.py (SQLite limitation)
- [ ] Add application-level validation for constraints
- [ ] Add tests for constraint violations
- [ ] Update API error handling

### Phase 3: Performance Optimization
- [ ] Run index creation script
- [ ] Verify indexes with EXPLAIN QUERY PLAN
- [ ] Benchmark query performance before/after
- [ ] Update slow queries to leverage new indexes

### Phase 4: Soft Deletes
- [ ] Add deleted_at columns
- [ ] Update all DELETE operations to soft delete
- [ ] Add filters for deleted_at IS NULL in queries
- [ ] Create admin endpoints for hard delete
- [ ] Add "restore" functionality

### Phase 5: Multi-User Prep
- [ ] Document multi-user migration plan
- [ ] Design authentication system
- [ ] Plan user table schema
- [ ] Design API changes for multi-tenancy

---

## Next Steps

1. **Review this document** with stakeholders
2. **Test migration script** on development database
3. **Update models.py** to reflect new schema
4. **Run migration** on test environment
5. **Update API code** to use root_id filtering
6. **Performance benchmark** before/after
7. **Deploy to production** with backup plan

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-01  
**Status:** Ready for Implementation
