from sqlalchemy import Column, String, Boolean, DateTime, Date, Integer, Float, ForeignKey, Text, Table
from sqlalchemy.orm import relationship
import uuid
from .base import Base, utc_now, JSON_TYPE

# Junction table for linking ProgramDays to multiple SessionTemplates
program_day_templates = Table(
    'program_day_templates', Base.metadata,
    Column('program_day_id', String, ForeignKey('program_days.id', ondelete='CASCADE'), primary_key=True),
    Column('session_template_id', String, ForeignKey('session_templates.id', ondelete='CASCADE'), primary_key=True),
    Column('order', Integer, default=0)
)

# Junction table for linking Programs to Goals
program_goals = Table(
    'program_goals', Base.metadata,
    Column('program_id', String, ForeignKey('programs.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now)
)

# Junction table for linking ProgramBlocks to Goals
program_block_goals = Table(
    'program_block_goals', Base.metadata,
    Column('program_block_id', String, ForeignKey('program_blocks.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now)
)

class Program(Base):
    __tablename__ = 'programs'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    is_active = Column(Boolean, default=True)
    is_completed = Column(Boolean, default=False)
    
    # Progress tracking
    goals_completed = Column(Integer, default=0)
    goals_total = Column(Integer, default=0)
    completion_percentage = Column(Float, nullable=True)
    
    weekly_schedule = Column(JSON_TYPE, nullable=False) # JSON object with days -> template IDs
    
    blocks = relationship("ProgramBlock", back_populates="program", cascade="all, delete-orphan")
    goals = relationship(
        "Goal",
        secondary=program_goals,
        backref="programs",
        viewonly=True
    )

class ProgramBlock(Base):
    __tablename__ = 'program_blocks'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_id = Column(String, ForeignKey('programs.id'), nullable=False, index=True)
    
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    color = Column(String)
    is_completed = Column(Boolean, default=False)
    
    program = relationship("Program", back_populates="blocks")
    days = relationship("ProgramDay", back_populates="block", cascade="all, delete-orphan", order_by="ProgramDay.day_number")
    goals = relationship(
        "Goal",
        secondary=program_block_goals,
        backref="program_blocks",
        viewonly=True
    )

class ProgramDay(Base):
    __tablename__ = 'program_days'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    block_id = Column(String, ForeignKey('program_blocks.id'), nullable=False, index=True)
    
    date = Column(Date, nullable=True)
    day_number = Column(Integer, nullable=True)
    name = Column(String)
    notes = Column(Text)
    is_completed = Column(Boolean, default=False)
    
    day_of_week = Column(JSON_TYPE)
    
    block = relationship("ProgramBlock", back_populates="days")
    templates = relationship("SessionTemplate", secondary=program_day_templates, order_by="program_day_templates.c.order")
    completed_sessions = relationship("Session", back_populates="program_day")
    
    goals = relationship(
        "Goal",
        secondary="program_day_goals",
        backref="program_days",
        viewonly=True
    )

    def check_completion(self):
        """Check if all templates have been completed"""
        if not self.templates:
            return False
        completed_template_ids = {s.template_id for s in self.completed_sessions if s.template_id and not s.deleted_at}
        required_template_ids = {t.id for t in self.templates if not t.deleted_at}
        return required_template_ids.issubset(completed_template_ids)

class ProgramDaySession(Base):
    """
    Explicit state tracker bridging a ProgramDay's required Session Template to an executed Session.
    """
    __tablename__ = 'program_day_sessions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_day_id = Column(String, ForeignKey('program_days.id', ondelete='CASCADE'), nullable=False, index=True)
    session_template_id = Column(String, ForeignKey('session_templates.id', ondelete='SET NULL'), nullable=True, index=True)
    session_id = Column(String, ForeignKey('sessions.id', ondelete='SET NULL'), nullable=True, index=True)
    
    execution_status = Column(String, default='completed') # completed, skipped, substituted
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    program_day = relationship("ProgramDay", backref="day_sessions")
    template = relationship("SessionTemplate")
    session = relationship("Session")
