"""
SQLAlchemy database models for Fractal Goals application.

This module defines the database schema using SQLAlchemy ORM:
- Goal: All goal types except practice sessions
- PracticeSession: Separate table for practice sessions with extensibility
- practice_session_goals: Junction table for many-to-many relationships
"""

from sqlalchemy import create_engine, Column, String, Boolean, DateTime, Integer, ForeignKey, Table, CheckConstraint
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from datetime import datetime
import uuid

Base = declarative_base()

# Junction table for many-to-many relationship between practice sessions and short-term goals
practice_session_goals = Table(
    'practice_session_goals',
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),
    Column('practice_session_id', String, ForeignKey('practice_sessions.id', ondelete='CASCADE'), nullable=False),
    Column('short_term_goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
    Column('created_at', DateTime, default=datetime.now),
    # Prevent duplicate relationships
    CheckConstraint('practice_session_id != short_term_goal_id', name='different_ids')
)

class Goal(Base):
    """
    Represents all goal types in the hierarchy except practice sessions.
    
    Goal types: UltimateGoal, LongTermGoal, MidTermGoal, ShortTermGoal,
                ImmediateGoal, MicroGoal, NanoGoal
    
    Tree structure is maintained via parent_id which can reference:
    - Another goal (for most goal types)
    - A practice session (for ImmediateGoals)
    """
    __tablename__ = 'goals'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    deadline = Column(DateTime, nullable=True)
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    parent_id = Column(String, nullable=True)  # Can reference goals.id or practice_sessions.id
    
    # Constraint to ensure type is valid
    __table_args__ = (
        CheckConstraint(
            type.in_([
                'UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal',
                'ImmediateGoal', 'MicroGoal', 'NanoGoal'
            ]),
            name='valid_goal_type'
        ),
    )
    
    # Self-referential relationship for goal tree
    # Note: This only works for goal-to-goal relationships
    # ImmediateGoal -> PracticeSession relationships need custom handling
    children = relationship(
        "Goal",
        foreign_keys=[parent_id],
        primaryjoin="Goal.parent_id == Goal.id",
        backref='parent_goal',
        remote_side=[id],
        lazy='select'  # Ensure children are loaded
    )
    
    def to_dict(self, include_children=True):
        """Convert goal to dictionary format compatible with frontend."""
        result = {
            "name": self.name,
            "id": self.id,
            "attributes": {
                "id": self.id,
                "type": self.type,
                "description": self.description,
                "deadline": self.deadline.isoformat() if self.deadline else None,
                "completed": self.completed,
                "created_at": self.created_at.isoformat() if self.created_at else None,
            },
            "children": []
        }
        
        if include_children and self.children is not None:
            result["children"] = [child.to_dict() for child in self.children]
        
        return result
    
    def __repr__(self):
        return f"<Goal(id={self.id}, type={self.type}, name={self.name})>"


class PracticeSession(Base):
    """
    Represents a practice session with potential for many parent short-term goals.
    
    Practice sessions are separate from goals to allow for session-specific
    attributes and future extensibility (duration, focus score, etc.)
    
    Session data is stored as JSON for maximum flexibility and can be populated
    from session templates.
    """
    __tablename__ = 'practice_sessions'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, default='')
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    root_id = Column(String, ForeignKey('goals.id'), nullable=True)
    
    # Duration of the practice session in minutes
    # Can be compared with planned duration from session_data
    duration_minutes = Column(Integer, nullable=True)
    
    # JSON structure for flexible session data
    # Can include: template_id, template_name, sections, exercises, 
    # duration, focus_score, energy_level, notes, etc.
    session_data = Column(String, nullable=True)  # Stored as JSON string
    
    # Many-to-many relationship with short-term goals  
    parent_goals = relationship(
        "Goal",
        secondary=practice_session_goals,
        primaryjoin="PracticeSession.id==practice_session_goals.c.practice_session_id",
        secondaryjoin="Goal.id==practice_session_goals.c.short_term_goal_id",
        backref="linked_practice_sessions",
        viewonly=False
    )
    
    def to_dict(self, include_children=True, include_parents=True, session=None):
        """Convert practice session to dictionary format compatible with frontend."""
        import json
        
        result = {
            "name": self.name,
            "id": self.id,
            "attributes": {
                "id": self.id,
                "type": "PracticeSession",
                "description": self.description,
                "completed": self.completed,
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "root_id": self.root_id,
                "duration_minutes": self.duration_minutes,
            },
            "children": []
        }
        
        # Add parent_ids for frontend - manually query from junction table
        if include_parents:
            from sqlalchemy import text
            # Use passed session or try to get from inspect
            session_obj = session
            if not session_obj:
                from sqlalchemy import inspect
                session_obj = inspect(self).session
            
            if session_obj:
                # Query the junction table directly
                parent_ids_query = session_obj.execute(
                    text("SELECT short_term_goal_id FROM practice_session_goals WHERE practice_session_id = :session_id"),
                    {"session_id": self.id}
                )
                result["attributes"]["parent_ids"] = [row[0] for row in parent_ids_query]
            else:
                result["attributes"]["parent_ids"] = []
        
        # Add session_data (parse JSON if present)
        if self.session_data:
            try:
                result["attributes"]["session_data"] = json.loads(self.session_data)
            except (json.JSONDecodeError, TypeError):
                result["attributes"]["session_data"] = None
        else:
            result["attributes"]["session_data"] = None
        
        # Note: Children (ImmediateGoals) need to be queried separately
        # since they're in the goals table with parent_id pointing here
        
        return result
    
    def __repr__(self):
        return f"<PracticeSession(id={self.id}, name={self.name}, parents={len(self.parent_goals)})>"


class SessionTemplate(Base):
    """
    Represents a reusable template for practice sessions.
    
    Templates define the structure of a practice session including sections,
    exercises, and durations. Users can create sessions from templates.
    """
    __tablename__ = 'session_templates'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, default='')
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    
    # Template structure stored as JSON
    # Structure: {
    #   "sections": [
    #     {
    #       "name": "Warm-up",
    #       "duration_minutes": 10,
    #       "exercises": [
    #         {"name": "Chromatic scales", "description": "Up and down the neck"}
    #       ]
    #     }
    #   ],
    #   "total_duration_minutes": 60,
    #   "tags": ["guitar", "technique"]
    # }
    template_data = Column(String, nullable=False)  # Stored as JSON string
    
    def to_dict(self):
        """Convert template to dictionary format compatible with frontend."""
        import json
        
        result = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "root_id": self.root_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        
        # Parse template_data JSON
        if self.template_data:
            try:
                result["template_data"] = json.loads(self.template_data)
            except (json.JSONDecodeError, TypeError):
                result["template_data"] = {}
        else:
            result["template_data"] = {}
        
        return result
    
    def __repr__(self):
        return f"<SessionTemplate(id={self.id}, name={self.name}, root_id={self.root_id})>"


# Database connection and session management
def get_engine(db_path='sqlite:///goals.db'):
    """Create and return SQLAlchemy engine."""
    return create_engine(db_path, echo=False)  # Set echo=True for SQL debugging


def init_db(engine):
    """Initialize database schema."""
    Base.metadata.create_all(engine)
    print("Database schema created successfully!")


def get_session(engine):
    """Create and return a new database session."""
    Session = sessionmaker(bind=engine)
    return Session()


# Helper functions for common queries
def get_all_root_goals(session):
    """Get all root goals (goals with no parent)."""
    return session.query(Goal).filter(Goal.parent_id == None).all()


def get_goal_by_id(session, goal_id):
    """Get a goal by its ID."""
    return session.query(Goal).filter(Goal.id == goal_id).first()


def get_practice_session_by_id(session, session_id):
    """Get a practice session by its ID."""
    return session.query(PracticeSession).filter(PracticeSession.id == session_id).first()


def get_all_practice_sessions(session):
    """Get all practice sessions."""
    return session.query(PracticeSession).all()


def get_immediate_goals_for_session(session, practice_session_id):
    """Get all immediate goals that belong to a practice session."""
    return session.query(Goal).filter(
        Goal.type == 'ImmediateGoal',
        Goal.parent_id == practice_session_id
    ).all()


def delete_goal_recursive(session, goal_id):
    """Delete a goal and all its children recursively."""
    goal = get_goal_by_id(session, goal_id)
    if goal:
        session.delete(goal)  # Cascade will handle children
        session.commit()
        return True
    return False


def delete_practice_session(session, session_id):
    """Delete a practice session and all its immediate goals."""
    ps = get_practice_session_by_id(session, session_id)
    if ps:
        # Delete immediate goals first
        immediate_goals = get_immediate_goals_for_session(session, session_id)
        for goal in immediate_goals:
            session.delete(goal)
        # Delete practice session (junction table entries will cascade)
        session.delete(ps)
        session.commit()
        return True
    return False


def build_goal_tree(session, goal):
    """
    Recursively build complete goal tree with children.
    
    This function explicitly queries for children instead of relying on
    the relationship, which handles cross-table relationships better.
    """
    # Get the base dict without children
    goal_dict = goal.to_dict(include_children=False)
    
    # Explicitly query for children
    children = session.query(Goal).filter(Goal.parent_id == goal.id).all()
    
    # Recursively build children
    goal_dict["children"] = [build_goal_tree(session, child) for child in children]
    
    return goal_dict


def build_practice_session_tree(session, practice_session):
    """
    Build practice session dict with immediate goals as children.
    """
    ps_dict = practice_session.to_dict(include_children=False, include_parents=True, session=session)
    
    # Get immediate goals
    immediate_goals = get_immediate_goals_for_session(session, practice_session.id)
    
    # Recursively build each immediate goal's tree
    ps_dict["children"] = [build_goal_tree(session, ig) for ig in immediate_goals]
    
    return ps_dict


def get_root_id_for_goal(session, goal_id):
    """
    Traverse up the goal tree to find the root goal ID.
    
    Args:
        session: Database session
        goal_id: ID of the goal to find root for
        
    Returns:
        str: ID of the root goal, or None if not found
    """
    goal = get_goal_by_id(session, goal_id)
    if not goal:
        return None
    
    current = goal
    depth = 0
    max_depth = 20  # Safety limit to prevent infinite loops
    
    while current.parent_id and depth < max_depth:
        parent = get_goal_by_id(session, current.parent_id)
        if not parent:
            break  # Reached top or broken link
        current = parent
        depth += 1
    
    return current.id


def validate_root_goal(session, root_id):
    """
    Validate that a root_id exists and is actually a root goal (has no parent).
    
    Args:
        session: Database session
        root_id: ID to validate
        
    Returns:
        Goal: The root goal if valid, None otherwise
    """
    goal = get_goal_by_id(session, root_id)
    if goal and goal.parent_id is None:
        return goal
    return None


if __name__ == "__main__":
    # Test database creation
    engine = get_engine()
    init_db(engine)
    
    # Test creating some data
    db_session = get_session(engine)
    
    # Create a test goal
    test_goal = Goal(
        type="UltimateGoal",
        name="Test Ultimate Goal",
        description="This is a test"
    )
    db_session.add(test_goal)
    
    # Create a test practice session
    test_session = PracticeSession(
        name="Test Practice Session",
        description="Testing the database"
    )
    db_session.add(test_session)
    
    db_session.commit()
    
    print(f"Created test goal: {test_goal}")
    print(f"Created test session: {test_session}")
    
    db_session.close()
