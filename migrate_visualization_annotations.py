"""
Migration script to add the visualization_annotations table.

Run this script to add the new table to your database.
"""
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import get_engine, Base, VisualizationAnnotation
from sqlalchemy import inspect


def migrate():
    """Create the visualization_annotations table if it doesn't exist."""
    engine = get_engine()
    inspector = inspect(engine)
    
    existing_tables = inspector.get_table_names()
    
    if 'visualization_annotations' in existing_tables:
        print("Table 'visualization_annotations' already exists. Skipping creation.")
        return
    
    print("Creating table 'visualization_annotations'...")
    
    # Create only the new table
    VisualizationAnnotation.__table__.create(engine)
    
    print("Table 'visualization_annotations' created successfully!")


if __name__ == '__main__':
    migrate()
