import sys
import os
sys.path.insert(0, os.path.abspath('.'))
from app import app
from models import get_engine, get_session, GoalLevel

with app.app_context():
    engine = get_engine()
    db_session = get_session(engine)
    levels = db_session.query(GoalLevel).filter(GoalLevel.deleted_at.is_(None)).all()
    print("--- ALL ACTIVE LEVELS ---")
    for l in levels:
        print(f"ID={l.id}, Name='{l.name}', Owner='{l.owner_id}'")
