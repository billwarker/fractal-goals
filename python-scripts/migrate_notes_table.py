#!/usr/bin/env python3
"""
Migration script to create the notes table for the Notes System.

This script creates the `notes` table which stores timestamped notes
attached to any entity (goals, sessions, activity instances, programs, program days).

Usage:
    python python-scripts/migrate_notes_table.py

The script will:
1. Create the `notes` table with all required columns
2. Create indexes for efficient querying
"""

import sys
import os
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text, inspect
from config import config

def run_migration():
    """Run the notes table migration."""
    
    db_path = config.get_db_path()
    engine = create_engine(f"sqlite:///{db_path}")
    
    print(f"🔧 Notes Table Migration")
    print(f"📁 Database: {db_path}")
    print(f"🌍 Environment: {config.ENV}")
    print("-" * 50)
    
    # Check if table already exists
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    if 'notes' in existing_tables:
        print("⚠️  Table 'notes' already exists. Checking columns...")
        existing_columns = [col['name'] for col in inspector.get_columns('notes')]
        print(f"   Existing columns: {existing_columns}")
        
        # Check if we need to add any missing columns
        expected_columns = [
            'id', 'content', 'content_type', 'entity_type', 'entity_id',
            'root_id', 'session_id', 'program_day_id', 'program_id',
            'created_at', 'updated_at', 'deleted_at', 'note_metadata'
        ]
        
        missing = [col for col in expected_columns if col not in existing_columns]
        if missing:
            print(f"❌ Missing columns: {missing}")
            print("   Please drop and recreate the table, or add columns manually.")
            return False
        else:
            print("✅ All expected columns present. Migration complete.")
            return True
    
    # Create the notes table
    print("📝 Creating 'notes' table...")
    
    with engine.begin() as conn:
        # Create table
        conn.execute(text("""
            CREATE TABLE notes (
                id              VARCHAR(36) PRIMARY KEY,
                
                -- Content
                content         TEXT NOT NULL,
                content_type    VARCHAR(20) DEFAULT 'text',
                
                -- Polymorphic entity reference
                entity_type     VARCHAR(50) NOT NULL,
                entity_id       VARCHAR(36) NOT NULL,
                
                -- Denormalized for efficient queries
                root_id         VARCHAR(36) NOT NULL,
                
                -- Optional: Denormalized parent references for fast aggregation
                session_id      VARCHAR(36),
                program_day_id  VARCHAR(36),
                program_id      VARCHAR(36),
                
                -- Timestamps
                created_at      DATETIME NOT NULL,
                updated_at      DATETIME,
                deleted_at      DATETIME,
                
                -- Future: Rich content
                note_metadata   TEXT,
                
                -- Foreign keys
                FOREIGN KEY (root_id) REFERENCES goals(id) ON DELETE CASCADE,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
                FOREIGN KEY (program_day_id) REFERENCES program_days(id) ON DELETE SET NULL,
                FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
            )
        """))
        print("   ✅ Table created")
        
        # Create indexes
        print("📊 Creating indexes...")
        
        conn.execute(text("""
            CREATE INDEX idx_notes_entity ON notes (entity_type, entity_id)
        """))
        print("   ✅ idx_notes_entity")
        
        conn.execute(text("""
            CREATE INDEX idx_notes_root_created ON notes (root_id, created_at DESC)
        """))
        print("   ✅ idx_notes_root_created")
        
        conn.execute(text("""
            CREATE INDEX idx_notes_session ON notes (session_id, created_at DESC)
        """))
        print("   ✅ idx_notes_session")
        
        conn.execute(text("""
            CREATE INDEX idx_notes_program ON notes (program_id, created_at DESC)
        """))
        print("   ✅ idx_notes_program")
        
        conn.execute(text("""
            CREATE INDEX idx_notes_program_day ON notes (program_day_id, created_at DESC)
        """))
        print("   ✅ idx_notes_program_day")
    
    print("-" * 50)
    print("✅ Migration completed successfully!")
    return True


if __name__ == "__main__":
    try:
        success = run_migration()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
