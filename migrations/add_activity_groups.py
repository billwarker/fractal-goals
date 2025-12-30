"""
Migration: Add Activity Groups
Date: 2025-12-30
Description: Creates activity_groups table and adds group_id to activity_definitions
"""

import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

def run_migration(db_path):
    """Execute the migration on the specified database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Starting migration: Add Activity Groups")
    print(f"Database: {db_path}")
    
    try:
        # Step 1: Create activity_groups table
        print("\n[1/3] Creating activity_groups table...")
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activity_groups (
                id VARCHAR PRIMARY KEY,
                root_id VARCHAR NOT NULL,
                name VARCHAR NOT NULL,
                description VARCHAR DEFAULT '',
                created_at TIMESTAMP,
                FOREIGN KEY (root_id) REFERENCES goals(id)
            )
        """)
        print("  ✓ Created activity_groups table")
        
        # Step 2: Add group_id to activity_definitions
        print("\n[2/3] Adding group_id to activity_definitions...")
        
        try:
            cursor.execute("""
                ALTER TABLE activity_definitions 
                ADD COLUMN group_id VARCHAR REFERENCES activity_groups(id)
            """)
            print("  ✓ Added group_id column")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e):
                print("  ✓ group_id column already exists")
            else:
                raise e
        
        # Step 3: Create index on group_id
        print("\n[3/3] Creating index on group_id...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_activity_group 
            ON activity_definitions(group_id)
        """)
        print("  ✓ Created index on group_id")
        
        # Determine success
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
    from pathlib import Path
    
    # Get database path from config
    project_root = Path(__file__).parent.parent
    sys.path.insert(0, str(project_root))
    
    from config import config
    # Force development db for now since users usually run in dev unless specified
    # Actually rely on config which defaults based on ENV
    db_path = config.get_db_path()
    
    print(f"Using database: {db_path}")
    run_migration(db_path)
