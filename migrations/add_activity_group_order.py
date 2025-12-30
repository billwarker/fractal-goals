"""
Migration: Add Activity Group Order
Date: 2025-12-30
Description: Adds sort_order column to activity_groups
"""

import sqlite3
from pathlib import Path
from collections import defaultdict

def run_migration(db_path):
    """Execute the migration on the specified database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Starting migration: Add Activity Group Order")
    print(f"Database: {db_path}")
    
    try:
        # Step 1: Add sort_order column
        print("\n[1/2] Adding sort_order column...")
        try:
            cursor.execute("ALTER TABLE activity_groups ADD COLUMN sort_order INTEGER DEFAULT 0")
            print("  ✓ Added sort_order column")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e):
                print("  ✓ sort_order column already exists")
            else:
                raise e
        
        # Step 2: Backfill order based on creation time
        print("\n[2/2] Backfilling sort order...")
        
        # Fetch all groups ordered by creation time (if available) or just rowid
        # Note: activity_groups has created_at
        cursor.execute("SELECT id, root_id FROM activity_groups ORDER BY created_at")
        groups = cursor.fetchall()
        
        # Group by root_id
        groups_by_root = defaultdict(list)
        for g_id, r_id in groups:
            groups_by_root[r_id].append(g_id)
            
        updated_count = 0
        for r_id, g_ids in groups_by_root.items():
            for idx, g_id in enumerate(g_ids):
                cursor.execute("UPDATE activity_groups SET sort_order = ? WHERE id = ?", (idx, g_id))
                updated_count += 1
                
        print(f"  ✓ Updated sort order for {updated_count} groups")
        
        conn.commit()
        print("\nMigration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    import sys
    
    # Get database path from config
    project_root = Path(__file__).parent.parent
    sys.path.insert(0, str(project_root))
    
    from config import config
    db_path = config.get_db_path()
    
    run_migration(db_path)
