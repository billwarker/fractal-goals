"""
Database migration script to add targets column to goals table.

This script adds:
- targets (Text, nullable) - JSON array of activity targets

Run this script to update your existing database.
"""

import sqlite3
from datetime import datetime

def migrate_database(db_path='goals.db'):
    """Add targets column to goals table."""
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"[{datetime.now()}] Starting migration...")
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(goals)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'targets' in columns:
            print("✅ Column 'targets' already exists. No migration needed.")
            return
        
        print("📝 Adding 'targets' column to goals table...")
        
        # Add targets column
        cursor.execute("""
            ALTER TABLE goals 
            ADD COLUMN targets TEXT
        """)
        print("  ✓ Added targets column")
        
        conn.commit()
        print(f"✅ Migration completed successfully at {datetime.now()}")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
    
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()
