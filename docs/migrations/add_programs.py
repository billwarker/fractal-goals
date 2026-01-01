"""
Migration: Add Programs
Date: 2025-12-31
Description: Creates programs table for storing structured training programs
"""

import sqlite3
from pathlib import Path

def run_migration(db_path):
    """Execute the migration on the specified database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Starting migration: Add Programs")
    print(f"Database: {db_path}")
    
    try:
        # Create programs table
        print("\n[1/1] Creating programs table...")
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS programs (
                id VARCHAR PRIMARY KEY,
                root_id VARCHAR NOT NULL,
                name VARCHAR NOT NULL,
                description VARCHAR DEFAULT '',
                start_date TIMESTAMP NOT NULL,
                end_date TIMESTAMP NOT NULL,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                goal_ids TEXT NOT NULL,
                weekly_schedule TEXT NOT NULL,
                FOREIGN KEY (root_id) REFERENCES goals(id)
            )
        """)
        print("  ✓ Created programs table")
        
        # Create index on root_id for faster queries
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_programs_root 
            ON programs(root_id)
        """)
        print("  ✓ Created index on root_id")
        
        # Create index on is_active for filtering
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_programs_active 
            ON programs(is_active)
        """)
        print("  ✓ Created index on is_active")
        
        # Commit changes
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
    db_path = config.get_db_path()
    
    print(f"Using database: {db_path}")
    run_migration(db_path)
