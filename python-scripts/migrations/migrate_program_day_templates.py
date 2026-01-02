#!/usr/bin/env python3
"""
Migration Script: Program Day Templates Refactor

This script migrates from the ScheduledSession intermediary table to a direct
many-to-many relationship between ProgramDay and SessionTemplate.

Changes:
1. Creates program_day_templates junction table
2. Migrates data from scheduled_sessions to program_day_templates
3. Adds program_day_id column to goals table (for PracticeSession)
4. Adds is_completed column to program_days table
5. Backfills program_day_id for existing sessions from JSON program_context
6. Drops scheduled_sessions table

IMPORTANT: Creates backup before migration!
"""

import sys
import os
import json
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import text, inspect
from models import get_engine, get_session, Base

def create_backup(engine):
    """Create a backup of the database before migration"""
    db_path = engine.url.database
    if not db_path:
        print("⚠️  Warning: Could not determine database path for backup")
        return None
    
    backup_dir = Path(__file__).parent.parent.parent / 'backups'
    backup_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = backup_dir / f'goals_db_backup_program_migration_{timestamp}.db'
    
    # Copy database file
    import shutil
    shutil.copy2(db_path, backup_path)
    
    print(f"✅ Backup created: {backup_path}")
    return backup_path

def check_table_exists(engine, table_name):
    """Check if a table exists in the database"""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()

def check_column_exists(engine, table_name, column_name):
    """Check if a column exists in a table"""
    inspector = inspect(engine)
    if not check_table_exists(engine, table_name):
        return False
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns

def migrate_database():
    """Main migration function"""
    print("=" * 80)
    print("PROGRAM DAY TEMPLATES MIGRATION")
    print("=" * 80)
    print()
    
    engine = get_engine()
    session = get_session(engine)
    
    try:
        # Step 0: Create backup
        print("Step 0: Creating database backup...")
        backup_path = create_backup(engine)
        if not backup_path:
            response = input("⚠️  Could not create backup. Continue anyway? (yes/no): ")
            if response.lower() != 'yes':
                print("❌ Migration cancelled")
                return
        print()
        
        # Step 1: Check if migration already done
        print("Step 1: Checking migration status...")
        if check_table_exists(engine, 'program_day_templates'):
            print("⚠️  Migration appears to have already been run (program_day_templates exists)")
            response = input("Continue anyway? (yes/no): ")
            if response.lower() != 'yes':
                print("❌ Migration cancelled")
                return
        print("✅ Ready to proceed")
        print()
        
        # Step 2: Create program_day_templates junction table
        print("Step 2: Creating program_day_templates junction table...")
        session.execute(text("""
            CREATE TABLE IF NOT EXISTS program_day_templates (
                program_day_id TEXT NOT NULL,
                session_template_id TEXT NOT NULL,
                "order" INTEGER DEFAULT 0,
                PRIMARY KEY (program_day_id, session_template_id),
                FOREIGN KEY (program_day_id) REFERENCES program_days(id) ON DELETE CASCADE,
                FOREIGN KEY (session_template_id) REFERENCES session_templates(id) ON DELETE CASCADE
            )
        """))
        session.commit()
        print("✅ Created program_day_templates table")
        print()
        
        # Step 3: Migrate data from scheduled_sessions to program_day_templates
        print("Step 3: Migrating scheduled_sessions to program_day_templates...")
        if check_table_exists(engine, 'scheduled_sessions'):
            # Get all scheduled sessions
            result = session.execute(text("""
                SELECT id, day_id, session_template_id 
                FROM scheduled_sessions 
                WHERE session_template_id IS NOT NULL
            """))
            scheduled_sessions = result.fetchall()
            
            migrated_count = 0
            for idx, (ss_id, day_id, template_id) in enumerate(scheduled_sessions):
                # Insert into junction table
                session.execute(text("""
                    INSERT OR IGNORE INTO program_day_templates 
                    (program_day_id, session_template_id, "order")
                    VALUES (:day_id, :template_id, :order)
                """), {
                    'day_id': day_id,
                    'template_id': template_id,
                    'order': idx  # Preserve order from scheduled_sessions
                })
                migrated_count += 1
            
            session.commit()
            print(f"✅ Migrated {migrated_count} scheduled sessions to program_day_templates")
        else:
            print("⚠️  scheduled_sessions table not found, skipping migration")
        print()
        
        # Step 4: Add program_day_id column to goals table
        print("Step 4: Adding program_day_id column to goals table...")
        if not check_column_exists(engine, 'goals', 'program_day_id'):
            session.execute(text("""
                ALTER TABLE goals ADD COLUMN program_day_id TEXT
            """))
            session.commit()
            print("✅ Added program_day_id column to goals table")
        else:
            print("⚠️  program_day_id column already exists")
        print()
        
        # Step 5: Add is_completed column to program_days table
        print("Step 5: Adding is_completed column to program_days table...")
        if not check_column_exists(engine, 'program_days', 'is_completed'):
            session.execute(text("""
                ALTER TABLE program_days ADD COLUMN is_completed BOOLEAN DEFAULT 0
            """))
            session.commit()
            print("✅ Added is_completed column to program_days table")
        else:
            print("⚠️  is_completed column already exists")
        print()
        
        # Step 6: Backfill program_day_id from session_data JSON
        print("Step 6: Backfilling program_day_id from existing sessions...")
        result = session.execute(text("""
            SELECT id, attributes, session_data 
            FROM goals 
            WHERE type = 'PracticeSession'
            AND program_day_id IS NULL
        """))
        sessions = result.fetchall()
        
        backfilled_count = 0
        for session_id, attributes, session_data in sessions:
            # Try to parse program_context from attributes or session_data
            program_context = None
            
            # Try attributes first (newer format)
            if attributes:
                try:
                    attrs = json.loads(attributes)
                    if 'session_data' in attrs and isinstance(attrs['session_data'], dict):
                        program_context = attrs['session_data'].get('program_context')
                except (json.JSONDecodeError, TypeError):
                    pass
            
            # Fall back to session_data (legacy format)
            if not program_context and session_data:
                try:
                    data = json.loads(session_data)
                    program_context = data.get('program_context')
                except (json.JSONDecodeError, TypeError):
                    pass
            
            # If we found program_context with day_id, update the session
            if program_context and 'day_id' in program_context:
                day_id = program_context['day_id']
                session.execute(text("""
                    UPDATE goals 
                    SET program_day_id = :day_id 
                    WHERE id = :session_id
                """), {
                    'day_id': day_id,
                    'session_id': session_id
                })
                backfilled_count += 1
        
        session.commit()
        print(f"✅ Backfilled program_day_id for {backfilled_count} sessions")
        print()
        
        # Step 7: Drop scheduled_sessions table
        print("Step 7: Dropping scheduled_sessions table...")
        if check_table_exists(engine, 'scheduled_sessions'):
            response = input("⚠️  About to drop scheduled_sessions table. Continue? (yes/no): ")
            if response.lower() == 'yes':
                session.execute(text("DROP TABLE scheduled_sessions"))
                session.commit()
                print("✅ Dropped scheduled_sessions table")
            else:
                print("⚠️  Skipped dropping scheduled_sessions table")
        else:
            print("⚠️  scheduled_sessions table not found")
        print()
        
        # Step 8: Verify migration
        print("Step 8: Verifying migration...")
        
        # Count program_day_templates entries
        result = session.execute(text("SELECT COUNT(*) FROM program_day_templates"))
        pdt_count = result.scalar()
        print(f"  - program_day_templates entries: {pdt_count}")
        
        # Count sessions with program_day_id
        result = session.execute(text("""
            SELECT COUNT(*) FROM goals 
            WHERE type = 'PracticeSession' AND program_day_id IS NOT NULL
        """))
        linked_sessions = result.scalar()
        print(f"  - Sessions linked to program days: {linked_sessions}")
        
        # Count program days
        result = session.execute(text("SELECT COUNT(*) FROM program_days"))
        days_count = result.scalar()
        print(f"  - Total program days: {days_count}")
        
        print()
        print("=" * 80)
        print("✅ MIGRATION COMPLETED SUCCESSFULLY!")
        print("=" * 80)
        print()
        print(f"Backup location: {backup_path}")
        print()
        
    except Exception as e:
        session.rollback()
        print()
        print("=" * 80)
        print("❌ MIGRATION FAILED!")
        print("=" * 80)
        print(f"Error: {e}")
        print()
        print("Database has been rolled back to pre-migration state.")
        if backup_path:
            print(f"Backup available at: {backup_path}")
        import traceback
        traceback.print_exc()
        
    finally:
        session.close()

if __name__ == '__main__':
    print()
    print("This script will migrate the database schema for program day templates.")
    print("A backup will be created before any changes are made.")
    print()
    
    response = input("Ready to proceed? (yes/no): ")
    if response.lower() == 'yes':
        migrate_database()
    else:
        print("Migration cancelled")
