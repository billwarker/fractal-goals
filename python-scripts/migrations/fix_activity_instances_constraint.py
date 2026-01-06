#!/usr/bin/env python3
"""
Quick Fix: Remove NOT NULL constraint from practice_session_id

This is needed because the application now uses session_id instead of
practice_session_id. The old column should allow NULL values since it's
no longer being populated.

Usage:
    # Dry run (shows what would happen):
    python python-scripts/migrations/fix_activity_instances_constraint.py --db goals.db
    
    # Execute the fix:
    python python-scripts/migrations/fix_activity_instances_constraint.py --db goals.db --execute
"""

import sqlite3
import os
import sys
from datetime import datetime

def backup_database(db_path):
    """Create a timestamped backup."""
    backup_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(backup_dir, f'{os.path.basename(db_path)}.{timestamp}.pre_constraint_fix.bak')
    
    import shutil
    shutil.copy2(db_path, backup_path)
    print(f"✅ Backup created: {backup_path}")
    return backup_path

def analyze_schema(cursor):
    """Analyze the current activity_instances schema."""
    print("\n📊 Current activity_instances schema:")
    cursor.execute("PRAGMA table_info(activity_instances)")
    columns = cursor.fetchall()
    
    has_practice_session_id = False
    has_session_id = False
    practice_session_notnull = False
    
    for col in columns:
        cid, name, dtype, notnull, default, pk = col
        notnull_str = "NOT NULL" if notnull else "nullable"
        print(f"    {name}: {dtype} ({notnull_str})")
        
        if name == 'practice_session_id':
            has_practice_session_id = True
            practice_session_notnull = bool(notnull)
        if name == 'session_id':
            has_session_id = True
    
    return {
        'has_practice_session_id': has_practice_session_id,
        'has_session_id': has_session_id,
        'practice_session_notnull': practice_session_notnull
    }

def migrate(db_path, dry_run=True):
    """Fix the schema."""
    print(f"\n{'='*60}")
    print(f"Activity Instances Constraint Fix")
    print(f"Database: {db_path}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE MIGRATION'}")
    print(f"{'='*60}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Analyze current schema
        schema_info = analyze_schema(cursor)
        
        if not schema_info['has_session_id']:
            print("\n❌ ERROR: session_id column does not exist!")
            print("   You need to run migrate_sessions_from_goals.py first to add this column.")
            return False
        
        if not schema_info['has_practice_session_id']:
            print("\n✅ practice_session_id column already removed. Nothing to do.")
            return True
        
        if not schema_info['practice_session_notnull']:
            print("\n✅ practice_session_id is already nullable. Nothing to do.")
            return True
        
        print(f"\n⚠️  practice_session_id has NOT NULL constraint - this needs to be fixed")
        
        # Check for data migration status
        cursor.execute("SELECT COUNT(*) FROM activity_instances")
        total = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM activity_instances WHERE session_id IS NOT NULL")
        with_session_id = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM activity_instances WHERE practice_session_id IS NOT NULL")
        with_practice = cursor.fetchone()[0]
        
        print(f"\n📊 Data status:")
        print(f"    Total activity instances: {total}")
        print(f"    With session_id: {with_session_id}")
        print(f"    With practice_session_id: {with_practice}")
        
        if dry_run:
            print("\n⚠️  DRY RUN - No changes will be made")
            print("Run with --execute to perform the fix")
            return True
        
        # SQLite doesn't support ALTER COLUMN, so we need to recreate the table
        print("\n🔧 Recreating activity_instances table with nullable practice_session_id...")
        
        # Step 1: Get the current table definition
        cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='activity_instances'")
        current_ddl = cursor.fetchone()[0]
        print(f"\n   Current DDL:\n   {current_ddl[:200]}...")
        
        # Step 2: Create temp table with fixed schema
        cursor.execute("""
            CREATE TABLE activity_instances_new (
                id TEXT PRIMARY KEY,
                practice_session_id TEXT,  -- NOW NULLABLE
                activity_definition_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                time_start TIMESTAMP,
                time_stop TIMESTAMP,
                duration_seconds INTEGER,
                root_id TEXT NOT NULL,
                deleted_at DATETIME,
                updated_at DATETIME,
                sort_order INTEGER DEFAULT 0,
                completed BOOLEAN DEFAULT 0,
                notes TEXT,
                data TEXT,
                session_id TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (activity_definition_id) REFERENCES activity_definitions(id),
                FOREIGN KEY (root_id) REFERENCES goals(id) ON DELETE CASCADE
            )
        """)
        print("   ✅ Created new table with nullable practice_session_id")
        
        # Step 3: Copy data
        cursor.execute("""
            INSERT INTO activity_instances_new 
            SELECT id, practice_session_id, activity_definition_id, created_at,
                   time_start, time_stop, duration_seconds, root_id, deleted_at,
                   updated_at, sort_order, completed, notes, data, session_id
            FROM activity_instances
        """)
        copied = cursor.rowcount
        print(f"   ✅ Copied {copied} rows")
        
        # Step 4: Drop old table
        cursor.execute("DROP TABLE activity_instances")
        print("   ✅ Dropped old table")
        
        # Step 5: Rename new table
        cursor.execute("ALTER TABLE activity_instances_new RENAME TO activity_instances")
        print("   ✅ Renamed new table")
        
        # Step 6: Recreate indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_instances_session_id ON activity_instances(session_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_instances_root_id ON activity_instances(root_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_instances_definition_id ON activity_instances(activity_definition_id)")
        print("   ✅ Recreated indexes")
        
        conn.commit()
        
        # Verify
        print("\n📊 Verifying new schema:")
        analyze_schema(cursor)
        
        print(f"\n{'='*60}")
        print("✅ FIX COMPLETED SUCCESSFULLY")
        print(f"{'='*60}")
        return True
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        conn.close()

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Fix activity_instances NOT NULL constraint')
    parser.add_argument('--execute', action='store_true', help='Execute the fix (default is dry run)')
    parser.add_argument('--db', type=str, required=True, help='Database path')
    parser.add_argument('--no-backup', action='store_true', help='Skip backup (not recommended)')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.db):
        print(f"❌ Database not found: {args.db}")
        sys.exit(1)
    
    # Create backup
    if args.execute and not args.no_backup:
        backup_database(args.db)
    
    # Run fix
    success = migrate(args.db, dry_run=not args.execute)
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
