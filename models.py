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
    """
    __tablename__ = 'practice_sessions'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, default='')
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    
    # Future extensibility fields (commented out for now, uncomment as needed)
    # duration = Column(Integer)  # Session duration in minutes
    # focus_score = Column(Integer)  # User's focus rating (1-10)
    # energy_level = Column(Integer)  # Energy level during session (1-10)
    # session_notes = Column(String)  # Detailed notes about the session
    # tags = Column(String)  # Comma-separated tags
    # location = Column(String)  # Where the session took place
    # tools_used = Column(String)  # Tools/resources used
    # interruptions = Column(Integer)  # Number of interruptions
    # actual_start_time = Column(DateTime)  # When session actually started
    # actual_end_time = Column(DateTime)  # When session actually ended
    # planned_duration = Column(Integer)  # How long it was supposed to take
    # productivity_rating = Column(Integer)  # Self-assessed productivity (1-10)
    
    # Many-to-many relationship with short-term goals
    parent_goals = relationship(
        "Goal",
        secondary=practice_session_goals,
        backref="linked_practice_sessions"
    )
    
    def to_dict(self, include_children=True, include_parents=True):
        """Convert practice session to dictionary format compatible with frontend."""
        result = {
            "name": self.name,
            "id": self.id,
            "attributes": {
                "id": self.id,
                "type": "PracticeSession",
                "description": self.description,
                "completed": self.completed,
                "created_at": self.created_at.isoformat() if self.created_at else None,
            },
            "children": []
        }
        
        # Add parent_ids for frontend
        if include_parents:
            result["attributes"]["parent_ids"] = [goal.id for goal in self.parent_goals]
        
        # Note: Children (ImmediateGoals) need to be queried separately
        # since they're in the goals table with parent_id pointing here
        
        return result
    
    def __repr__(self):
        return f"<PracticeSession(id={self.id}, name={self.name}, parents={len(self.parent_goals)})>"


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
    ps_dict = practice_session.to_dict(include_children=False, include_parents=True)
    
    # Get immediate goals
    immediate_goals = get_immediate_goals_for_session(session, practice_session.id)
    
    # Recursively build each immediate goal's tree
    ps_dict["children"] = [build_goal_tree(session, ig) for ig in immediate_goals]
    
    return ps_dict


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
