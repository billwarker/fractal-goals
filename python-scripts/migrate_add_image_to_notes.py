#!/usr/bin/env python3
"""
Migration script to add image_data column to notes table.

This allows notes to contain pasted images stored as base64-encoded data.

Usage:
    python python-scripts/migrate_add_image_to_notes.py [database_path]
    
    If no database_path is provided, defaults to goals_dev.db
"""

import sys
import sqlite3
import os

def migrate_database(db_path):
    """Add image_data column to notes table."""
    
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return False
    
    print(f"Migrating database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(notes)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'image_data' in columns:
            print("  image_data column already exists, skipping...")
            return True
        
        # Add image_data column (TEXT to store base64-encoded data)
        cursor.execute("""
            ALTER TABLE notes ADD COLUMN image_data TEXT
        """)
        
        conn.commit()
        print("  Successfully added image_data column to notes table")
        return True
        
    except Exception as e:
        conn.rollback()
        print(f"  Error during migration: {e}")
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    # Default to dev database
    db_path = sys.argv[1] if len(sys.argv) > 1 else "goals_dev.db"
    
    success = migrate_database(db_path)
    
    if success:
        print("\nMigration completed successfully!")
    else:
        print("\nMigration failed!")
        sys.exit(1)
