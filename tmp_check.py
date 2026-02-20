import os
import sys

# Setup path so imports work
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

try:
    from app import app
    from models import get_engine, ActivityInstance, Session
    from services.db_queries import get_session
    
    engine = get_engine()
    db = get_session(engine)
    
    # Let's get the 5 most recent sessions and their instances
    sessions = db.query(Session).order_by(Session.created_at.desc()).limit(5).all()
    print("--- RECENT SESSIONS ---")
    for s in sessions:
        print(f"Session {s.id} completed={s.completed} total_duration={s.total_duration_seconds}")
        for inst in s.activity_instances:
            print(f"  -> Instance {inst.id} completed={inst.completed} def_id={inst.activity_definition_id} start={inst.time_start} stop={inst.time_stop} duration={inst.duration_seconds}")
            
except Exception as e:
    import traceback
    traceback.print_exc()
