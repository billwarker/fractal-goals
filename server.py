"""
FastAPI server for Fractal Goals application.
Now using SQLite database instead of JSON file storage.
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from datetime import date, datetime
from pydantic import BaseModel

from models import (
    get_engine, get_session, init_db,
    Goal, PracticeSession,
    get_all_root_goals, get_goal_by_id, get_practice_session_by_id,
    get_all_practice_sessions, get_immediate_goals_for_session,
    build_goal_tree, build_practice_session_tree,
    delete_goal_recursive, delete_practice_session
)

app = FastAPI()

# Allow CORS for React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
engine = get_engine('sqlite:///goals.db')
init_db(engine)

# Pydantic models for request validation
class GoalCreate(BaseModel):
    type: str  # Class name
    name: str
    description: Optional[str] = ""
    deadline: Optional[date] = None
    parent_id: Optional[str] = None
    completed: Optional[bool] = False


class PracticeSessionCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    parent_ids: List[str]  # List of short-term goal IDs
    immediate_goals: List[dict]  # List of {name, description} dicts



class GoalCompletionUpdate(BaseModel):
    completed: bool


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    deadline: Optional[date] = None


@app.get("/api/goals")
def get_goals():
    """Get all root goals with their complete trees."""
    session = get_session(engine)
    try:
        roots = get_all_root_goals(session)
        # Build complete trees for each root
        result = [build_goal_tree(session, root) for root in roots]
        return result
    finally:
        session.close()


@app.post("/api/goals")
def create_goal(goal_request: GoalCreate):
    """Create a new goal."""
    print(f"DEBUG: Creating goal of type {goal_request.type}, parent_id: {goal_request.parent_id}")
    
    session = get_session(engine)
    try:
        parent = None
        if goal_request.parent_id:
            print(f"DEBUG: Looking for parent with ID: {goal_request.parent_id}")
            # Check if parent is a goal
            parent = get_goal_by_id(session, goal_request.parent_id)
            if not parent:
                # Check if parent is a practice session (for ImmediateGoals)
                parent_ps = get_practice_session_by_id(session, goal_request.parent_id)
                if not parent_ps:
                    raise HTTPException(status_code=404, detail=f"Parent not found: {goal_request.parent_id}")
                # For practice sessions, we just use the ID
                parent = None  # We'll set parent_id directly
        
        # Validate goal type
        valid_types = ['UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal',
                       'ImmediateGoal', 'MicroGoal', 'NanoGoal']
        if goal_request.type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid goal type: {goal_request.type}")
        
        # Create the goal
        new_goal = Goal(
            type=goal_request.type,
            name=goal_request.name,
            description=goal_request.description or "",
            deadline=goal_request.deadline,
            completed=goal_request.completed,
            parent_id=goal_request.parent_id  # Can be goal ID or practice session ID
        )
        
        session.add(new_goal)
        session.commit()
        session.refresh(new_goal)
        
        print(f"DEBUG: Created goal {new_goal.id}")
        
        # Return the goal with its tree
        result = build_goal_tree(session, new_goal)
        return result
        
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@app.post("/api/goals/practice-session")
def create_practice_session(session_request: PracticeSessionCreate):
    """Create a new practice session with multiple parent goals and immediate goals."""
    print(f"DEBUG: Creating practice session with {len(session_request.parent_ids)} parents")
    
    db_session = get_session(engine)
    try:
        # Validation
        if not session_request.parent_ids or len(session_request.parent_ids) == 0:
            raise HTTPException(status_code=400, detail="At least one parent short-term goal required")
        
        # Find all parent goals
        # Find all parent goals and identify root
        parent_goals = []
        detected_root_id = None

        for parent_id in session_request.parent_ids:
            parent_goal = get_goal_by_id(db_session, parent_id)
            if not parent_goal:
                raise HTTPException(status_code=404, detail=f"Parent goal {parent_id} not found")
            if parent_goal.type != 'ShortTermGoal':
                raise HTTPException(status_code=400, detail=f"Parent {parent_id} must be a ShortTermGoal")
            
            # Find fractal root for this parent
            current = parent_goal
            depth = 0
            while current.parent_id and depth < 20: # Max depth safety
                # Explicitly fetch parent by ID to ensure we get a scalar object
                parent = get_goal_by_id(db_session, current.parent_id)
                
                if parent:
                    current = parent
                else:
                    break # Reached top or broken link
                depth += 1
            
            if detected_root_id and detected_root_id != current.id:
                raise HTTPException(status_code=400, detail="All parent goals must belong to the same fractal tree")
            detected_root_id = current.id

            parent_goals.append(parent_goal)
        
        # Generate name based on index relative to this fractal root
        session_count = db_session.query(PracticeSession).filter_by(root_id=detected_root_id).count()
        session_index = session_count + 1
        date_str = datetime.now().strftime("%m/%d/%Y")
        generated_name = f"Practice Session {session_index} - {date_str}"

        # Create practice session
        practice_session = PracticeSession(
            name=generated_name,
            description=session_request.description or "",
            completed=False,
            root_id=detected_root_id
        )
        
        # Add parent relationships
        practice_session.parent_goals = parent_goals
        
        db_session.add(practice_session)
        db_session.commit()
        db_session.refresh(practice_session)
        
        # Create immediate goals
        for ig_data in session_request.immediate_goals:
            if ig_data.get("name") and ig_data["name"].strip():
                immediate_goal = Goal(
                    type="ImmediateGoal",
                    name=ig_data["name"],
                    description=ig_data.get("description", ""),
                    parent_id=practice_session.id
                )
                db_session.add(immediate_goal)
        
        db_session.commit()
        
        # Return the practice session with its tree
        result = build_practice_session_tree(db_session, practice_session)
        return {"success": True, "practice_session": result}
        
    except HTTPException:
        db_session.rollback()
        raise
    except Exception as e:
        db_session.rollback()
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db_session.close()


@app.get("/api/practice-sessions")
def get_all_practice_sessions_endpoint():
    """Get all practice sessions for grid view."""
    session = get_session(engine)
    try:
        practice_sessions = get_all_practice_sessions(session)
        # Build trees for each session
        result = [build_practice_session_tree(session, ps) for ps in practice_sessions]
        return result
    finally:
        session.close()


@app.delete("/api/goals/{goal_id}")
def delete_goal(goal_id: str):
    """Delete a goal or practice session and all its children."""
    print(f"DEBUG: Attempting to delete goal/session with ID: {goal_id}")
    
    session = get_session(engine)
    try:
        # Try to find as a goal first
        goal = get_goal_by_id(session, goal_id)
        if goal:
            # Check if it's a root goal
            is_root = goal.parent_id is None
            session.delete(goal)
            session.commit()
            print(f"DEBUG: Deleted {'root ' if is_root else ''}goal {goal_id}")
            return {"status": "success", "message": f"{'Root g' if is_root else 'G'}oal deleted"}
        
        # Try to find as a practice session
        ps = get_practice_session_by_id(session, goal_id)
        if ps:
            # Delete immediate goals first
            immediate_goals = get_immediate_goals_for_session(session, goal_id)
            for ig in immediate_goals:
                session.delete(ig)
            # Delete practice session
            session.delete(ps)
            session.commit()
            print(f"DEBUG: Deleted practice session {goal_id}")
            return {"status": "success", "message": "Practice session deleted"}
        
        # Not found
        print(f"DEBUG: Goal/session {goal_id} not found")
        raise HTTPException(status_code=404, detail="Goal or practice session not found")
        
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        session.close()


@app.put("/api/goals/{goal_id}")
def update_goal(goal_id: str, update: GoalUpdate):
    """Update goal or practice session details."""
    session = get_session(engine)
    try:
        # Try finding as Goal
        goal = get_goal_by_id(session, goal_id)
        if goal:
            if update.name is not None:
                goal.name = update.name
            if update.description is not None:
                goal.description = update.description
            if update.deadline is not None:
                goal.deadline = update.deadline
            session.commit()
            return {"status": "success", "message": "Goal updated"}
        
        # Try finding as PracticeSession
        ps = get_practice_session_by_id(session, goal_id)
        if ps:
            if update.name is not None:
                ps.name = update.name
            if update.description is not None:
                ps.description = update.description
            # PracticeSession has no deadline
            session.commit()
            return {"status": "success", "message": "Practice Session updated"}
        
        raise HTTPException(status_code=404, detail="Goal or session not found")
        
    except Exception as e:
        session.rollback()
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@app.patch("/api/goals/{goal_id}/complete")
def update_goal_completion(goal_id: str, update: GoalCompletionUpdate):
    """Update goal or practice session completion status."""
    print(f"DEBUG: Updating completion status for {goal_id} to {update.completed}")
    
    session = get_session(engine)
    try:
        # Try to find as a goal
        goal = get_goal_by_id(session, goal_id)
        if goal:
            goal.completed = update.completed
            session.commit()
            session.refresh(goal)
            result = build_goal_tree(session, goal)
            return {"status": "success", "goal": result}
        
        # Try to find as a practice session
        ps = get_practice_session_by_id(session, goal_id)
        if ps:
            ps.completed = update.completed
            session.commit()
            session.refresh(ps)
            result = build_practice_session_tree(session, ps)
            return {"status": "success", "goal": result}
        
        raise HTTPException(status_code=404, detail="Goal or practice session not found")
        
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
