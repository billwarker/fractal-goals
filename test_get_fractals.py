from app import app
from models import get_engine, get_session, Goal
from sqlalchemy.orm import selectinload
from services.serializers import serialize_goal
import json

with app.app_context():
    engine = get_engine()
    db_session = get_session(engine)
    
    roots = db_session.query(Goal).filter_by(parent_id=None, deleted_at=None).all()
    print(f"Found {len(roots)} roots.")
    
    for root in roots:
        res = serialize_goal(root, include_children=False)
        print(f"Root: {root.name}, Type: {res['type']}, LevelName: {res.get('level_name')}")
