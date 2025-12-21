"""
Migration script to convert goals_db.json to SQLite database.

This script:
1. Reads the existing goals_db.json file
2. Creates a new SQLite database with the proper schema
3. Migrates all goals and practice sessions
4. Preserves all relationships and data
5. Creates a backup of the JSON file
"""

import json
import os
import shutil
from datetime import datetime
from models import (
    get_engine, init_db, get_session,
    Goal, PracticeSession, practice_session_goals
)

JSON_FILE = 'goals_db.json'
BACKUP_FILE = f'goals_db_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
DB_FILE = 'goals.db'

def backup_json():
    """Create a backup of the JSON file."""
    if os.path.exists(JSON_FILE):
        shutil.copy(JSON_FILE, BACKUP_FILE)
        print(f"✓ Created backup: {BACKUP_FILE}")
        return True
    else:
        print(f"⚠ No JSON file found at {JSON_FILE}")
        return False

def load_json_data():
    """Load data from JSON file."""
    if not os.path.exists(JSON_FILE):
        print(f"⚠ No JSON file found. Starting with empty database.")
        return []
    
    with open(JSON_FILE, 'r') as f:
        data = json.load(f)
    print(f"✓ Loaded {len(data)} root goals from JSON")
    return data

def parse_datetime(dt_string):
    """Parse datetime string from JSON."""
    if not dt_string:
        return None
    try:
        # Try ISO format first
        return datetime.fromisoformat(dt_string.replace('Z', '+00:00'))
    except:
        try:
            # Try alternative format
            return datetime.strptime(dt_string, '%Y-%m-%dT%H:%M:%S.%f')
        except:
            return None

def parse_date(date_string):
    """Parse date string from JSON."""
    if not date_string:
        return None
    try:
        return datetime.fromisoformat(date_string).date()
    except:
        return None

def migrate_goal(goal_data, session, parent_id=None, practice_sessions_to_link=None):
    """
    Recursively migrate a goal and its children.
    
    Args:
        goal_data: Dictionary from JSON
        session: SQLAlchemy session
        parent_id: ID of parent goal or practice session
        practice_sessions_to_link: Dict to store practice sessions that need parent linking
    
    Returns:
        The created Goal or PracticeSession object
    """
    if practice_sessions_to_link is None:
        practice_sessions_to_link = {}
    
    goal_id = goal_data.get('id')
    name = goal_data.get('name')
    attrs = goal_data.get('attributes', {})
    goal_type = attrs.get('type', goal_data.get('type'))
    description = attrs.get('description', '')
    completed = attrs.get('completed', False)
    created_at = parse_datetime(attrs.get('created_at'))
    
    if goal_type == 'PracticeSession':
        # Create practice session
        ps = PracticeSession(
            id=goal_id,
            name=name,
            description=description,
            completed=completed,
            created_at=created_at or datetime.now()
        )
        session.add(ps)
        
        # Store parent IDs for later linking (after all goals are created)
        parent_ids = attrs.get('parent_ids', [])
        if parent_ids:
            practice_sessions_to_link[goal_id] = parent_ids
        
        # Recursively migrate children (ImmediateGoals)
        for child_data in goal_data.get('children', []):
            migrate_goal(child_data, session, parent_id=ps.id, practice_sessions_to_link=practice_sessions_to_link)
        
        return ps
    else:
        # Create regular goal
        deadline = parse_date(attrs.get('deadline'))
        
        goal = Goal(
            id=goal_id,
            type=goal_type,
            name=name,
            description=description,
            deadline=deadline,
            completed=completed,
            created_at=created_at or datetime.now(),
            parent_id=parent_id
        )
        session.add(goal)
        
        # Recursively migrate children
        for child_data in goal_data.get('children', []):
            migrate_goal(child_data, session, parent_id=goal.id, practice_sessions_to_link=practice_sessions_to_link)
        
        return goal

def link_practice_sessions(session, practice_sessions_to_link):
    """
    Link practice sessions to their parent short-term goals.
    
    This must be done after all goals are created to ensure parent goals exist.
    """
    print(f"\n✓ Linking {len(practice_sessions_to_link)} practice sessions to parent goals...")
    
    for ps_id, parent_ids in practice_sessions_to_link.items():
        ps = session.query(PracticeSession).filter(PracticeSession.id == ps_id).first()
        if not ps:
            print(f"  ⚠ Practice session {ps_id} not found, skipping...")
            continue
        
        for parent_id in parent_ids:
            parent_goal = session.query(Goal).filter(Goal.id == parent_id).first()
            if parent_goal:
                # Add to many-to-many relationship
                ps.parent_goals.append(parent_goal)
                print(f"  ✓ Linked '{ps.name}' to '{parent_goal.name}'")
            else:
                print(f"  ⚠ Parent goal {parent_id} not found for practice session {ps_id}")
    
    session.commit()

def migrate_all():
    """Main migration function."""
    print("=" * 60)
    print("Fractal Goals: JSON to SQLite Migration")
    print("=" * 60)
    
    # Step 1: Backup JSON
    print("\n[1/5] Creating backup...")
    backup_json()
    
    # Step 2: Load JSON data
    print("\n[2/5] Loading JSON data...")
    json_data = load_json_data()
    
    # Step 3: Initialize database
    print("\n[3/5] Initializing SQLite database...")
    if os.path.exists(DB_FILE):
        response = input(f"⚠ Database file '{DB_FILE}' already exists. Overwrite? (y/N): ")
        if response.lower() != 'y':
            print("Migration cancelled.")
            return
        os.remove(DB_FILE)
    
    engine = get_engine(f'sqlite:///{DB_FILE}')
    init_db(engine)
    db_session = get_session(engine)
    
    # Step 4: Migrate data
    print("\n[4/5] Migrating data...")
    practice_sessions_to_link = {}
    
    for i, root_data in enumerate(json_data, 1):
        print(f"  Migrating root goal {i}/{len(json_data)}: {root_data.get('name')}")
        migrate_goal(root_data, db_session, practice_sessions_to_link=practice_sessions_to_link)
    
    db_session.commit()
    print(f"✓ Migrated {len(json_data)} root goals")
    
    # Step 5: Link practice sessions to parent goals
    print("\n[5/5] Linking practice sessions...")
    link_practice_sessions(db_session, practice_sessions_to_link)
    
    # Summary
    print("\n" + "=" * 60)
    print("Migration Summary")
    print("=" * 60)
    
    total_goals = db_session.query(Goal).count()
    total_sessions = db_session.query(PracticeSession).count()
    root_goals = db_session.query(Goal).filter(Goal.parent_id == None).count()
    
    print(f"✓ Total Goals: {total_goals}")
    print(f"✓ Total Practice Sessions: {total_sessions}")
    print(f"✓ Root Goals: {root_goals}")
    print(f"✓ Database: {DB_FILE}")
    print(f"✓ Backup: {BACKUP_FILE}")
    
    db_session.close()
    print("\n✓ Migration completed successfully!")
    print("\nNext steps:")
    print("1. Test the database by running: python test_db.py")
    print("2. Update server.py to use the database")
    print("3. Keep the JSON backup until you're confident everything works")

if __name__ == "__main__":
    migrate_all()
