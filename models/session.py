import sqlalchemy as sa
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import relationship
import uuid
from .base import Base, utc_now, JSON_TYPE

class Session(Base):
    """
    Represents a practice/work session.
    """
    __tablename__ = 'sessions'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    
    session_start = Column(DateTime, nullable=True)
    session_end = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    total_duration_seconds = Column(Integer, nullable=True)
    
    is_paused = Column(Boolean, default=False)
    last_paused_at = Column(DateTime, nullable=True)
    total_paused_seconds = Column(Integer, default=0)
    
    __table_args__ = (
        sa.Index('ix_sessions_root_deleted_completed', 'root_id', 'deleted_at', 'completed'),
    )
    
    template_id = Column(String, ForeignKey('session_templates.id'), nullable=True, index=True)
    program_day_id = Column(String, ForeignKey('program_days.id'), nullable=True, index=True)
    
    attributes = Column(JSON_TYPE, nullable=True)
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    activity_instances = relationship(
        "ActivityInstance",
        backref="session",
        cascade="all, delete-orphan",
        foreign_keys="ActivityInstance.session_id"
    )
    
    goals = relationship(
        "Goal",
        secondary="session_goals",
        back_populates="sessions",
        viewonly=True
    )
    
    program_day = relationship("ProgramDay", back_populates="completed_sessions")
    template = relationship("SessionTemplate")

def get_session_by_id(db_session, session_id):
    """Get a session by its ID."""
    return db_session.query(Session).filter(Session.id == session_id, Session.deleted_at == None).first()

def get_all_sessions(db_session):
    """Get all sessions."""
    return db_session.query(Session).filter(Session.deleted_at == None).all()

def get_sessions_for_root(db_session, root_id):
    """Get all sessions for a specific fractal (root goal)."""
    return db_session.query(Session).filter(Session.root_id == root_id, Session.deleted_at == None).all()

def get_immediate_goals_for_session(db_session, session_id):
    """Get ImmediateGoals associated with a session via the junction table."""
    from sqlalchemy import select
    from .goal import Goal, GoalLevel, session_goals
    stmt = select(Goal).join(session_goals).where(
        session_goals.c.session_id == session_id,
        Goal.level_id == GoalLevel.id,
        GoalLevel.name == 'Immediate Goal'
    )
    return db_session.execute(stmt).scalars().all()

def delete_session(db_session, session_id):
    """Delete a session."""
    session = get_session_by_id(db_session, session_id)
    if session:
        from .base import utc_now
        session.deleted_at = utc_now()
        db_session.commit()
        return True
    return False


class SessionTemplate(Base):
    __tablename__ = 'session_templates'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, default='')
    root_id = Column(String, ForeignKey('goals.id'), nullable=False, index=True)
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    template_data = Column(JSON_TYPE, nullable=False)
    
    goals = relationship(
        "Goal",
        secondary="session_template_goals",
        backref="session_templates",
        viewonly=True
    )
