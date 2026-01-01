
import sys
import os
sys.path.append(os.getcwd())

from app import app
from models import get_engine, get_session, ActivityInstance, MetricValue

def inspect(session_id):
    with app.app_context():
        session = get_session(get_engine())
        print(f"Inspecting instances for session {session_id}...")
        
        instances = session.query(ActivityInstance).filter_by(practice_session_id=session_id).all()
        for inst in instances:
            print(f"\nInstance ID: {inst.id}")
            print(f"Activity Def ID: {inst.activity_definition_id}")
            print(f"Data (Sets): {inst.data}")
            
            # Check relation
            mvs = session.query(MetricValue).filter_by(activity_instance_id=inst.id).all()
            print(f"Metric Values (Rows): {len(mvs)}")
            for mv in mvs:
                print(f" - MV: def={mv.metric_definition_id}, val={mv.value}")
        
        session.close()

if __name__ == "__main__":
    # Use one of the IDs from the migration log
    inspect("56b0f5b2-ee8a-40a8-a325-7dfe6af9aec2") 
