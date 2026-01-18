#!/usr/bin/env python3
"""
Database Migration Helper Script

This script provides convenient commands for managing database migrations.
Run from project root: python db_migrate.py <command>

Commands:
    init        - Initialize/update an existing SQLite database (stamp current revision)
    upgrade     - Apply all pending migrations
    downgrade   - Revert the last migration
    current     - Show current database revision
    history     - Show migration history
    create      - Create a new migration (requires message)

Examples:
    python db_migrate.py init
    python db_migrate.py upgrade
    python db_migrate.py downgrade
    python db_migrate.py create "Add user preferences table"
"""

import sys
import os
import subprocess

def run_alembic(*args):
    """Run an alembic command."""
    cmd = ['alembic'] + list(args)
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=os.path.dirname(os.path.abspath(__file__)))
    return result.returncode

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'init':
        # Stamp the database as being at the current revision
        # Use this for existing SQLite databases
        print("Stamping database with current migration revision...")
        return run_alembic('stamp', 'head')
    
    elif command == 'upgrade':
        # Apply all pending migrations
        print("Applying pending migrations...")
        return run_alembic('upgrade', 'head')
    
    elif command == 'downgrade':
        # Revert the last migration
        print("Reverting last migration...")
        return run_alembic('downgrade', '-1')
    
    elif command == 'current':
        # Show current revision
        return run_alembic('current')
    
    elif command == 'history':
        # Show migration history
        return run_alembic('history', '--verbose')
    
    elif command == 'create':
        if len(sys.argv) < 3:
            print("Error: Migration message required")
            print("Usage: python db_migrate.py create \"Add new feature\"")
            sys.exit(1)
        message = sys.argv[2]
        print(f"Creating new migration: {message}")
        return run_alembic('revision', '--autogenerate', '-m', message)
    
    elif command == 'heads':
        # Show head revisions
        return run_alembic('heads')
    
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)

if __name__ == '__main__':
    sys.exit(main() or 0)
