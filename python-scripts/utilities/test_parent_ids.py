#!/usr/bin/env python3
"""
Test if parent_ids are being returned in the API
"""

import sqlite3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import PracticeSession, Goal

# Create engine and session
engine = create_engine('sqlite:///goals.db')
Session = sessionmaker(bind=engine)
db_session = Session()

try:
    # Get a practice session
    session = db_session.query(PracticeSession).first()
    
    if session:
        print(f"Session: {session.name}")
        print(f"ID: {session.id}")
        print(f"Parent goals count: {len(session.parent_goals)}")
        print(f"Parent goals: {[g.name for g in session.parent_goals]}")
        
        # Convert to dict
        session_dict = session.to_dict(include_parents=True, session=db_session)
        print(f"\nparent_ids in dict: {session_dict['attributes'].get('parent_ids', [])}")
        
        if session_dict['attributes'].get('parent_ids'):
            print("\n✅ parent_ids are being included!")
        else:
            print("\n❌ parent_ids are NOT being included!")
    else:
        print("No sessions found")
        
finally:
    db_session.close()
