
import sys
import os
import json
from collections import defaultdict

# Add parent dir to path to import models
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import get_engine, get_session, ActivityDefinition, ActivityInstance, Goal, activity_goal_associations, MetricDefinition, SplitDefinition
from sqlalchemy import func, text

def deduplicate_activities():
    print("Starting activity deduplication...")
    
    # Use dev db by default or from env
    db_filename = os.environ.get('DB_PATH', 'goals.db')
    
    # Ensure absolute path
    if not os.path.isabs(db_filename):
        db_filename = os.path.join(os.getcwd(), db_filename)
        
    db_url = f"sqlite:///{db_filename}"
    print(f"Using database: {db_url}")
    
    engine = get_engine(db_url)
    session = get_session(engine)
    
    try:
        # 1. Identify Duplicates
        print("Scanning for duplicates...")
        all_activities = session.query(ActivityDefinition).all()
        
        # Group by normalized name (lowercase, stripped)
        grouped = defaultdict(list)
        for act in all_activities:
            norm_name = act.name.strip().lower()
            grouped[norm_name].append(act)
            
        duplicates_groups = {name: acts for name, acts in grouped.items() if len(acts) > 1}
        
        if not duplicates_groups:
            print("No duplicates found!")
            return

        print(f"Found {len(duplicates_groups)} groups of duplicate activities.")
        
        total_repointed_instances = 0
        total_repointed_associations = 0
        total_updated_goals = 0
        total_deleted_activities = 0
        
        for norm_name, activities in duplicates_groups.items():
            print(f"\nProcessing group: '{norm_name}' ({len(activities)} activities)")
            
            # Sort by creation time (keep the oldest one as master, or one with most dependencies?)
            # Heuristic: Keep the one created first (most likely to be the original correct one)
            # Or keep the one with most usages? 
            # Simple heuristic: Oldest is master.
            activities.sort(key=lambda x: x.created_at or x.name) # fallback to name if created_at None
            master = activities[0]
            duplicates = activities[1:]
            
            print(f"  Master: '{master.name}' (ID: {master.id})")
            
            for dup in duplicates:
                print(f"  Merging duplicate: '{dup.name}' (ID: {dup.id})")
                
                # 2. Update Activity Instances
                instances = session.query(ActivityInstance).filter_by(activity_definition_id=dup.id).all()
                if instances:
                    print(f"    Repointing {len(instances)} activity instances...")
                    for inst in instances:
                        inst.activity_definition_id = master.id
                    total_repointed_instances += len(instances)
                
                # 3. Update Activity Goal Associations (SMART Achievable)
                # We need to handle SQL helpers for many-to-many
                # Delete duplicate association, check if master already has it, if not add it.
                
                dup_assocs_query = text("SELECT goal_id FROM activity_goal_associations WHERE activity_id = :aid")
                dup_goal_ids = session.execute(dup_assocs_query, {"aid": dup.id}).scalars().all()
                
                if dup_goal_ids:
                    print(f"    Processing {len(dup_goal_ids)} goal associations...")
                    for gid in dup_goal_ids:
                        # Check if master already has this association
                        check_master = text("SELECT 1 FROM activity_goal_associations WHERE activity_id = :mid AND goal_id = :gid")
                        exists = session.execute(check_master, {"mid": master.id, "gid": gid}).scalar()
                        
                        if not exists:
                            # Add to master
                            insert_stmt = text("INSERT INTO activity_goal_associations (activity_id, goal_id) VALUES (:mid, :gid)")
                            session.execute(insert_stmt, {"mid": master.id, "gid": gid})
                            total_repointed_associations += 1
                        
                        # Remove from duplicate
                        del_stmt = text("DELETE FROM activity_goal_associations WHERE activity_id = :aid AND goal_id = :gid")
                        session.execute(del_stmt, {"aid": dup.id, "gid": gid})
                
                # 4. Handle Metrics and Splits (Move or Delete?)
                # If master has metrics, we assume they are correct. We delete duplicate's metrics/splits.
                # If master has NO metrics, maybe we should copy?
                # For safety, we'll just delete duplicate's metric definitions to avoid constraint errors, 
                # assuming master is the "truth".
                session.query(MetricDefinition).filter_by(activity_id=dup.id).delete()
                session.query(SplitDefinition).filter_by(activity_id=dup.id).delete()

                # 5. Delete the Duplicate Activity
                session.delete(dup)
                total_deleted_activities += 1
        
        # 6. Update JSON Targets in Goals
        # This scans ALL goals, which is heavy but necessary.
        print("\nScanning Goal Targets for updates...")
        all_goals = session.query(Goal).all()
        activity_map = {} # Map old_id -> new_id
        for norm_name, activities in duplicates_groups.items():
            activities.sort(key=lambda x: x.created_at or x.name)
            master_id = activities[0].id
            for dup in activities[1:]:
                activity_map[dup.id] = master_id
        
        for goal in all_goals:
            if not goal.targets:
                continue
                
            try:
                targets = json.loads(goal.targets)
                changed = False
                for t in targets:
                    if 'activity_id' in t and t['activity_id'] in activity_map:
                        print(f"  Fixing target in Goal '{goal.name}': {t['activity_id']} -> {activity_map[t['activity_id']]}")
                        t['activity_id'] = activity_map[t['activity_id']]
                        changed = True
                
                if changed:
                    goal.targets = json.dumps(targets)
                    total_updated_goals += 1
            except json.JSONDecodeError:
                continue

        print("\nCommitting changes...")
        session.commit()
        
        print("\nSummary:")
        print(f"  Deleted Duplicates: {total_deleted_activities}")
        print(f"  Repointed Instances: {total_repointed_instances}")
        print(f"  Repointed Associations: {total_repointed_associations}")
        print(f"  Updated Goals (Targets): {total_updated_goals}")
        print("Deduplication complete.")
        
    except Exception as e:
        session.rollback()
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        session.close()

if __name__ == "__main__":
    deduplicate_activities()
