"""
Database migration script to add time tracking fields to activity_instances table.

This script adds:
- time_start (DateTime, nullable)
- time_stop (DateTime, nullable)
- duration_seconds (Integer, nullable)

Run this script to update your existing database.
"""

import sqlite3
from datetime import datetime

def migrate_database(db_path='goals.db'):
    """Add time tracking columns to activity_instances table."""
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"[{datetime.now()}] Starting migration...")
    
    try:
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(activity_instances)")
        columns = [row[1] for row in cursor.fetchall()]
        
        migrations_needed = []
        if 'time_start' not in columns:
            migrations_needed.append('time_start')
        if 'time_stop' not in columns:
            migrations_needed.append('time_stop')
        if 'duration_seconds' not in columns:
            migrations_needed.append('duration_seconds')
        
        if not migrations_needed:
            print("✅ All columns already exist. No migration needed.")
            return
        
        print(f"📝 Adding columns: {', '.join(migrations_needed)}")
        
        # Add columns if they don't exist
        if 'time_start' in migrations_needed:
            cursor.execute("""
                ALTER TABLE activity_instances 
                ADD COLUMN time_start DATETIME
            """)
            print("  ✓ Added time_start column")
        
        if 'time_stop' in migrations_needed:
            cursor.execute("""
                ALTER TABLE activity_instances 
                ADD COLUMN time_stop DATETIME
            """)
            print("  ✓ Added time_stop column")
        
        if 'duration_seconds' in migrations_needed:
            cursor.execute("""
                ALTER TABLE activity_instances 
                ADD COLUMN duration_seconds INTEGER
            """)
            print("  ✓ Added duration_seconds column")
        
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
