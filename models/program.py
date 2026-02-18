from sqlalchemy import Column, String, Boolean, DateTime, Date, Integer, ForeignKey, Text, Table
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
    
    goal_ids = Column(JSON_TYPE, nullable=False) # JSON array of goal IDs
    weekly_schedule = Column(JSON_TYPE, nullable=False) # JSON object with days -> template IDs
    
    blocks = relationship("ProgramBlock", back_populates="program", cascade="all, delete-orphan")

class ProgramBlock(Base):
    __tablename__ = 'program_blocks'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_id = Column(String, ForeignKey('programs.id'), nullable=False, index=True)
    
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    color = Column(String)
    
    goal_ids = Column(JSON_TYPE, nullable=False, default=list) 
    
    program = relationship("Program", back_populates="blocks")
    days = relationship("ProgramDay", back_populates="block", cascade="all, delete-orphan", order_by="ProgramDay.day_number")

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
