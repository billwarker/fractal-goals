#!/usr/bin/env python3
"""
Create a demonstration practice session with rich JSON data
"""

import sqlite3
import json
from datetime import datetime
import uuid

# Sample session data with rich JSON structure
session_data = {
    "template_id": "550e8400-e29b-41d4-a716-446655440000",
    "template_name": "Morning Guitar Practice",
    "sections": [
        {
            "name": "Warm-up",
            "duration_minutes": 10,
            "actual_duration_minutes": 12,
            "exercises": [
                {
                    "name": "Chromatic Scales",
                    "description": "Up and down the neck, all strings",
                    "completed": True,
                    "notes": "Felt good today, increased tempo to 120 BPM"
                },
                {
                    "name": "Finger Stretches",
                    "description": "Spider exercises across all frets",
                    "completed": True,
                    "notes": "Much easier than last week!"
                }
            ]
        },
        {
            "name": "Technique Practice",
            "duration_minutes": 20,
            "actual_duration_minutes": 18,
            "exercises": [
                {
                    "name": "Alternate Picking",
                    "description": "Metronome at 120 BPM, 16th notes",
                    "completed": True,
                    "notes": "Struggled with string changes, need more practice"
                },
                {
                    "name": "Legato Runs",
                    "description": "Hammer-ons and pull-offs, 3 notes per string",
                    "completed": False,
                    "notes": "Ran out of time, will focus on this tomorrow"
                },
                {
                    "name": "Sweep Picking",
                    "description": "Major and minor arpeggios",
                    "completed": True,
                    "notes": "Getting cleaner! Still need to work on speed"
                }
            ]
        },
        {
            "name": "Repertoire",
            "duration_minutes": 30,
            "actual_duration_minutes": 30,
            "exercises": [
                {
                    "name": "Song: Stairway to Heaven",
                    "description": "Solo section, bars 45-60",
                    "completed": True,
                    "notes": "Finally nailed the fast run! So satisfying!"
                },
                {
                    "name": "Song: Hotel California",
                    "description": "Intro and first verse",
                    "completed": True,
                    "notes": "Smooth transitions between chords"
                }
            ]
        }
    ],
    "total_duration_minutes": 60,
    "actual_duration_minutes": 60,
    "focus_score": 8,
    "energy_level": 7,
    "notes": "Great session overall! Really happy with progress on Stairway solo. Need to dedicate more time to legato technique tomorrow."
}

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
    
    # Create the practice session
    session_id = str(uuid.uuid4())
    created_at = datetime.now()
    
    cursor.execute("""
        INSERT INTO practice_sessions 
        (id, name, description, completed, created_at, root_id, duration_minutes, session_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        session_id,
        "Morning Guitar Practice - Demo Session",
        "Demonstration of rich JSON session data with sections, exercises, and notes",
        False,  # Not completed yet
        created_at,
        root_id,
        60,  # duration_minutes
        json.dumps(session_data)  # Convert dict to JSON string
    ))
    
    # Link to a short-term goal if one exists
    cursor.execute("""
        SELECT id FROM goals 
        WHERE type = 'ShortTermGoal' 
        AND (parent_id = ? OR id IN (
            SELECT id FROM goals WHERE parent_id IN (
                SELECT id FROM goals WHERE parent_id = ?
            )
        ))
        LIMIT 1
    """, (root_id, root_id))
    
    short_term_goal = cursor.fetchone()
    if short_term_goal:
        cursor.execute("""
            INSERT INTO practice_session_goals (practice_session_id, goal_id)
            VALUES (?, ?)
        """, (session_id, short_term_goal[0]))
        print(f"✓ Linked to Short Term Goal: {short_term_goal[0]}")
    
    conn.commit()
    
    print("\n" + "="*60)
    print("✅ Demo Practice Session Created Successfully!")
    print("="*60)
    print(f"\nSession ID: {session_id}")
    print(f"Name: Morning Guitar Practice - Demo Session")
    print(f"Duration: 60 minutes (1h)")
    print(f"Sections: {len(session_data['sections'])}")
    print(f"Total Exercises: {sum(len(s['exercises']) for s in session_data['sections'])}")
    print(f"Completed Exercises: {sum(1 for s in session_data['sections'] for e in s['exercises'] if e['completed'])}")
    print(f"\nFocus Score: {session_data['focus_score']}/10")
    print(f"Energy Level: {session_data['energy_level']}/10")
    print(f"\nSession Notes: {session_data['notes']}")
    
    print("\n" + "="*60)
    print("📋 Session Structure:")
    print("="*60)
    for i, section in enumerate(session_data['sections'], 1):
        print(f"\n{i}. {section['name']} ({section['duration_minutes']}min planned, {section['actual_duration_minutes']}min actual)")
        for j, exercise in enumerate(section['exercises'], 1):
            status = "✓" if exercise['completed'] else "○"
            print(f"   {status} {exercise['name']}")
            if exercise['notes']:
                print(f"      Note: {exercise['notes']}")
    
    print("\n" + "="*60)
    print("🎯 Next Steps:")
    print("="*60)
    print("1. Visit the Sessions page in your browser")
    print("2. You should see 'Morning Guitar Practice - Demo Session'")
    print("3. Click 'View Details' to see the full JSON structure")
    print("4. Notice the template badge, duration, and progress bar")
    print("="*60)
    
except Exception as e:
    print(f"❌ Error: {e}")
    conn.rollback()
finally:
    conn.close()
