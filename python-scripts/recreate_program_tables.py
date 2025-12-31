import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import Base, get_engine, ProgramBlock, ProgramDay, ScheduledSession
from config import config

def recreate_tables():
    print(f"Recreating tables for environment: {config.ENV}")
    engine = get_engine()
    print(f"Database URL: {engine.url}")
    
    print("Dropping Tables...")
    try:
        ScheduledSession.__table__.drop(engine, checkfirst=True)
        print("Dropped scheduled_sessions")
    except Exception as e: print(f"Error dropping ScheduledSession: {e}")

    try:
        ProgramDay.__table__.drop(engine, checkfirst=True)
        print("Dropped program_days")
    except Exception as e: print(f"Error dropping ProgramDay: {e}")

    try:
        ProgramBlock.__table__.drop(engine, checkfirst=True)
        print("Dropped program_blocks")
    except Exception as e: print(f"Error dropping ProgramBlock: {e}")

    print("Creating Tables...")
    Base.metadata.create_all(engine)
    print("Done.")

if __name__ == "__main__":
    recreate_tables()
