
import sys
import os
import json
import uuid
from datetime import datetime

# Add project root to path
sys.path.append(os.getcwd())

from app import app

from models import (
    get_engine, get_session, PracticeSession, ActivityInstance, 
    MetricValue, ActivityDefinition
)

def local_to_utc(iso_str):
    """Basic helper to ensure timestamps are safe."""
    if not iso_str: return None
    try:
        # Assuming typical format, if it fails, we iterate
        return datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
    except:
        return None

def migrate_sessions():
    # Force production env if not set? Or rely on shell.
    # We use the imported app context
    with app.app_context():
        # Re-get engine inside context to be sure? models.get_engine reads config.
        db_session = get_session(get_engine())
        
        try:
            print("Fetching sessions...")
            sessions = db_session.query(PracticeSession).all()
            print(f"Found {len(sessions)} sessions.")
            
            migrated_count = 0
            
            for session in sessions:
                session_data_json = session.attributes or session.session_data
                if not session_data_json:
                    continue
                    
                data = json.loads(session_data_json)
                if 'sections' not in data:
                    continue
                
                changed = False
                
                for section in data['sections']:
                    # If already has activity_ids, assume migrated (or partially). 
                    # But we want to ensure all exercises are migrated.
                    # We look at 'exercises' array which contains the TRUTH for old sessions.
                    
                    exercises = section.get('exercises', [])
                    if not exercises:
                        continue
                        
                    activity_ids = section.get('activity_ids', [])
                    
                    # If exercises exist but NO activity_ids, it is definitely unmigrated.
                    # If both exist, we might have a mixed state. 
                    # Strategy: If Unmigrated, process all.
                    
                    if not activity_ids and exercises:
                        print(f"Migrating session '{session.name}' (ID: {session.id})...")
                        new_ids = []
                        
                        for ex in exercises:
                            # Create new Instance
                            instance_id = ex.get('instance_id') or str(uuid.uuid4())
                            
                            # Check if exists (safety)
                            existing = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
                            if existing:
                                # Already exists? check if we should update. 
                                # For now, assume if ID match, it's valid.
                                new_ids.append(instance_id)
                                continue
                            
                            # Prepare data
                            act_def_id = ex.get('activity_id')
                            if not act_def_id:
                                continue # Cannot migrate unknown activity
                                
                            # Convert timestamps
                            t_start = local_to_utc(ex.get('time_start'))
                            t_stop = local_to_utc(ex.get('time_stop'))
                            
                            # Sets
                            sets = ex.get('sets', [])
                            notes = ex.get('notes', '')
                            completed = ex.get('completed', False)
                            
                            # Store sets in JSON data column
                            data_col = json.dumps({'sets': sets})
                            
                            new_inst = ActivityInstance(
                                id=instance_id,
                                practice_session_id=session.id,
                                activity_definition_id=act_def_id,
                                time_start=t_start,
                                time_stop=t_stop,
                                duration_seconds=ex.get('duration_seconds'),
                                completed=completed,
                                notes=notes,
                                data=data_col,
                                created_at=datetime.now() # Approximate
                            )
                            db_session.add(new_inst)
                            
                            # Metrics (Non-Set metrics)
                            # 'metrics' in legacy JSON was list of {metric_id, value, split_id...}
                            legacy_metrics = ex.get('metrics', [])
                            for m in legacy_metrics:
                                try:
                                    val = float(m.get('value', 0))
                                    mv = MetricValue(
                                        activity_instance_id=instance_id,
                                        metric_definition_id=m.get('metric_id'),
                                        split_definition_id=m.get('split_id'),
                                        value=val
                                    )
                                    db_session.add(mv)
                                except:
                                    pass
                                    
                            new_ids.append(instance_id)
                        
                        # Update section
                        section['activity_ids'] = new_ids
                        # Clear exercises to finish migration (Database becomes source of Truth)
                        del section['exercises']
                        changed = True
                        migrated_count += 1
                
                if changed:
                    # Save updated session_data
                    # Use attributes column as per new standard, also sync session_data
                    json_str = json.dumps(data)
                    session.attributes = json_str
                    session.session_data = json_str
                    
            db_session.commit()
            print(f"Migration complete. Migrated {migrated_count} sessions.")
            
        except Exception as e:
            print(f"Error during migration: {str(e)}")
            import traceback
            traceback.print_exc()
            db_session.rollback()
        finally:
            db_session.close()

if __name__ == '__main__':
    migrate_sessions()
