import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import get_engine, get_session, ProgramDay, ScheduledSession
from config import config

def cleanup():
    print(f"Cleaning empty days for env: {config.ENV}")
    engine = get_engine()
    session = get_session(engine)
    
    try:
        # Find days with no sessions
        # Doing it pythonic for simplicity
        days = session.query(ProgramDay).all()
        deleted = 0
        for d in days:
            if not d.sessions:
                # Also check if it has manual name? 
                # User wants "Added" days. If I named it "Test" but no session, keep it?
                # Usually "Prepopulated" days have name "Monday", "Tuesday".
                # If name is just DoW, delete.
                if d.name in ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']:
                     session.delete(d)
                     deleted += 1
        
        session.commit()
        print(f"Deleted {deleted} empty days.")
    except Exception as e:
        print(e)
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    cleanup()
