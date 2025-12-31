import sys
import os

# Add parent directory to path so we can import models
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import Base, get_engine
from config import config

def init_tables():
    print(f"Initializing tables for environment: {config.ENV}")
    engine = get_engine()
    print(f"Database URL: {engine.url}")
    
    # Create all tables defined in models.py (if they don't exist)
    Base.metadata.create_all(engine)
    print("Successfully initialized tables.")

if __name__ == "__main__":
    init_tables()
