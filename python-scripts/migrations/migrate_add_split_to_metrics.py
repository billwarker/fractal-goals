#!/usr/bin/env python3
"""
Migration script to add split tracking to metric values.

This migration:
1. Adds split_definition_id column to metric_values table
"""

import sys
import os

# Add parent directory to path to import models
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import get_engine
from sqlalchemy import inspect, text

def run_migration(db_path=None):
    """Run the migration to add split tracking to metric values."""
    engine = get_engine(db_path)
    inspector = inspect(engine)
    
    print("Starting migration: Add split tracking to metric values")
    
    with engine.connect() as conn:
        # Check if split_definition_id column exists
        columns = [col['name'] for col in inspector.get_columns('metric_values')]
        
        if 'split_definition_id' not in columns:
            print("  - Adding split_definition_id column to metric_values...")
            conn.execute(text(
                """ALTER TABLE metric_values 
                   ADD COLUMN split_definition_id STRING 
                   REFERENCES split_definitions(id) ON DELETE RESTRICT"""
            ))
            conn.commit()
            print("    ✓ Added split_definition_id column")
        else:
            print("  - split_definition_id column already exists, skipping")
    
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
