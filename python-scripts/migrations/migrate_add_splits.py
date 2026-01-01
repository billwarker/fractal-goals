#!/usr/bin/env python3
"""
Migration script to add splits support to activities.

This migration:
1. Adds has_splits column to activity_definitions table
2. Creates split_definitions table
"""

import sys
import os

# Add parent directory to path to import models
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import get_engine, Base, ActivityDefinition, SplitDefinition
from sqlalchemy import inspect, text

def run_migration(db_path=None):
    """Run the migration to add splits support."""
    engine = get_engine(db_path)
    inspector = inspect(engine)
    
    print("Starting migration: Add splits support to activities")
    
    with engine.connect() as conn:
        # Check if has_splits column exists
        columns = [col['name'] for col in inspector.get_columns('activity_definitions')]
        
        if 'has_splits' not in columns:
            print("  - Adding has_splits column to activity_definitions...")
            conn.execute(text(
                "ALTER TABLE activity_definitions ADD COLUMN has_splits BOOLEAN DEFAULT 0"
            ))
            conn.commit()
            print("    ✓ Added has_splits column")
        else:
            print("  - has_splits column already exists, skipping")
        
        # Check if split_definitions table exists
        tables = inspector.get_table_names()
        
        if 'split_definitions' not in tables:
            print("  - Creating split_definitions table...")
            # Create the table using SQLAlchemy
            SplitDefinition.__table__.create(engine)
            print("    ✓ Created split_definitions table")
        else:
            print("  - split_definitions table already exists, skipping")
    
    print("Migration completed successfully!")

if __name__ == "__main__":
    # Run migration for all environments
    from config import config
    
    environments = ['development', 'testing', 'production']
    
    for env in environments:
        print(f"\n{'='*60}")
        print(f"Migrating {env} database...")
        print('='*60)
        
        # Temporarily set environment
        original_env = os.environ.get('FLASK_ENV')
        os.environ['FLASK_ENV'] = env
        
        # Reload config to get correct DB path
        import importlib
        importlib.reload(sys.modules['config'])
        from config import config as reloaded_config
        
        db_path = f"sqlite:///{reloaded_config.get_db_path()}"
        run_migration(db_path)
        
        # Restore original environment
        if original_env:
            os.environ['FLASK_ENV'] = original_env
        else:
            os.environ.pop('FLASK_ENV', None)
    
    print(f"\n{'='*60}")
    print("All migrations completed!")
    print('='*60)
