#!/usr/bin/env python3
"""
Associate all demo practice sessions with the "Guitar Pro" short-term goal
"""

import sqlite3
import uuid

def get_root_id_for_goal(cursor, goal_id):
    """Traverse up the tree to find the root goal"""
    current_id = goal_id
    while True:
        cursor.execute("SELECT parent_id FROM goals WHERE id = ?", (current_id,))
        result = cursor.fetchone()
        if not result or not result[0]:
            return current_id
        current_id = result[0]

# Connect to database
conn = sqlite3.connect('goals.db')
cursor = conn.cursor()

try:
    # Get the first root_id (fractal) from the database
    cursor.execute("SELECT id FROM goals WHERE parent_id IS NULL LIMIT 1")
    result = cursor.fetchone()
    
    if not result:
        print("❌ No root goal found. Please create a fractal first.")
        exit(1)
    
    root_id = result[0]
    print(f"✓ Using fractal: {root_id}")
    
    # Find "Guitar Pro" short-term goal (search all goals under this root)
    cursor.execute("""
        SELECT id, name, type, parent_id FROM goals 
        WHERE name = 'Guitar Pro' AND type = 'ShortTermGoal'
    """)
    
    guitar_pro_candidates = cursor.fetchall()
    guitar_pro_goal = None
    
    # Find the one that belongs to our root
    for candidate in guitar_pro_candidates:
        candidate_root = get_root_id_for_goal(cursor, candidate[0])
        if candidate_root == root_id:
            guitar_pro_goal = candidate
            break
    
    if guitar_pro_goal:
        goal_id = guitar_pro_goal[0]
        print(f"✓ Found existing goal: {guitar_pro_goal[1]} (Type: {guitar_pro_goal[2]})")
    else:
        # Create "Guitar Pro" as a ShortTermGoal
        goal_id = str(uuid.uuid4())
        
        # First, find a MediumTermGoal to be the parent
        cursor.execute("""
            SELECT id, name, parent_id FROM goals 
            WHERE type = 'MediumTermGoal'
        """)
        
        medium_term_candidates = cursor.fetchall()
        medium_term_goal = None
        
        for candidate in medium_term_candidates:
            candidate_root = get_root_id_for_goal(cursor, candidate[0])
            if candidate_root == root_id:
                medium_term_goal = candidate
                break
        
        if not medium_term_goal:
            print("❌ No MediumTermGoal found. Creating one first...")
            
            # Find a LongTermGoal
            cursor.execute("""
                SELECT id, parent_id FROM goals 
                WHERE type = 'LongTermGoal'
            """)
            
            long_term_candidates = cursor.fetchall()
            long_term_goal = None
            
            for candidate in long_term_candidates:
                candidate_root = get_root_id_for_goal(cursor, candidate[0])
                if candidate_root == root_id:
                    long_term_goal = candidate
                    break
            
            if not long_term_goal:
                print("❌ No LongTermGoal found. Please create the goal hierarchy first.")
                exit(1)
            
            # Create a MediumTermGoal
            medium_term_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO goals (id, name, description, type, completed, parent_id)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                medium_term_id,
                "Music Mastery",
                "Develop comprehensive musical skills",
                "MediumTermGoal",
                False,
                long_term_goal[0]
            ))
            print(f"✓ Created MediumTermGoal: Music Mastery")
            parent_id = medium_term_id
        else:
            parent_id = medium_term_goal[0]
            print(f"✓ Using parent: {medium_term_goal[1]}")
        
        # Create "Guitar Pro" ShortTermGoal
        cursor.execute("""
            INSERT INTO goals (id, name, description, type, completed, parent_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            goal_id,
            "Guitar Pro",
            "Become proficient at guitar playing",
            "ShortTermGoal",
            False,
            parent_id
        ))
        print(f"✓ Created ShortTermGoal: Guitar Pro")
    
    # Get all practice sessions for this fractal
    cursor.execute("""
        SELECT id, name FROM practice_sessions 
        WHERE root_id = ?
    """, (root_id,))
    
    sessions = cursor.fetchall()
    
    if not sessions:
        print("❌ No practice sessions found.")
        exit(1)
    
    print(f"\n✓ Found {len(sessions)} practice sessions")
    
    # Associate each session with the "Guitar Pro" goal
    updated_count = 0
    for session_id, session_name in sessions:
        # Check if association already exists
        cursor.execute("""
            SELECT 1 FROM practice_session_goals 
            WHERE practice_session_id = ? AND short_term_goal_id = ?
        """, (session_id, goal_id))
        
        if cursor.fetchone():
            print(f"  ⊙ {session_name} - already associated")
        else:
            # Create the association
            cursor.execute("""
                INSERT INTO practice_session_goals (practice_session_id, short_term_goal_id)
                VALUES (?, ?)
            """, (session_id, goal_id))
            print(f"  ✓ {session_name} - associated with Guitar Pro")
            updated_count += 1
    
    conn.commit()
    
    print("\n" + "="*60)
    print("✅ Successfully Associated Sessions with Guitar Pro!")
    print("="*60)
    print(f"   Goal: Guitar Pro (ID: {goal_id})")
    print(f"   Sessions Updated: {updated_count}")
    print(f"   Sessions Already Associated: {len(sessions) - updated_count}")
    print(f"   Total Sessions: {len(sessions)}")
    print("="*60)
    
    print("\n🎯 Next: Refresh the Sessions page to see:")
    print("   - 'Short-Term Goals:' section")
    print("   - [Guitar Pro] badge on all sessions")
    print("="*60)
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    conn.rollback()
finally:
    conn.close()
