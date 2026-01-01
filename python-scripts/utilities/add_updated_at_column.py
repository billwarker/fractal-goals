#!/usr/bin/env python3
"""
Migration script to add updated_at column to goals table.
"""
import sqlite3
import sys
import os
from datetime import datetime

# Add parent directory to path to import config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import config

def migrate():
    db_path = config.get_db_path()
    print(f"Migrating database at: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if updated_at column already exists
    cursor.execute("PRAGMA table_info(goals)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if 'updated_at' not in columns:
        print("Adding updated_at column to goals table...")
        # SQLite doesn't support non-constant defaults in ALTER TABLE
        # So we add the column as nullable first, then update values
        cursor.execute("""
            ALTER TABLE goals 
            ADD COLUMN updated_at TIMESTAMP
        """)
        
        # Update existing rows to have updated_at = created_at
        cursor.execute("""
            UPDATE goals 
            SET updated_at = created_at
        """)
        
        conn.commit()
        print("✓ Migration completed successfully!")
    else:
        print("✓ Column updated_at already exists, skipping migration.")
    
    conn.close()

if __name__ == "__main__":
    migrate()
