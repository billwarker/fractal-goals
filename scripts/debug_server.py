
import sys
import os

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from models import get_engine, get_session, Goal, ActivityGroup

def debug_models():
    print("--- Starting Model Debug ---")
    with app.app_context():
        engine = get_engine()
        session = get_session(engine)
        
        try:
            # Try to query a goal and inspect relationships to ensure mapper is valid
            print("Querying one goal...")
            goal = session.query(Goal).first()
            if goal:
                print(f"Found goal: {goal.name}")
                print("Checking associated_activity_groups relationship...")
                # Accessing the property triggers the relationship loading
                groups = goal.associated_activity_groups
                print(f"Associated Groups: {len(groups)}")
            else:
                print("No goals found, but query succeeded.")
                
            print("--- Model Debug Success ---")
        except Exception as e:
            print(f"--- Model Debug FAILED ---")
            print(e)
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    debug_models()
