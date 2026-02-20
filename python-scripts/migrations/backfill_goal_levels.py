import os
import sys

# Ensure the root of the project is in the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from app import app
from models import get_engine, get_session, GoalLevel, Goal
from services.goal_type_utils import get_canonical_goal_level_name

# Standard fractal goal levels configuration
DEFAULT_LEVELS = [
    {"name": "Ultimate Goal", "rank": 0, "color": "purple", "icon": "star"},
    {"name": "Long Term Goal", "rank": 1, "color": "blue", "icon": "trending-up"},
    {"name": "Mid Term Goal", "rank": 2, "color": "cyan", "icon": "calendar"},
    {"name": "Short Term Goal", "rank": 3, "color": "green", "icon": "check-circle"},
    {"name": "Immediate Goal", "rank": 4, "color": "yellow", "icon": "zap"},
    {"name": "Micro Goal", "rank": 5, "color": "orange", "icon": "target"},
    {"name": "Nano Goal", "rank": 6, "color": "red", "icon": "activity"},
]

def run_migration():
    """
    Ensures GoalLevel records exist, and backfills Goals with missing level_ids.
    """
    # database connections using our app config system
    with app.app_context():
        engine = get_engine()
        db_session = get_session(engine)
        
        try:
            print("1. Syncing GoalLevels...")
            defined_levels = {}
            for level_config in DEFAULT_LEVELS:
                level_name = level_config["name"]
                level = db_session.query(GoalLevel).filter_by(name=level_name).first()
                if not level:
                    print(f"   Creating missing level: {level_name}")
                    level = GoalLevel(
                        name=level_name,
                        rank=level_config["rank"],
                        color=level_config["color"],
                        icon=level_config["icon"]
                    )
                    db_session.add(level)
                    db_session.flush() # Ensure we get an ID
                else:
                    print(f"   Level found: {level_name} ({level.id})")
                defined_levels[level_name] = level

            db_session.commit()
            
            print("\n2. Finding Goals missing a level_id...")
            
            # Find goals by looking at level_id == None
            missing_level_goals = db_session.query(Goal).filter(
                Goal.level_id.is_(None)
            ).all()
            
            print(f"   Found {len(missing_level_goals)} goals missing a level_id")
            
            if not missing_level_goals:
                print("   Nothing to backfill. Migration complete.")
                return
                
            updated_count = 0
            for goal in missing_level_goals:
                # Use our new centralized util to infer what the level *should* be
                # based on tree depth or legacy strings
                canonical_name = get_canonical_goal_level_name(goal)
                
                target_level = defined_levels.get(canonical_name)
                if target_level:
                    goal.level_id = target_level.id
                    updated_count += 1
                else:
                    print(f"   Warning: Canonical name '{canonical_name}' for goal {goal.id} not found in defined levels map.")
            
            db_session.commit()
            print(f"\n3. Migration complete! Successfully backfilled {updated_count} goals.")

        except Exception as e:
            db_session.rollback()
            print(f"Failed during migration: {e}")
        finally:
            db_session.close()

if __name__ == "__main__":
    run_migration()
