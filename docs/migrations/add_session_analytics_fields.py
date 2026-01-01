"""
Migration: Add Session Analytics Fields
Date: 2025-12-30
Description: Adds session_start, session_end, total_duration_seconds, and template_id 
             columns to the goals table for efficient session analytics queries.
             Also renames session_data to attributes for semantic clarity.
"""

import sqlite3
import json
from datetime import datetime
from pathlib import Path

def run_migration(db_path):
    """Execute the migration on the specified database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Starting migration: Add Session Analytics Fields")
    print(f"Database: {db_path}")
    
    try:
        # Step 1: Add new columns
        print("\n[1/5] Adding new columns...")
        
        cursor.execute("""
            ALTER TABLE goals 
            ADD COLUMN session_start TIMESTAMP
        """)
        print("  ✓ Added session_start column")
        
        cursor.execute("""
            ALTER TABLE goals 
            ADD COLUMN session_end TIMESTAMP
        """)
        print("  ✓ Added session_end column")
        
        cursor.execute("""
            ALTER TABLE goals 
            ADD COLUMN total_duration_seconds INTEGER
        """)
        print("  ✓ Added total_duration_seconds column")
        
        cursor.execute("""
            ALTER TABLE goals 
            ADD COLUMN template_id TEXT
        """)
        print("  ✓ Added template_id column")
        
        # Step 2: Rename session_data to attributes
        print("\n[2/5] Renaming session_data to attributes...")
        # SQLite doesn't support RENAME COLUMN directly in older versions
        # We'll use a workaround: create new column, copy data, drop old
        
        cursor.execute("""
            ALTER TABLE goals 
            ADD COLUMN attributes TEXT
        """)
        
        cursor.execute("""
            UPDATE goals 
            SET attributes = session_data
        """)
        print("  ✓ Copied session_data to attributes")
        
        # Note: We'll keep session_data for now for backward compatibility
        # Can drop it in a future migration after confirming everything works
        
        # Step 3: Backfill data for existing practice sessions
        print("\n[3/5] Backfilling data for existing practice sessions...")
        
        cursor.execute("""
            SELECT id, created_at, attributes 
            FROM goals 
            WHERE type = 'PracticeSession'
        """)
        
        sessions = cursor.fetchall()
        updated_count = 0
        
        for session_id, created_at, attributes_json in sessions:
            # Initialize session_start with created_at
            session_start = created_at
            session_end = None
            total_duration = 0
            template_id = None
            
            # Parse attributes to get template_id and calculate duration
            if attributes_json:
                try:
                    attributes = json.loads(attributes_json)
                    
                    # Get template_id if it exists
                    template_id = attributes.get('template_id')
                    
                    # Check if session_start/end already exist in JSON
                    if attributes.get('session_start'):
                        session_start = attributes['session_start']
                    if attributes.get('session_end'):
                        session_end = attributes['session_end']
                    
                    # Calculate total duration from activities
                    sections = attributes.get('sections', [])
                    for section in sections:
                        exercises = section.get('exercises', [])
                        for exercise in exercises:
                            if exercise.get('duration_seconds'):
                                total_duration += exercise['duration_seconds']
                    
                    # If we have duration but no session_end, calculate it
                    if total_duration > 0 and not session_end and session_start:
                        # Parse the start time and add duration
                        try:
                            start_dt = datetime.fromisoformat(session_start.replace('Z', '+00:00'))
                            from datetime import timedelta
                            end_dt = start_dt + timedelta(seconds=total_duration)
                            session_end = end_dt.isoformat()
                        except:
                            pass
                    
                except json.JSONDecodeError:
                    pass
            
            # Update the record
            cursor.execute("""
                UPDATE goals 
                SET session_start = ?,
                    session_end = ?,
                    total_duration_seconds = ?,
                    template_id = ?
                WHERE id = ?
            """, (session_start, session_end, total_duration if total_duration > 0 else None, template_id, session_id))
            
            updated_count += 1
        
        print(f"  ✓ Updated {updated_count} practice sessions")
        
        # Step 4: Create indexes
        print("\n[4/5] Creating partial indexes for session analytics...")
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_session_start 
            ON goals(session_start) 
            WHERE type = 'PracticeSession'
        """)
        print("  ✓ Created idx_session_start")
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_session_end 
            ON goals(session_end) 
            WHERE type = 'PracticeSession'
        """)
        print("  ✓ Created idx_session_end")
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_template_id 
            ON goals(template_id) 
            WHERE type = 'PracticeSession'
        """)
        print("  ✓ Created idx_template_id")
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_session_duration 
            ON goals(total_duration_seconds) 
            WHERE type = 'PracticeSession'
        """)
        print("  ✓ Created idx_session_duration")
        
        # Step 5: Commit changes
        print("\n[5/5] Committing changes...")
        conn.commit()
        print("  ✓ Migration completed successfully!")
        
        # Print summary
        print("\n" + "="*60)
        print("MIGRATION SUMMARY")
        print("="*60)
        print(f"✓ Added 4 new columns to goals table")
        print(f"✓ Created 'attributes' column (session_data preserved for compatibility)")
        print(f"✓ Backfilled {updated_count} practice sessions")
        print(f"✓ Created 4 partial indexes for analytics")
        print("="*60)
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

def rollback_migration(db_path):
    """Rollback the migration (for development/testing)."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("Rolling back migration...")
    
    try:
        # Drop indexes
        cursor.execute("DROP INDEX IF EXISTS idx_session_start")
        cursor.execute("DROP INDEX IF EXISTS idx_session_end")
        cursor.execute("DROP INDEX IF EXISTS idx_template_id")
        cursor.execute("DROP INDEX IF EXISTS idx_session_duration")
        
        # Note: SQLite doesn't support DROP COLUMN easily
        # In production, you'd need to recreate the table without these columns
        # For now, just clear the data
        cursor.execute("""
            UPDATE goals 
            SET session_start = NULL,
                session_end = NULL,
                total_duration_seconds = NULL,
                template_id = NULL,
                attributes = NULL
            WHERE type = 'PracticeSession'
        """)
        
        conn.commit()
        print("✓ Rollback completed")
    except Exception as e:
        print(f"❌ Rollback failed: {e}")
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
    print("\nOptions:")
    print("  1. Run migration")
    print("  2. Rollback migration")
    print("  3. Exit")
    
    choice = input("\nEnter choice (1-3): ").strip()
    
    if choice == "1":
        run_migration(db_path)
    elif choice == "2":
        rollback_migration(db_path)
    else:
        print("Exiting...")
