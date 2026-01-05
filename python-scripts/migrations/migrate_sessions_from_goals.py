#!/usr/bin/env python3
"""
Migration Script: Separate Sessions from Goals Table

This migration:
1. Creates a new 'sessions' table for practice sessions
2. Creates a new 'session_goals' junction table (replacing practice_session_goals)
3. Migrates all PracticeSession records from goals table to sessions table
4. Updates activity_instances to use session_id column
5. Cleans up session-specific columns from goals table
6. Updates ImmediateGoals to point to ShortTermGoals instead of sessions

IMPORTANT: Run this on a backup first!
"""

import sqlite3
import os
import sys
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

def get_db_path():
    """Get database path from environment or use default."""
    env = os.environ.get('ENV', 'development')
    if env == 'production':
        return 'goals.db'
    elif env == 'testing':
        return 'goals_test.db'
    else:
        return 'goals_dev.db'

def backup_database(db_path):
    """Create a timestamped backup of the database."""
    backup_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(backup_dir, f'{os.path.basename(db_path)}.{timestamp}.pre_session_migration.bak')
    
    import shutil
    shutil.copy2(db_path, backup_path)
    print(f"✅ Backup created: {backup_path}")
    return backup_path

def migrate(db_path, dry_run=True):
    """Run the migration."""
    print(f"\n{'='*60}")
    print(f"Session Migration Script")
    print(f"Database: {db_path}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE MIGRATION'}")
    print(f"{'='*60}\n")
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        # Step 1: Check current state
        print("Step 1: Analyzing current state...")
        
        # Count sessions in goals table
        cursor.execute("SELECT COUNT(*) FROM goals WHERE type = 'PracticeSession'")
        session_count = cursor.fetchone()[0]
        print(f"  - Found {session_count} PracticeSession records in goals table")
        
        # Count entries in practice_session_goals junction table
        cursor.execute("SELECT COUNT(*) FROM practice_session_goals")
        junction_count = cursor.fetchone()[0]
        print(f"  - Found {junction_count} entries in practice_session_goals junction table")
        
        # Count activity instances
        cursor.execute("SELECT COUNT(*) FROM activity_instances")
        instance_count = cursor.fetchone()[0]
        print(f"  - Found {instance_count} activity instances")
        
        # Count ImmediateGoals that are children of sessions
        cursor.execute("""
            SELECT COUNT(*) FROM goals g
            WHERE g.type = 'ImmediateGoal'
            AND g.parent_id IN (SELECT id FROM goals WHERE type = 'PracticeSession')
        """)
        immediate_goals_under_sessions = cursor.fetchone()[0]
        print(f"  - Found {immediate_goals_under_sessions} ImmediateGoals under sessions")
        
        if dry_run:
            print("\n⚠️  DRY RUN - No changes will be made")
            print("Run with --execute to perform the actual migration\n")
            return
        
        # Step 2: Create new sessions table
        print("\nStep 2: Creating 'sessions' table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                root_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                
                -- Session timing
                session_start DATETIME,
                session_end DATETIME,
                duration_minutes INTEGER,
                total_duration_seconds INTEGER,
                
                -- Template reference
                template_id TEXT,
                program_day_id TEXT,
                
                -- Flexible data storage
                attributes TEXT,
                
                -- Timestamps
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                deleted_at DATETIME,
                
                -- Completion
                completed BOOLEAN DEFAULT 0,
                completed_at DATETIME,
                
                FOREIGN KEY (root_id) REFERENCES goals(id) ON DELETE CASCADE,
                FOREIGN KEY (template_id) REFERENCES session_templates(id),
                FOREIGN KEY (program_day_id) REFERENCES program_days(id)
            )
        """)
        print("  ✅ Created sessions table")
        
        # Step 3: Create new session_goals junction table
        print("\nStep 3: Creating 'session_goals' junction table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS session_goals (
                session_id TEXT NOT NULL,
                goal_id TEXT NOT NULL,
                goal_type TEXT NOT NULL,  -- 'short_term' or 'immediate'
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (session_id, goal_id),
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
            )
        """)
        print("  ✅ Created session_goals junction table")
        
        # Step 4: Migrate data from goals to sessions
        print("\nStep 4: Migrating PracticeSession data to sessions table...")
        cursor.execute("""
            INSERT INTO sessions (
                id, root_id, name, description,
                session_start, session_end, duration_minutes, total_duration_seconds,
                template_id, program_day_id, attributes,
                created_at, updated_at, deleted_at,
                completed, completed_at
            )
            SELECT 
                id, root_id, name, description,
                session_start, session_end, duration_minutes, total_duration_seconds,
                template_id, program_day_id, COALESCE(attributes, session_data),
                created_at, updated_at, deleted_at,
                completed, completed_at
            FROM goals
            WHERE type = 'PracticeSession'
        """)
        migrated_sessions = cursor.rowcount
        print(f"  ✅ Migrated {migrated_sessions} sessions")
        
        # Step 5: Migrate junction table data (short_term goals)
        print("\nStep 5: Migrating practice_session_goals to session_goals...")
        cursor.execute("""
            INSERT INTO session_goals (session_id, goal_id, goal_type)
            SELECT practice_session_id, short_term_goal_id, 'short_term'
            FROM practice_session_goals
        """)
        migrated_junctions_st = cursor.rowcount
        print(f"  ✅ Migrated {migrated_junctions_st} short-term goal associations")
        
        # Step 6: Migrate ImmediateGoal associations (and fix their parent_id)
        print("\nStep 6: Migrating ImmediateGoal associations to session_goals...")
        
        # First, get the immediate goals that are children of sessions
        cursor.execute("""
            SELECT g.id as immediate_goal_id, g.parent_id as session_id
            FROM goals g
            WHERE g.type = 'ImmediateGoal'
            AND g.parent_id IN (SELECT id FROM goals WHERE type = 'PracticeSession')
        """)
        immediate_goals = cursor.fetchall()
        
        # Add them to session_goals junction table
        for ig in immediate_goals:
            cursor.execute("""
                INSERT OR IGNORE INTO session_goals (session_id, goal_id, goal_type)
                VALUES (?, ?, 'immediate')
            """, (ig['session_id'], ig['immediate_goal_id']))
        print(f"  ✅ Created {len(immediate_goals)} immediate goal associations")
        
        # Step 7: Update ImmediateGoals to point to ShortTermGoals
        print("\nStep 7: Reparenting ImmediateGoals to ShortTermGoals...")
        
        # For each immediate goal under a session, find the session's short-term goal parent
        cursor.execute("""
            UPDATE goals
            SET parent_id = (
                SELECT sg.goal_id 
                FROM session_goals sg
                WHERE sg.session_id = goals.parent_id
                AND sg.goal_type = 'short_term'
                LIMIT 1
            )
            WHERE type = 'ImmediateGoal'
            AND parent_id IN (SELECT id FROM sessions)
        """)
        reparented = cursor.rowcount
        print(f"  ✅ Reparented {reparented} ImmediateGoals")
        
        # Step 8: Update activity_instances to add session_id column
        print("\nStep 8: Updating activity_instances table...")
        
        # Check if session_id column exists
        cursor.execute("PRAGMA table_info(activity_instances)")
        columns = [col['name'] for col in cursor.fetchall()]
        
        if 'session_id' not in columns:
            # Add new session_id column
            cursor.execute("ALTER TABLE activity_instances ADD COLUMN session_id TEXT")
            print("  ✅ Added session_id column")
        
        # Copy data from practice_session_id to session_id
        cursor.execute("""
            UPDATE activity_instances
            SET session_id = practice_session_id
            WHERE session_id IS NULL
        """)
        print(f"  ✅ Migrated {cursor.rowcount} activity instance references")
        
        # Step 9: Create indexes on new tables
        print("\nStep 9: Creating indexes...")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_root_id ON sessions(root_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_template_id ON sessions(template_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_program_day_id ON sessions(program_day_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_session_goals_session_id ON session_goals(session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_session_goals_goal_id ON session_goals(goal_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_instances_session_id ON activity_instances(session_id)")
        print("  ✅ Created indexes")
        
        # Step 10: Delete PracticeSession records from goals table
        print("\nStep 10: Removing PracticeSession records from goals table...")
        cursor.execute("DELETE FROM goals WHERE type = 'PracticeSession'")
        deleted = cursor.rowcount
        print(f"  ✅ Deleted {deleted} PracticeSession records from goals table")
        
        # Step 11: Drop old junction table
        print("\nStep 11: Dropping old practice_session_goals table...")
        cursor.execute("DROP TABLE IF EXISTS practice_session_goals")
        print("  ✅ Dropped practice_session_goals table")
        
        # Commit changes
        conn.commit()
        print(f"\n{'='*60}")
        print("✅ MIGRATION COMPLETED SUCCESSFULLY")
        print(f"{'='*60}")
        print(f"\nSummary:")
        print(f"  - Migrated {migrated_sessions} sessions")
        print(f"  - Migrated {migrated_junctions_st} short-term goal associations")
        print(f"  - Created {len(immediate_goals)} immediate goal associations")
        print(f"  - Reparented {reparented} ImmediateGoals")
        print(f"  - Deleted {deleted} PracticeSession records from goals")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        conn.close()

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Migrate sessions from goals table to dedicated sessions table')
    parser.add_argument('--execute', action='store_true', help='Execute the migration (default is dry run)')
    parser.add_argument('--db', type=str, help='Database path (defaults to environment-based)')
    parser.add_argument('--no-backup', action='store_true', help='Skip backup (not recommended)')
    
    args = parser.parse_args()
    
    # Get database path
    if args.db:
        db_path = args.db
    else:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        db_path = os.path.join(project_root, get_db_path())
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found: {db_path}")
        sys.exit(1)
    
    # Create backup unless skipped
    if args.execute and not args.no_backup:
        backup_database(db_path)
    
    # Run migration
    migrate(db_path, dry_run=not args.execute)

if __name__ == '__main__':
    main()
