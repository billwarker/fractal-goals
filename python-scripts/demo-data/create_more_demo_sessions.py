#!/usr/bin/env python3
"""
Create three additional demonstration practice sessions with varied data
"""

import sqlite3
import json
from datetime import datetime, timedelta
import uuid

# Session 1: Evening Practice (Yesterday)
session_data_1 = {
    "template_name": "Evening Technique Focus",
    "sections": [
        {
            "name": "Speed Building",
            "duration_minutes": 15,
            "actual_duration_minutes": 20,
            "exercises": [
                {
                    "name": "Fast Alternate Picking",
                    "description": "16th notes at 140 BPM",
                    "completed": True,
                    "notes": "Hit new speed record! Feeling strong"
                },
                {
                    "name": "Tremolo Picking",
                    "description": "Single string endurance",
                    "completed": True,
                    "notes": "Lasted 2 minutes straight"
                }
            ]
        },
        {
            "name": "Theory Application",
            "duration_minutes": 25,
            "actual_duration_minutes": 25,
            "exercises": [
                {
                    "name": "Modal Improvisation",
                    "description": "Dorian mode over backing track",
                    "completed": True,
                    "notes": "Finally understanding the sound!"
                },
                {
                    "name": "Chord Progressions",
                    "description": "ii-V-I in all keys",
                    "completed": False,
                    "notes": "Only got through 6 keys, need more time"
                }
            ]
        }
    ],
    "total_duration_minutes": 40,
    "actual_duration_minutes": 45,
    "focus_score": 9,
    "energy_level": 8,
    "notes": "Best practice in weeks! Speed is really improving. Need to dedicate full session to theory next time."
}

# Session 2: Quick Morning Session (2 days ago)
session_data_2 = {
    "template_name": "Quick Morning Warmup",
    "sections": [
        {
            "name": "Basics",
            "duration_minutes": 20,
            "actual_duration_minutes": 18,
            "exercises": [
                {
                    "name": "Scales",
                    "description": "Major scales, all positions",
                    "completed": True,
                    "notes": "Quick run-through before work"
                },
                {
                    "name": "Chord Changes",
                    "description": "Open chord transitions",
                    "completed": True,
                    "notes": "Smooth and clean"
                }
            ]
        }
    ],
    "total_duration_minutes": 20,
    "actual_duration_minutes": 18,
    "focus_score": 6,
    "energy_level": 5,
    "notes": "Short but effective. Just wanted to keep the streak going."
}

# Session 3: Comprehensive Weekend Session (3 days ago)
session_data_3 = {
    "template_name": "Weekend Deep Dive",
    "sections": [
        {
            "name": "Technical Warmup",
            "duration_minutes": 15,
            "actual_duration_minutes": 15,
            "exercises": [
                {
                    "name": "Finger Independence",
                    "description": "1-2-3-4 patterns",
                    "completed": True,
                    "notes": "Solid warmup"
                },
                {
                    "name": "String Skipping",
                    "description": "Across all string pairs",
                    "completed": True,
                    "notes": "Getting more accurate"
                }
            ]
        },
        {
            "name": "New Material",
            "duration_minutes": 30,
            "actual_duration_minutes": 35,
            "exercises": [
                {
                    "name": "Learn New Song",
                    "description": "Comfortably Numb solo",
                    "completed": True,
                    "notes": "First section memorized!"
                },
                {
                    "name": "Transcription Work",
                    "description": "Write out the solo",
                    "completed": False,
                    "notes": "Ran out of time, will finish next session"
                }
            ]
        },
        {
            "name": "Improvisation",
            "duration_minutes": 20,
            "actual_duration_minutes": 25,
            "exercises": [
                {
                    "name": "Blues Jam",
                    "description": "12-bar blues in A",
                    "completed": True,
                    "notes": "Had some really cool moments!"
                },
                {
                    "name": "Backing Track Practice",
                    "description": "Rock ballad progression",
                    "completed": True,
                    "notes": "Explored different phrasing ideas"
                }
            ]
        },
        {
            "name": "Review",
            "duration_minutes": 15,
            "actual_duration_minutes": 15,
            "exercises": [
                {
                    "name": "Previous Songs",
                    "description": "Run through repertoire",
                    "completed": True,
                    "notes": "Everything still solid"
                }
            ]
        }
    ],
    "total_duration_minutes": 80,
    "actual_duration_minutes": 90,
    "focus_score": 10,
    "energy_level": 9,
    "notes": "Amazing weekend session! Lots of progress on new material. The improvisation section was particularly inspiring - captured some ideas on my phone to develop later."
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
    
    # Create three sessions with different dates
    sessions = [
        {
            "name": "Evening Technique Focus",
            "description": "Speed building and theory application",
            "data": session_data_1,
            "duration": 45,
            "date": datetime.now() - timedelta(days=1),  # Yesterday
            "completed": True
        },
        {
            "name": "Quick Morning Warmup",
            "description": "Brief session before work",
            "data": session_data_2,
            "duration": 18,
            "date": datetime.now() - timedelta(days=2),  # 2 days ago
            "completed": True
        },
        {
            "name": "Weekend Deep Dive",
            "description": "Comprehensive practice covering all areas",
            "data": session_data_3,
            "duration": 90,
            "date": datetime.now() - timedelta(days=3),  # 3 days ago
            "completed": False
        }
    ]
    
    created_sessions = []
    
    for session in sessions:
        session_id = str(uuid.uuid4())
        
        cursor.execute("""
            INSERT INTO practice_sessions 
            (id, name, description, completed, created_at, root_id, duration_minutes, session_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session_id,
            session["name"],
            session["description"],
            session["completed"],
            session["date"],
            root_id,
            session["duration"],
            json.dumps(session["data"])
        ))
        
        created_sessions.append({
            "id": session_id,
            "name": session["name"],
            "date": session["date"],
            "duration": session["duration"],
            "sections": len(session["data"]["sections"]),
            "exercises": sum(len(s["exercises"]) for s in session["data"]["sections"])
        })
        
        print(f"✓ Created: {session['name']}")
    
    conn.commit()
    
    print("\n" + "="*60)
    print("✅ Three Demo Sessions Created Successfully!")
    print("="*60)
    
    for i, s in enumerate(created_sessions, 1):
        print(f"\n{i}. {s['name']}")
        print(f"   Date: {s['date'].strftime('%Y-%m-%d %H:%M')}")
        print(f"   Duration: {s['duration']} minutes")
        print(f"   Sections: {s['sections']}")
        print(f"   Exercises: {s['exercises']}")
    
    print("\n" + "="*60)
    print("📊 Total Sessions in Database:")
    cursor.execute("SELECT COUNT(*) FROM practice_sessions WHERE root_id = ?", (root_id,))
    total = cursor.fetchone()[0]
    print(f"   {total} sessions")
    print("="*60)
    
    print("\n🎯 Next: Visit the Sessions page to see:")
    print("   - All 4 sessions displayed")
    print("   - Scrollable list")
    print("   - Sorted by date (newest first)")
    print("="*60)
    
except Exception as e:
    print(f"❌ Error: {e}")
    conn.rollback()
finally:
    conn.close()
