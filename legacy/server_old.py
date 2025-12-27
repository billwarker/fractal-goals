from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from datetime import date
import json
import os
from pydantic import BaseModel

from goals import (
    Goal, UltimateGoal, LongTermGoal, MidTermGoal, ShortTermGoal, 
    PracticeSession, ImmediateGoal, MicroGoal, NanoGoal, reconstruct_goal
)

app = FastAPI()

# Allow CORS for React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GOALS_FILE = "goals_db.json"
goals: List[Goal] = []

def load_goals():
    global goals
    if os.path.exists(GOALS_FILE):
        with open(GOALS_FILE, 'r') as f:
            try:
                data = json.load(f)
                goals = [reconstruct_goal(g_data) for g_data in data]
            except json.JSONDecodeError:
                goals = []
    else:
        goals = []

def save_goals():
    data = [goal.to_dict() for goal in goals]
    with open(GOALS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

# Load on startup
load_goals()

def find_goal_recursive(goal: Goal, target_id: str) -> Optional[Goal]:
    if goal.id == target_id:
        return goal
    for child in goal.children:
        found = find_goal_recursive(child, target_id)
        if found:
            return found
    return None

def find_goal_by_id(target_id: str) -> Optional[Goal]:
    for goal in goals:
        found = find_goal_recursive(goal, target_id)
        if found:
            return found
    return None

class GoalCreate(BaseModel):
    type: str # Class name
    name: str
    description: Optional[str] = ""
    deadline: Optional[date] = None # Pydantic v1 might choke on "" if not careful, but usually expects None or "YYYY-MM-DD"
    parent_id: Optional[str] = None
    completed: Optional[bool] = False
    
    # Pre-validator to convert empty strings to None if needed? 
    # Let's handle it in backend logic or trust frontend sends correct types.
    # Actually, Pydantic might default to None if missing.

@app.get("/api/goals")
def get_goals():
    # Return serializable dicts
    return [g.to_dict() for g in goals]

@app.post("/api/goals")
def create_goal(goal_request: GoalCreate):
    print(f"DEBUG: Creating goal of type {goal_request.type}, parent_id: {goal_request.parent_id}")
    parent = None
    if goal_request.parent_id:
        print(f"DEBUG: Looking for parent with ID: {goal_request.parent_id}")
        print(f"DEBUG: Current root goals: {[g.id for g in goals]}")
        parent = find_goal_by_id(goal_request.parent_id)
        if not parent:
            print(f"DEBUG: Parent not found!")
            raise HTTPException(status_code=404, detail=f"Parent goal not found: {goal_request.parent_id}")
            
    # Correct class instantation
    # We can rely on a similar map to reconstruct_goal or import all classes dynamically
    # For safety, let's use a specific map
    class_map = {
        "UltimateGoal": UltimateGoal,
        "LongTermGoal": LongTermGoal,
        "MidTermGoal": MidTermGoal,
        "ShortTermGoal": ShortTermGoal,
        "PracticeSession": PracticeSession,
        "ImmediateGoal": ImmediateGoal,
        "MicroGoal": MicroGoal,
        "NanoGoal": NanoGoal,
    }
    
    cls = class_map.get(goal_request.type)
    if not cls:
        raise HTTPException(status_code=400, detail="Invalid goal type")
        
    try:
        # Construct arguments
        # Only some take deadline
        if goal_request.type in ["UltimateGoal", "LongTermGoal", "MidTermGoal", "ShortTermGoal", "PracticeSession", "NanoGoal"]:
             new_goal = cls(
                 name=goal_request.name,
                 description=goal_request.description or "",
                 parent=parent,
                 deadline=goal_request.deadline
             )
        else:
             new_goal = cls(
                 name=goal_request.name,
                 description=goal_request.description or "",
                 parent=parent
             )
        
        # If no parent, it's a root goal
        # Allow UltimateGoal, LongTermGoal, MidTermGoal, or ShortTermGoal as roots
        if parent is None:
            goals.append(new_goal)
                
        save_goals()
        return new_goal.to_dict()
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/goals/{goal_id}")
def delete_goal(goal_id: str):
    global goals
    print(f"DEBUG: Attempting to delete goal with ID: {goal_id}")
    
    # 1. Try deleting from roots
    original_count = len(goals)
    goals = [g for g in goals if g.id != goal_id]
    if len(goals) < original_count:
        print(f"DEBUG: Deleted root goal {goal_id}")
        save_goals()
        return {"status": "success", "message": "Root goal deleted"}
        
    # 2. If not a root, we need to find the parent and remove this child
    print(f"DEBUG: Not a root goal. Searching children...")
    
    # Helper to find parent of a specific child ID
    def remove_child_recursive(current_goal: Goal, target_id: str) -> bool:
        for i, child in enumerate(current_goal.children):
            if child.id == target_id:
                # Found it, remove
                print(f"DEBUG: Found goal {target_id} as child of {current_goal.id} ({current_goal.name}). Removing.")
                current_goal.children.pop(i)
                return True
            # Recurse
            if remove_child_recursive(child, target_id):
                return True
        return False
        
    for root in goals:
        if remove_child_recursive(root, goal_id):
            print(f"DEBUG: Successfully removed sub-goal {goal_id}")
            save_goals()
            return {"status": "success", "message": "Sub-goal deleted"}
    
    print(f"DEBUG: Goal {goal_id} not found anywhere.")
    raise HTTPException(status_code=404, detail="Goal not found")

class GoalCompletionUpdate(BaseModel):
    completed: bool

@app.patch("/api/goals/{goal_id}/complete")
def update_goal_completion(goal_id: str, update: GoalCompletionUpdate):
    print(f"DEBUG: Updating completion status for goal {goal_id} to {update.completed}")
    
    goal = find_goal_by_id(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    goal.completed = update.completed
    save_goals()
    
    return {"status": "success", "goal": goal.to_dict()}

class PracticeSessionCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    parent_ids: List[str]  # List of short-term goal IDs
    immediate_goals: List[dict]  # List of {name, description} dicts

@app.post("/api/goals/practice-session")
def create_practice_session(session_request: PracticeSessionCreate):
    print(f"DEBUG: Creating practice session with {len(session_request.parent_ids)} parents")
    
    # Validation
    if not session_request.parent_ids or len(session_request.parent_ids) == 0:
        raise HTTPException(status_code=400, detail="At least one parent short-term goal required")
    
    # Find all parent goals
    parent_goals = []
    for parent_id in session_request.parent_ids:
        parent_goal = find_goal_by_id(parent_id)
        if not parent_goal:
            raise HTTPException(status_code=404, detail=f"Parent goal {parent_id} not found")
        if not isinstance(parent_goal, ShortTermGoal):
            raise HTTPException(status_code=400, detail=f"Parent {parent_id} must be a ShortTermGoal")
        parent_goals.append(parent_goal)
    
    try:
        # Create practice session with multiple parents
        practice_session = PracticeSession(
            name=session_request.name,
            description=session_request.description or "",
            parents=parent_goals,
            deadline=None
        )
        
        # Create immediate goals
        for ig_data in session_request.immediate_goals:
            if ig_data.get("name") and ig_data["name"].strip():
                ImmediateGoal(
                    name=ig_data["name"],
                    description=ig_data.get("description", ""),
                    parent=practice_session
                )
        
        save_goals()
        return {"success": True, "practice_session": practice_session.to_dict()}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/practice-sessions")
def get_all_practice_sessions():
    """Get all practice sessions across all goal trees for grid view"""
    practice_sessions = []
    
    def collect_practice_sessions(goal: Goal):
        if isinstance(goal, PracticeSession):
            practice_sessions.append(goal.to_dict())
        for child in goal.children:
            collect_practice_sessions(child)
    
    for root_goal in goals:
        collect_practice_sessions(root_goal)
    
    return practice_sessions

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
