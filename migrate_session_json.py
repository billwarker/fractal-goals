"""
Database Migration Script - Add session_data and session_templates

This script adds:
1. session_data column to practice_sessions table
2. session_templates table

Run this script to migrate your existing database.
"""

import sqlite3
import os

DB_PATH = 'goals.db'

def migrate_database():
    """Add new columns and tables to existing database."""
    
    if not os.path.exists(DB_PATH):
        print(f"Database {DB_PATH} not found. Creating new database...")
        # If database doesn't exist, just create it with init_db
        from models import get_engine, init_db
        engine = get_engine(f'sqlite:///{DB_PATH}')
        init_db(engine)
        print("New database created successfully!")
        return
    
    print(f"Migrating database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if session_data column already exists
        cursor.execute("PRAGMA table_info(practice_sessions)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'session_data' not in columns:
            print("Adding session_data column to practice_sessions table...")
            cursor.execute("""
                ALTER TABLE practice_sessions 
                ADD COLUMN session_data TEXT
            """)
            print("✓ Added session_data column")
        else:
            print("✓ session_data column already exists")
        
        # Check if session_templates table exists
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='session_templates'
        """)
        
        if not cursor.fetchone():
            print("Creating session_templates table...")
            cursor.execute("""
                CREATE TABLE session_templates (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    root_id TEXT NOT NULL,
                    created_at TIMESTAMP,
                    template_data TEXT NOT NULL,
                    FOREIGN KEY (root_id) REFERENCES goals(id)
                )
            """)
            print("✓ Created session_templates table")
        else:
            print("✓ session_templates table already exists")
        
        conn.commit()
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    print("=" * 60)
    print("Database Migration: Session JSON Structure")
    print("=" * 60)
    print()
    
    migrate_database()
    
    print()
    print("=" * 60)
    print("Migration complete! You can now:")
    print("1. Create session templates")
    print("2. Use templates to create practice sessions")
    print("3. Store rich session data in JSON format")
    print("=" * 60)
