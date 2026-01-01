
import sys
import os
import json
from datetime import datetime

sys.path.append(os.getcwd())

from app import app
from models import get_engine, get_session, PracticeSession

def local_to_utc(iso_str):
    if not iso_str: return None
    # Handle 'Z' or simple string.
    try:
        if iso_str.endswith('Z'):
             return datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
        return datetime.fromisoformat(iso_str)
    except:
        return None

def backfill():
    with app.app_context():
        session = get_session(get_engine())
        print("Backfilling session times from JSON...")
        
        sessions = session.query(PracticeSession).all()
        count = 0
        
        for s in sessions:
            updated = False
            # Check JSON
            if s.attributes:
                try:
                    data = json.loads(s.attributes)
                    json_start = data.get('session_start')
                    json_end = data.get('session_end')
                    
                    if not s.session_start and json_start:
                        ts = local_to_utc(json_start)
                        if ts:
                            s.session_start = ts
                            updated = True
                            print(f"Updated Start for {s.id}")
                    
                    if not s.session_end and json_end:
                        ts = local_to_utc(json_end)
                        if ts:
                            s.session_end = ts
                            updated = True
                            print(f"Updated End for {s.id}")
                    
                    # Also backfill duration if missing
                    if s.session_start and s.session_end and not s.total_duration_seconds:
                        dur = (s.session_end - s.session_start).total_seconds()
                        s.total_duration_seconds = int(dur)
                        updated = True
                        print(f"Updated Duration for {s.id}: {int(dur)}s")
                        
                except Exception as e:
                    print(f"Error parsing JSON for {s.id}: {e}")
            
            if updated:
                count += 1
        
        session.commit()
        print(f"Backfill complete. Updated {count} sessions.")
        session.close()

if __name__ == "__main__":
    backfill()
