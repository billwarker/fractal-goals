
import sys
import os
from datetime import datetime
import uuid

# Add current dir to path
sys.path.append(os.getcwd())

from models import Session, Base
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Connect to dev DB
engine = create_engine('sqlite:///goals_dev.db')
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

# Create a test session
s_start = datetime(2026, 1, 5, 16, 55, 0)
print(f"Desired start: {s_start}")

# Find a root goal
root = db.execute(text("SELECT id FROM goals WHERE type='UltimateGoal' LIMIT 1")).fetchone()
if not root:
    print("No root goal found")
    sys.exit(1)

root_id = root[0]

session = Session(
    id=str(uuid.uuid4()),
    root_id=root_id,
    name="Test Script Session",
    session_start=s_start,
    created_at=datetime.now()
)

print(f"Session object start before add: {session.session_start}")
db.add(session)
db.commit()

# Verify
s_id = session.id
print(f"Created session {s_id}")

saved_s = db.query(Session).filter_by(id=s_id).first()
print(f"Saved session start: {saved_s.session_start}")

if saved_s.session_start.hour == 0 and saved_s.session_start.minute == 0:
    print("ERROR: Time was stripped!")
else:
    print("SUCCESS: Time preserved!")
