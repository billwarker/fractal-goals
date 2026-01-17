"""
SMART Goals Migration Script

Adds the following changes to support SMART goals:
1. relevance_statement column to goals table - User's explanation of how goal helps parent
2. is_smart column to goals table - Computed flag for SMART status
3. activity_goal_associations table - Links activities to goals for "Achievable" criterion

Run this script to migrate existing databases.
"""

import sqlite3
import os
import sys
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def get_db_paths():
    """Get all database paths to migrate."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return [
        os.path.join(base_dir, 'goals_dev.db'),
        os.path.join(base_dir, 'goals_test.db'),
        os.path.join(base_dir, 'goals.db'),
    ]

def migrate_database(db_path):
    """Apply SMART goals migration to a single database."""
    if not os.path.exists(db_path):
        print(f"  Skipping {db_path} - file does not exist")
        return False
    
    print(f"\nMigrating: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    changes_made = False
    
    try:
        # 1. Add relevance_statement column to goals table
        cursor.execute("PRAGMA table_info(goals)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'relevance_statement' not in columns:
            print("  Adding 'relevance_statement' column to goals table...")
            cursor.execute("ALTER TABLE goals ADD COLUMN relevance_statement TEXT")
            changes_made = True
        else:
            print("  'relevance_statement' column already exists")
        
        # 2. Add is_smart column to goals table
        if 'is_smart' not in columns:
            print("  Adding 'is_smart' column to goals table...")
            cursor.execute("ALTER TABLE goals ADD COLUMN is_smart BOOLEAN DEFAULT 0")
            changes_made = True
        else:
            print("  'is_smart' column already exists")
        
        # 3. Create activity_goal_associations table
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='activity_goal_associations'
        """)
        
        if not cursor.fetchone():
            print("  Creating 'activity_goal_associations' table...")
            cursor.execute("""
                CREATE TABLE activity_goal_associations (
                    activity_id TEXT NOT NULL,
                    goal_id TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (activity_id, goal_id),
                    FOREIGN KEY (activity_id) REFERENCES activity_definitions(id) ON DELETE CASCADE,
                    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
                )
            """)
            
            # Create indexes for efficient queries
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_activity_goal_activity 
                ON activity_goal_associations(activity_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_activity_goal_goal 
                ON activity_goal_associations(goal_id)
            """)
            changes_made = True
        else:
            print("  'activity_goal_associations' table already exists")
        
        conn.commit()
        
        if changes_made:
            print(f"  ✅ Migration completed successfully")
        else:
            print(f"  ℹ️  No changes needed - already up to date")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error during migration: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def main():
    print("=" * 60)
    print("SMART Goals Migration")
    print("=" * 60)
    print(f"Started at: {datetime.now().isoformat()}")
    
    db_paths = get_db_paths()
    results = []
    
    for db_path in db_paths:
        success = migrate_database(db_path)
        results.append((db_path, success))
    
    print("\n" + "=" * 60)
    print("Migration Summary")
    print("=" * 60)
    
    for db_path, success in results:
        status = "✅ Success" if success else "⚠️  Skipped/Failed"
        print(f"  {os.path.basename(db_path)}: {status}")
    
    print(f"\nCompleted at: {datetime.now().isoformat()}")

if __name__ == "__main__":
    main()
