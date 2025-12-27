#!/usr/bin/env python3
"""
Debug parent_ids query
"""

import sqlite3
from sqlalchemy import create_engine, text
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
        
        # Try the query directly
        result = db_session.execute(
            text("SELECT short_term_goal_id FROM practice_session_goals WHERE practice_session_id = :session_id"),
            {"session_id": session.id}
        )
        
        parent_ids = [row[0] for row in result]
        print(f"\nDirect query result: {parent_ids}")
        
        if parent_ids:
            print("✅ Query works!")
        else:
            print("❌ Query returned empty")
            
            # Check if ANY associations exist
            all_assoc = db_session.execute(
                text("SELECT * FROM practice_session_goals LIMIT 5")
            )
            print("\nFirst 5 associations in table:")
            for row in all_assoc:
                print(f"  {row}")
        
finally:
    db_session.close()
