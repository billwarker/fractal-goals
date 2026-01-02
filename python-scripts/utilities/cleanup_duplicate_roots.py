#!/usr/bin/env python3
"""
Cleanup Duplicate Root Goals

This script identifies and removes duplicate root goals (UltimateGoals with parent_id IS NULL).
For each set of duplicates with the same name, it keeps the one with the most children
and deletes the orphaned duplicates.

Usage:
    python python-scripts/utilities/cleanup_duplicate_roots.py [database_path]
    
    If no database path is provided, defaults to goals.db
"""

import sqlite3
import sys
import os
from datetime import datetime
from pathlib import Path

def create_backup(db_path):
    """Create a timestamped backup of the database."""
    backup_dir = Path(db_path).parent / "backups"
    backup_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    db_name = Path(db_path).name
    backup_path = backup_dir / f"{db_name}.backup_cleanup_{timestamp}"
    
    print(f"📦 Creating backup: {backup_path.name}")
    
    # Copy the database file
    import shutil
    shutil.copy2(db_path, backup_path)
    
    print(f"✓ Backup created successfully\n")
    return backup_path

def get_duplicate_roots(conn):
    """Find all root goals that have duplicate names."""
    cursor = conn.cursor()
    
    query = """
    SELECT name, COUNT(*) as count
    FROM goals
    WHERE parent_id IS NULL
    GROUP BY name
    HAVING count > 1
    ORDER BY count DESC
    """
    
    cursor.execute(query)
    return cursor.fetchall()

def get_root_details(conn, name):
    """Get details about all root goals with a given name."""
    cursor = conn.cursor()
    
    query = """
    SELECT 
        g.id,
        g.name,
        g.created_at,
        COUNT(c.id) as child_count
    FROM goals g
    LEFT JOIN goals c ON c.parent_id = g.id
    WHERE g.parent_id IS NULL AND g.name = ?
    GROUP BY g.id
    ORDER BY child_count DESC, g.created_at ASC
    """
    
    cursor.execute(query, (name,))
    return cursor.fetchall()

def delete_goal_and_descendants(conn, goal_id):
    """Recursively delete a goal and all its descendants."""
    cursor = conn.cursor()
    
    # First, get all descendants
    descendants = []
    to_process = [goal_id]
    
    while to_process:
        current_id = to_process.pop(0)
        descendants.append(current_id)
        
        # Find children
        cursor.execute("SELECT id FROM goals WHERE parent_id = ?", (current_id,))
        children = cursor.fetchall()
        to_process.extend([child[0] for child in children])
    
    # Delete in reverse order (children first)
    for desc_id in reversed(descendants):
        cursor.execute("DELETE FROM goals WHERE id = ?", (desc_id,))
    
    return len(descendants)

def cleanup_duplicates(db_path, dry_run=False):
    """Main cleanup function."""
    print("=" * 60)
    print("🧹 Duplicate Root Goals Cleanup")
    print("=" * 60)
    print(f"Database: {db_path}")
    print(f"Mode: {'DRY RUN (no changes)' if dry_run else 'LIVE (will delete duplicates)'}")
    print("=" * 60)
    print()
    
    # Create backup (only if not dry run)
    if not dry_run:
        backup_path = create_backup(db_path)
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    
    try:
        # Get duplicate root goals
        duplicates = get_duplicate_roots(conn)
        
        if not duplicates:
            print("✓ No duplicate root goals found!")
            return
        
        print(f"Found {len(duplicates)} root goal names with duplicates:\n")
        
        total_deleted = 0
        total_goals_deleted = 0
        
        for name, count in duplicates:
            print(f"📋 '{name}' - {count} duplicates")
            
            # Get details about each duplicate
            roots = get_root_details(conn, name)
            
            # The first one (most children, earliest created) is the keeper
            keeper = roots[0]
            to_delete = roots[1:]
            
            print(f"   ✓ KEEPING: ID={keeper[0][:8]}... (children: {keeper[3]}, created: {keeper[2]})")
            
            for root in to_delete:
                root_id, root_name, created_at, child_count = root
                
                if dry_run:
                    print(f"   ✗ WOULD DELETE: ID={root_id[:8]}... (children: {child_count}, created: {created_at})")
                else:
                    deleted_count = delete_goal_and_descendants(conn, root_id)
                    print(f"   ✗ DELETED: ID={root_id[:8]}... (deleted {deleted_count} total goals)")
                    total_goals_deleted += deleted_count
                
                total_deleted += 1
            
            print()
        
        if not dry_run:
            conn.commit()
            print("=" * 60)
            print("✅ Cleanup completed successfully!")
            print("=" * 60)
            print(f"Duplicate roots removed: {total_deleted}")
            print(f"Total goals deleted: {total_goals_deleted}")
            print(f"Backup location: {backup_path}")
            print("=" * 60)
        else:
            print("=" * 60)
            print("🔍 DRY RUN SUMMARY")
            print("=" * 60)
            print(f"Would remove {total_deleted} duplicate root goals")
            print("Run without --dry-run to actually delete")
            print("=" * 60)
    
    finally:
        conn.close()

def main():
    # Parse arguments
    db_path = "goals.db"
    dry_run = False
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--dry-run":
            dry_run = True
            if len(sys.argv) > 2:
                db_path = sys.argv[2]
        else:
            db_path = sys.argv[1]
            if len(sys.argv) > 2 and sys.argv[2] == "--dry-run":
                dry_run = True
    
    # Check if database exists
    if not os.path.exists(db_path):
        print(f"❌ Error: Database not found: {db_path}")
        sys.exit(1)
    
    # Run cleanup
    cleanup_duplicates(db_path, dry_run)

if __name__ == "__main__":
    main()
