"""Inspect goals with missing or inconsistent goal-level assignments."""

import os
import sys

from sqlalchemy import func

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from models import Goal, GoalLevel, get_engine, get_session


def main():
    try:
        with app.app_context():
            engine = get_engine()
            db_session = get_session(engine)

            null_level_count = db_session.query(Goal).filter(Goal.level_id.is_(None)).count()
            print(f"[{null_level_count}] goals with level_id is NULL")

            levels = db_session.query(GoalLevel.name, GoalLevel.id).distinct().all()
            print(f"Distinct Goal Levels count: {len(levels)}")
            for name, level_id in levels:
                print(f"  - {name} ({level_id})")

            goal_stats = (
                db_session.query(GoalLevel.name, func.count(Goal.id))
                .outerjoin(Goal.level)
                .group_by(GoalLevel.name)
                .all()
            )

            print("\nGoals by Level Name:")
            for name, count in goal_stats:
                print(f"  - {name or 'NULL'}: {count} goals")
    except Exception:
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()
