#!/usr/bin/env python3
"""Check if sets are being properly tracked in the database"""

from models import get_engine, get_session, ActivityInstance, MetricValue, PracticeSession
import json

engine = get_engine()
db = get_session(engine)

# Get all practice sessions
sessions = db.query(PracticeSession).all()

print(f"Found {len(sessions)} practice sessions\n")

for ps in sessions:
    print(f"Session: {ps.name} (ID: {ps.id})")
    
    # Check session_data for sets
    if ps.session_data:
        data = json.loads(ps.session_data)
        sections = data.get('sections', [])
        
        for section in sections:
            exercises = section.get('exercises', [])
            for ex in exercises:
                if ex.get('type') == 'activity':
                    print(f"  Activity: {ex.get('name')}")
                    print(f"    has_sets: {ex.get('has_sets')}")
                    
                    sets = ex.get('sets', [])
                    if sets:
                        print(f"    Sets in JSON: {len(sets)}")
                        for i, s in enumerate(sets):
                            print(f"      Set #{i+1}: instance_id={s.get('instance_id')}, metrics={s.get('metrics')}")
                    else:
                        print(f"    No sets (single instance)")
                        print(f"    instance_id: {ex.get('instance_id')}")
                        print(f"    metrics: {ex.get('metrics')}")
    
    # Check ActivityInstances in DB
    instances = db.query(ActivityInstance).filter_by(practice_session_id=ps.id).all()
    print(f"  ActivityInstances in DB: {len(instances)}")
    
    for inst in instances:
        print(f"    Instance {inst.id[:8]}...")
        metrics = db.query(MetricValue).filter_by(activity_instance_id=inst.id).all()
        print(f"      Metrics: {len(metrics)}")
        for m in metrics:
            print(f"        {m.definition.name if m.definition else 'Unknown'}: {m.value}")
    
    print()

db.close()
