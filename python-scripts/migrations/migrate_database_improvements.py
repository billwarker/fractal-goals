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
        if "duplicate column name" in str(e).lower():
            print(f"  ⚠ Column already exists, skipping")
        else:
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
    print("  Note: SQLite limitation - cannot ALTER COLUMN to NOT NULL")
    print("  Recommendation: Enforce NOT NULL in application layer")
    
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
    
    # SQLite limitation: Cannot add columns with DEFAULT CURRENT_TIMESTAMP
    # Add as NULL, application layer will handle timestamps
    for table in tables_needing_updated_at:
        execute_sql(conn,
            f"ALTER TABLE {table} ADD COLUMN updated_at DATETIME NULL",
            f"Add updated_at to {table}",
            dry_run)
    
    # Add created_at to metric_values if it doesn't exist
    execute_sql(conn,
        "ALTER TABLE metric_values ADD COLUMN created_at DATETIME NULL",
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
