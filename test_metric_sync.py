#!/usr/bin/env python3
"""Test if the metric sync fix works"""

from models import get_engine, get_session, PracticeSession, ActivityInstance, MetricValue
import json
import requests

# Find a session with sets that has metric values
engine = get_engine()
db = get_session(engine)

# Get session 17b0d485-5cf1-419a-9fd7-eda5782f2570 which has sets with metrics
session_id = '17b0d485-5cf1-419a-9fd7-eda5782f2570'
ps = db.query(PracticeSession).filter_by(id=session_id).first()

if ps and ps.session_data:
    data = json.loads(ps.session_data)
    
    print("Session data structure:")
    for section in data.get('sections', []):
        for ex in section.get('exercises', []):
            if ex.get('type') == 'activity' and ex.get('has_sets'):
                print(f"  Activity: {ex.get('name')}")
                for i, s in enumerate(ex.get('sets', [])):
                    print(f"    Set #{i+1}: {s.get('metrics')}")
    
    # Trigger a re-sync by making an API call to update the session
    print("\nTriggering re-sync via API...")
    response = requests.put(
        f'http://localhost:8001/api/a845a548-8d99-4684-a2c4-debe0caa69ce/sessions/{session_id}',
        json={'session_data': json.dumps(data)}
    )
    
    print(f"API Response: {response.status_code}")
    
    # Check if metrics were saved
    print("\nChecking database after sync...")
    db.close()
    db = get_session(engine)
    
    instances = db.query(ActivityInstance).filter_by(practice_session_id=session_id).all()
    print(f"Found {len(instances)} activity instances")
    
    for inst in instances:
        metrics = db.query(MetricValue).filter_by(activity_instance_id=inst.id).all()
        print(f"  Instance {inst.id[:8]}... has {len(metrics)} metrics")
        for m in metrics:
            print(f"    {m.definition.name if m.definition else 'Unknown'}: {m.value}")

db.close()
