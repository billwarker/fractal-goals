import os
import sys

# Setup path so imports work
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

try:
    from app import app
    from models import get_engine, Goal, GoalLevel, get_session
    from sqlalchemy import func
    
    engine = get_engine()
    db = get_session(engine)
    
    # 1. Count goals with level_id is null
    null_level_count = db.query(Goal).filter(Goal.level_id == None).count()
    print(f"[{null_level_count}] goals with level_id is NULL")
    
    # 2. List distinct goal_levels.name
    levels = db.query(GoalLevel.name, GoalLevel.id).distinct().all()
    print(f"Distinct Goal Levels count: {len(levels)}")
    for name, lid in levels:
        print(f"  - {name} ({lid})")
        
    # Check if there are distinct level names present from join
    goal_stats = db.query(
        GoalLevel.name, 
        func.count(Goal.id)
    ).outerjoin(Goal.level).group_by(GoalLevel.name).all()
    
    print("\nGoals by Level Name:")
    for name, cnt in goal_stats:
        print(f"  - {name or 'NULL'}: {cnt} goals")

    # Let's also look at the fallback legacy logic types in the database
    # How many goals don't have a level_id but have "type"? Wait, type was removed from DB.
    
except Exception as e:
    import traceback
    traceback.print_exc()
