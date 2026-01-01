#!/usr/bin/env python3
"""
Migration script to add metrics_multiplicative column to activity_definitions table.
This enables the derived metric (A × B × C) visualization option on analytics graphs.

Run with: python python-scripts/add_metrics_multiplicative_column.py
"""

import sqlite3
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import config

def migrate():
    """Add metrics_multiplicative column to activity_definitions table."""
    db_path = config.get_db_path()
    print(f"Migrating database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(activity_definitions)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'metrics_multiplicative' in columns:
            print("Column 'metrics_multiplicative' already exists. Skipping migration.")
            return
        
        # Add the new column with default value False (0)
        print("Adding 'metrics_multiplicative' column...")
        cursor.execute("""
            ALTER TABLE activity_definitions 
            ADD COLUMN metrics_multiplicative BOOLEAN DEFAULT 0
        """)
        
        conn.commit()
        print("✅ Migration completed successfully!")
        
        # Verify the column was added
        cursor.execute("PRAGMA table_info(activity_definitions)")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"Activity definition columns: {columns}")
        
    except sqlite3.Error as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
