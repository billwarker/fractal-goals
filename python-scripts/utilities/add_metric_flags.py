#!/usr/bin/env python3
"""
Migration script to add is_top_set_metric and is_multiplicative columns to metric_definitions table.

- is_top_set_metric: Boolean flag indicating if this metric determines the "top set" for set-based activities
- is_multiplicative: Boolean flag indicating if this metric should be included in product calculations

Run with: python python-scripts/add_metric_flags.py
"""

import sqlite3
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import config

def migrate_database(db_path):
    """Add metric flag columns to metric_definitions table."""
    print(f"\nMigrating database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check existing columns
        cursor.execute("PRAGMA table_info(metric_definitions)")
        columns = [col[1] for col in cursor.fetchall()]
        
        changes_made = False
        
        # Add is_top_set_metric column if it doesn't exist
        if 'is_top_set_metric' not in columns:
            print("  Adding 'is_top_set_metric' column...")
            cursor.execute("""
                ALTER TABLE metric_definitions 
                ADD COLUMN is_top_set_metric BOOLEAN DEFAULT 0
            """)
            changes_made = True
        else:
            print("  Column 'is_top_set_metric' already exists. Skipping.")
        
        # Add is_multiplicative column if it doesn't exist
        if 'is_multiplicative' not in columns:
            print("  Adding 'is_multiplicative' column...")
            cursor.execute("""
                ALTER TABLE metric_definitions 
                ADD COLUMN is_multiplicative BOOLEAN DEFAULT 1
            """)
            changes_made = True
        else:
            print("  Column 'is_multiplicative' already exists. Skipping.")
        
        if changes_made:
            conn.commit()
            print("  ✅ Migration completed successfully!")
        else:
            print("  ℹ️  No changes needed.")
        
        # Verify the columns
        cursor.execute("PRAGMA table_info(metric_definitions)")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"  Metric definition columns: {columns}")
        
    except sqlite3.Error as e:
        print(f"  ❌ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

def migrate_all():
    """Migrate all database files."""
    databases = ['goals.db', 'goals_dev.db', 'goals_test.db']
    
    print("=" * 60)
    print("METRIC FLAGS MIGRATION")
    print("=" * 60)
    
    for db_name in databases:
        db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), db_name)
        if os.path.exists(db_path):
            migrate_database(db_path)
        else:
            print(f"\n⚠️  Database not found: {db_path}")
    
    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE")
    print("=" * 60)

if __name__ == '__main__':
    migrate_all()
