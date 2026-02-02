
import sys
import os
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

# Add parent directory to path to import models and config
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import get_engine, Base

def migrate():
    print("Starting migration: Add parent_id to activity_groups")
    engine = get_engine()
    
    with engine.connect() as conn:
        try:
            # Check if column exists
            result = conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='activity_groups' AND column_name='parent_id'"
            ))
            
            if result.fetchone():
                print("Column parent_id already exists in activity_groups. Skipping.")
                return

            print("Adding parent_id column to activity_groups...")
            conn.execute(text("ALTER TABLE activity_groups ADD COLUMN parent_id VARCHAR NULL"))
            
            print("Adding foreign key constraint...")
            conn.execute(text(
                "ALTER TABLE activity_groups "
                "ADD CONSTRAINT fk_activity_groups_parent "
                "FOREIGN KEY (parent_id) REFERENCES activity_groups(id) ON DELETE CASCADE"
            ))
            
            conn.commit()
            print("Migration completed successfully.")
            
        except Exception as e:
            print(f"Error during migration: {str(e)}")
            raise

if __name__ == "__main__":
    migrate()
