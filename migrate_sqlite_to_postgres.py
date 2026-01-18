#!/usr/bin/env python3
"""
SQLite to PostgreSQL Data Migration Script

This script migrates data from an existing SQLite database to PostgreSQL,
handling type conversions and column mapping automatically.

Usage:
    python migrate_sqlite_to_postgres.py --source PATH [options]

Options:
    --source PATH       SQLite database path (required)
    --target URL        PostgreSQL URL (default: uses DATABASE_URL env var)
    --dry-run           Show what would be done without making changes
    --clean             Clean target tables before migration

Example:
    python migrate_sqlite_to_postgres.py --source goals_dev.db --clean
"""

import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text, inspect


# Tables in dependency order (parents before children)
TABLES_IN_ORDER = [
    'goals',
    'activity_groups',
    'activity_definitions',
    'activity_goal_associations',
    'metric_definitions',
    'split_definitions',
    'session_templates',
    'programs',
    'program_blocks',
    'program_days',
    'program_day_templates',
    'sessions',
    'session_goals',
    'activity_instances',
    'metric_values',
    'notes',
]

# Columns that are boolean in PostgreSQL but integer in SQLite
BOOLEAN_COLUMNS = {
    'completed', 'is_active', 'is_smart', 'has_sets', 'has_metrics',
    'metrics_multiplicative', 'has_splits', 'is_top_set_metric',
    'is_multiplicative', 'is_completed'
}


def get_table_columns(engine, table_name):
    """Get column names for a table."""
    inspector = inspect(engine)
    try:
        columns = inspector.get_columns(table_name)
        return {col['name'] for col in columns}
    except:
        return set()


def get_table_row_count(engine, table_name):
    """Get the number of rows in a table."""
    with engine.connect() as conn:
        try:
            result = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
            return result.scalar()
        except:
            return 0


def get_all_data(engine, table_name):
    """Fetch all rows from a table as dictionaries."""
    with engine.connect() as conn:
        try:
            result = conn.execute(text(f'SELECT * FROM "{table_name}"'))
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result]
        except Exception as e:
            print(f"    Warning: Could not read from {table_name}: {e}")
            return []


def clean_tables(engine, tables):
    """Truncate tables in reverse order (children first)."""
    print("\nCleaning target tables...")
    
    with engine.begin() as conn:
        # Disable FK checks
        conn.execute(text("SET session_replication_role = 'replica'"))
        
        for table in reversed(tables):
            try:
                conn.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
                print(f"  Cleaned: {table}")
            except Exception as e:
                print(f"  Warning: Could not clean {table}: {e}")
        
        # Re-enable FK checks
        conn.execute(text("SET session_replication_role = 'origin'"))


def migrate_table(source_engine, target_engine, table_name):
    """Migrate a single table with column mapping and type conversion."""
    
    # Get source data
    rows = get_all_data(source_engine, table_name)
    if not rows:
        return 0, 0
    
    # Get target columns
    target_columns = get_table_columns(target_engine, table_name)
    if not target_columns:
        print(f"    Warning: No columns found for {table_name}")
        return 0, len(rows)
    
    # Get source columns from first row
    source_columns = set(rows[0].keys())
    
    # Find common columns
    common_columns = source_columns & target_columns
    
    if not common_columns:
        print(f"    Warning: No common columns between source and target")
        return 0, len(rows)
    
    # Build the INSERT statement with only common columns
    col_list = ', '.join(f'"{c}"' for c in common_columns)
    placeholder_list = ', '.join(f':{c}' for c in common_columns)
    insert_sql = f'INSERT INTO "{table_name}" ({col_list}) VALUES ({placeholder_list})'
    
    inserted = 0
    failed = 0
    
    for row in rows:
        # Filter to common columns and convert types
        filtered_row = {}
        for col in common_columns:
            value = row.get(col)
            
            # Convert SQLite integers to PostgreSQL booleans
            if col in BOOLEAN_COLUMNS and isinstance(value, int):
                value = bool(value)
            
            filtered_row[col] = value
        
        try:
            with target_engine.begin() as conn:
                conn.execute(text(insert_sql), filtered_row)
            inserted += 1
        except Exception as e:
            failed += 1
            if failed <= 3:
                error_msg = str(e).split('\n')[0][:80]
                print(f"      Error: {error_msg}")
    
    return inserted, failed


def migrate_data(source_engine, target_engine, dry_run=False, clean=False):
    """Migrate all data from source to target."""
    
    print("\n" + "="*60)
    print("FRACTAL GOALS - SQLite to PostgreSQL Migration")
    print("="*60)
    
    source_inspector = inspect(source_engine)
    source_tables = set(source_inspector.get_table_names())
    
    target_inspector = inspect(target_engine)
    target_tables = set(target_inspector.get_table_names())
    
    # Build migration plan
    tables_to_migrate = [t for t in TABLES_IN_ORDER if t in source_tables and t in target_tables]
    
    print(f"\nSource tables: {len(source_tables)}")
    print(f"Target tables: {len(target_tables)}")
    print(f"Tables to migrate: {len(tables_to_migrate)}")
    
    # Show plan
    print("\n" + "-"*60)
    print("Migration Plan:")
    print("-"*60)
    
    total_rows = 0
    for table in tables_to_migrate:
        count = get_table_row_count(source_engine, table)
        total_rows += count
        print(f"  {table}: {count} rows")
    
    print(f"\nTotal rows: {total_rows}")
    
    if dry_run:
        print("\n[DRY RUN] No changes made.")
        return True
    
    response = input("\nProceed? (yes/no): ")
    if response.lower() not in ('yes', 'y'):
        print("Cancelled.")
        return False
    
    if clean:
        clean_tables(target_engine, tables_to_migrate)
    
    print("\n" + "-"*60)
    print("Migrating...")
    print("-"*60)
    
    total_inserted = 0
    total_failed = 0
    
    for table in tables_to_migrate:
        count = get_table_row_count(source_engine, table)
        if count == 0:
            continue
        
        print(f"\n  {table}: {count} rows")
        inserted, failed = migrate_table(source_engine, target_engine, table)
        total_inserted += inserted
        total_failed += failed
        
        status = f"✓ {inserted}" + (f" ({failed} failed)" if failed else "")
        print(f"    Result: {status}")
    
    print("\n" + "="*60)
    print(f"Inserted: {total_inserted}, Failed: {total_failed}")
    print("="*60 + "\n")
    
    return total_failed == 0


def main():
    parser = argparse.ArgumentParser(description='Migrate SQLite to PostgreSQL')
    parser.add_argument('--source', required=True, help='SQLite database path')
    parser.add_argument('--target', help='PostgreSQL URL')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--clean', action='store_true')
    args = parser.parse_args()
    
    source_url = f"sqlite:///{args.source}"
    target_url = args.target or os.environ.get('DATABASE_URL')
    
    if not target_url:
        print("ERROR: No target. Set DATABASE_URL or use --target.")
        sys.exit(1)
    
    # Mask password
    display = target_url
    if '@' in target_url:
        parts = target_url.split('@')
        display = f"{parts[0].rsplit(':', 1)[0]}:***@{parts[1]}"
    
    print(f"Source: {source_url}")
    print(f"Target: {display}")
    
    source_engine = create_engine(source_url)
    target_engine = create_engine(target_url)
    
    # Test connections
    print("\nTesting connections...")
    try:
        with source_engine.connect() as c:
            c.execute(text("SELECT 1"))
        print("  Source: OK")
    except Exception as e:
        print(f"  Source: FAILED - {e}")
        sys.exit(1)
    
    try:
        with target_engine.connect() as c:
            c.execute(text("SELECT 1"))
        print("  Target: OK")
    except Exception as e:
        print(f"  Target: FAILED - {e}")
        sys.exit(1)
    
    success = migrate_data(source_engine, target_engine, args.dry_run, args.clean)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
