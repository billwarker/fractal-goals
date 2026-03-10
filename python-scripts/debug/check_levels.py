"""List active goal levels and their owners."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from models import get_engine, get_session, GoalLevel

def main():
    with app.app_context():
        engine = get_engine()
        db_session = get_session(engine)
        levels = db_session.query(GoalLevel).filter(GoalLevel.deleted_at.is_(None)).all()
        print("--- ALL ACTIVE LEVELS ---")
        for level in levels:
            print(f"ID={level.id}, Name='{level.name}', Owner='{level.owner_id}'")


if __name__ == "__main__":
    main()
