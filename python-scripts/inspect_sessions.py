
import sys
import os
import json
sys.path.append(os.getcwd())

from app import app
from models import get_engine, get_session, PracticeSession

def inspect_sessions():
    with app.app_context():
        session = get_session(get_engine())
        print("Inspecting Session Timestamps...")
        
        all_sessions = session.query(PracticeSession).all()
        for s in all_sessions:
            print(f"\nID: {s.id}")
            print(f"Name: {s.name}")
            print(f"Col Start: {s.session_start}")
            print(f"Col End:   {s.session_end}")
            
            # Check JSON
            if s.attributes:
                try:
                    data = json.loads(s.attributes)
                    json_start = data.get('session_start')
                    json_end = data.get('session_end')
                    print(f"JSON Start: {json_start}")
                    print(f"JSON End:   {json_end}")
                except:
                    print("JSON Error")
        
        session.close()

if __name__ == "__main__":
    inspect_sessions()
