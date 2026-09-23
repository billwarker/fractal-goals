from sqlalchemy import Column, String, Boolean, DateTime, Date, Integer, Float, ForeignKey, Text, Table, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import relationship
import uuid
from .base import Base, utc_now, JSON_TYPE

# Junction table for linking ProgramDays to multiple SessionTemplates
program_day_templates = Table(
    'program_day_templates', Base.metadata,
    Column('program_day_id', String, ForeignKey('program_days.id', ondelete='CASCADE'), primary_key=True),
    Column('session_template_id', String, ForeignKey('session_templates.id', ondelete='CASCADE'), primary_key=True),
    Column('order', Integer, default=0),
    Column('is_required', Boolean, nullable=False, default=True)
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
    color = Column(String, nullable=True)
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
    row_version = Column(Integer, nullable=False, default=1, server_default='1')
    __mapper_args__ = {'version_id_col': row_version}
    
    blocks = relationship("ProgramBlock", back_populates="program", cascade="all, delete-orphan")
    day_status_overrides = relationship(
        "ProgramDayStatusOverride",
        back_populates="program",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
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
    row_version = Column(Integer, nullable=False, default=1, server_default='1')
    __mapper_args__ = {'version_id_col': row_version}
    
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
    completion_min_templates = Column(Integer, nullable=True)
    row_version = Column(Integer, nullable=False, default=1, server_default='1')
    __mapper_args__ = {'version_id_col': row_version}

    block = relationship("ProgramBlock", back_populates="days")
    template_links = relationship(
        "ProgramDayTemplate",
        back_populates="program_day",
        cascade="all, delete-orphan",
        order_by=program_day_templates.c.order,
        overlaps="templates"
    )
    templates = relationship(
        "SessionTemplate",
        secondary=program_day_templates,
        order_by="program_day_templates.c.order",
        overlaps="program_day,template,template_links"
    )
    completed_sessions = relationship("Session", back_populates="program_day")
    
    goals = relationship(
        "Goal",
        secondary="program_day_goals",
        secondaryjoin="and_(Goal.id == program_day_goals.c.goal_id, program_day_goals.c.deleted_at == None)",
        backref="program_days",
        viewonly=True
    )

class ProgramDayTemplate(Base):
    __table__ = program_day_templates

    program_day = relationship(
        "ProgramDay",
        back_populates="template_links",
        overlaps="templates"
    )
    template = relationship(
        "SessionTemplate",
        overlaps="program_day,templates,template_links"
    )

class ProgramDaySession(Base):
    """Historical ledger retained for analytics compatibility, never day-status authority."""
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


class ProgramDayStatusOverride(Base):
    """A user's explicit status for one program calendar date."""

    __tablename__ = 'program_day_status_overrides'
    __table_args__ = (
        UniqueConstraint('program_id', 'date', name='uq_program_day_status_override_program_date'),
        CheckConstraint("status IN ('complete', 'rest')", name='ck_program_day_status_override_status'),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_id = Column(
        String,
        ForeignKey('programs.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    date = Column(Date, nullable=False, index=True)
    status = Column(String, nullable=False)
    set_by_user_id = Column(
        String,
        ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)

    program = relationship('Program', back_populates='day_status_overrides')


def get_program_day_template_rules(day):
    links = list(getattr(day, 'template_links', None) or [])
    if links:
        links.sort(key=lambda link: link.order or 0)
        return [
            {
                'template': link.template,
                'template_id': link.session_template_id,
                'is_required': bool(link.is_required),
                'order': link.order or 0,
            }
            for link in links
            if link.template is not None and not getattr(link.template, 'deleted_at', None)
        ]

    return [
        {
            'template': template,
            'template_id': template.id,
            'is_required': True,
            'order': index,
        }
        for index, template in enumerate(getattr(day, 'templates', None) or [])
        if template is not None and not getattr(template, 'deleted_at', None)
    ]
