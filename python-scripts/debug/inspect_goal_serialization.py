"""Serialize the first goal record to inspect payload shape."""

import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from models import get_engine, get_session, Goal
from services.serializers import serialize_goal

with app.app_context():
    engine = get_engine()
    db_session = get_session(engine)
    goal = db_session.query(Goal).first()
    if goal:
        print(f"Goal found: {goal.name}")
        try:
            res = serialize_goal(goal, db_session)
            print(json.dumps(res, indent=2))
        except Exception:
            import traceback
            traceback.print_exc()
    else:
        print("No goals found.")
