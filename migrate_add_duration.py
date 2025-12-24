#!/usr/bin/env python3
"""
Migration Script: Add duration_minutes to practice_sessions table

This script adds the duration_minutes column to the practice_sessions table
to support storing the actual duration of practice sessions.

Usage:
    python migrate_add_duration.py
"""

import sqlite3
import os

def migrate_database():
    """Add duration_minutes column to practice_sessions table."""
    
    # Database path
    db_path = 'goals.db'
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found at {db_path}")
        print("Please run this script from the project root directory.")
        return False
    
    print(f"📊 Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(practice_sessions)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'duration_minutes' in columns:
            print("✓ duration_minutes column already exists")
            return True
        
        print("Adding duration_minutes column to practice_sessions table...")
        
        # Add the new column
        cursor.execute("""
            ALTER TABLE practice_sessions 
            ADD COLUMN duration_minutes INTEGER
        """)
        
        conn.commit()
        print("✓ Successfully added duration_minutes column")
        
        # Verify the change
        cursor.execute("PRAGMA table_info(practice_sessions)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'duration_minutes' in columns:
            print("✓ Migration verified successfully")
            print("\n📋 Updated practice_sessions schema:")
            cursor.execute("PRAGMA table_info(practice_sessions)")
            for col in cursor.fetchall():
                print(f"  - {col[1]} ({col[2]})")
            return True
        else:
            print("❌ Migration verification failed")
            return False
            
    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
        conn.rollback()
        return False
        
    finally:
        conn.close()
        print("\n✓ Database connection closed")

if __name__ == "__main__":
    print("=" * 60)
    print("Practice Session Duration Migration")
    print("=" * 60)
    print()
    
    success = migrate_database()
    
    print()
    if success:
        print("✅ Migration completed successfully!")
        print("\nNext steps:")
        print("1. Restart your Flask server (app.py)")
        print("2. Practice sessions can now store duration_minutes")
        print("3. Update frontend to display and edit duration")
    else:
        print("❌ Migration failed. Please check the errors above.")
    
    print("=" * 60)
