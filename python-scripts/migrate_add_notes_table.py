#!/usr/bin/env python3
"""
Migration: Add notes table for timestamped note-taking.

This migration creates the `notes` table to support:
- Session-level notes
- Activity instance notes
- Set-level notes
- Cross-session note querying by activity definition

Run: python python-scripts/migrate_add_notes_table.py

Environment:
- Set DATABASE_PATH to specify database location
- Defaults to 'goals.db' in current directory
"""

import sqlite3
import os
import sys
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def get_db_path():
    """Get database path from environment or use default."""
    db_path = os.environ.get('DATABASE_PATH', 'goals.db')
    
    # If relative path, make it relative to project root
    if not os.path.isabs(db_path):
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        db_path = os.path.join(project_root, db_path)
    
    return db_path


def migrate():
    """Run the migration to add the notes table."""
    db_path = get_db_path()
    print(f"=== Notes Table Migration ===")
    print(f"Database: {db_path}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print()
    
    if not os.path.exists(db_path):
        print(f"❌ Error: Database not found at {db_path}")
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if table already exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'")
        if cursor.fetchone():
            print("ℹ️  Notes table already exists, skipping migration.")
            return True
        
        print("Creating notes table...")
        cursor.execute('''
            CREATE TABLE notes (
                id TEXT PRIMARY KEY,
                root_id TEXT NOT NULL,
                context_type TEXT NOT NULL,
                context_id TEXT NOT NULL,
                session_id TEXT,
                activity_instance_id TEXT,
                activity_definition_id TEXT,
                set_index INTEGER,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                deleted_at DATETIME,
                FOREIGN KEY (root_id) REFERENCES goals(id) ON DELETE CASCADE,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (activity_instance_id) REFERENCES activity_instances(id) ON DELETE SET NULL,
                FOREIGN KEY (activity_definition_id) REFERENCES activity_definitions(id) ON DELETE SET NULL
            )
        ''')
        print("  ✓ Table created")
        
        # Create indexes for efficient querying
        print("Creating indexes...")
        
        cursor.execute('CREATE INDEX idx_notes_root ON notes(root_id)')
        print("  ✓ idx_notes_root")
        
        cursor.execute('CREATE INDEX idx_notes_context ON notes(context_type, context_id)')
        print("  ✓ idx_notes_context")
        
        cursor.execute('CREATE INDEX idx_notes_session ON notes(session_id)')
        print("  ✓ idx_notes_session")
        
        cursor.execute('CREATE INDEX idx_notes_activity_instance ON notes(activity_instance_id)')
        print("  ✓ idx_notes_activity_instance")
        
        cursor.execute('CREATE INDEX idx_notes_activity_def ON notes(activity_definition_id)')
        print("  ✓ idx_notes_activity_def")
        
        cursor.execute('CREATE INDEX idx_notes_created ON notes(created_at DESC)')
        print("  ✓ idx_notes_created")
        
        cursor.execute('CREATE INDEX idx_notes_deleted ON notes(deleted_at)')
        print("  ✓ idx_notes_deleted")
        
        conn.commit()
        
        print()
        print("✅ Migration complete!")
        print()
        
        # Verify
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'")
        if cursor.fetchone():
            print("Verification: notes table exists ✓")
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_notes%'")
        indexes = cursor.fetchall()
        print(f"Verification: {len(indexes)} indexes created ✓")
        
        return True
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error during migration: {e}")
        return False
    finally:
        conn.close()


if __name__ == '__main__':
    success = migrate()
    sys.exit(0 if success else 1)
