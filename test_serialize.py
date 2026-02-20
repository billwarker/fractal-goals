from app import app
from models import get_engine, get_session, Goal
from services.serializers import serialize_goal
import json

with app.app_context():
    engine = get_engine()
    db_session = get_session(engine)
    goal = db_session.query(Goal).first()
    if goal:
        print(f"Goal found: {goal.name}")
        try:
            res = serialize_goal(goal, db_session)
            print(json.dumps(res, indent=2))
        except Exception as e:
            import traceback
            traceback.print_exc()
    else:
        print("No goals found.")
