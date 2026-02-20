from app import app
from models import get_engine, get_session, Goal
from sqlalchemy.orm import selectinload
from services.serializers import serialize_goal
import json

root_id = "e7298ec6-08dd-41b4-ae2d-f74057dbab96"

with app.app_context():
    engine = get_engine()
    db_session = get_session(engine)
    
    options = [
        selectinload(Goal.children),
        selectinload(Goal.associated_activities),
        selectinload(Goal.associated_activity_groups)
    ]

    root = db_session.query(Goal).options(*options).filter(
        Goal.id == root_id, 
        Goal.parent_id == None,
        Goal.deleted_at == None
    ).first()

    if not root:
        print("Root not found")
    else:
        try:
            res = serialize_goal(root)
            print(f"Serialized output size: {len(json.dumps(res))}")
            print("Successfully serialized without crashing.")
        except Exception as e:
            import traceback
            traceback.print_exc()
