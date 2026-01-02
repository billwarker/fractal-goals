
from sqlalchemy import create_engine, Column, String, Boolean, DateTime, Date, Integer, ForeignKey, Table, CheckConstraint, Float, Text
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, backref
from datetime import datetime
import uuid
import json

Base = declarative_base()

# Junction table for linking PracticeSessions to multiple ShortTermGoals
practice_session_goals = Table(
    'practice_session_goals', Base.metadata,
    Column('practice_session_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('short_term_goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True)
)

class Goal(Base):
    """
    Represents all nodes in the fractal goal tree, including Practice Sessions.
    
    Single Table Inheritance is used to distinguish types.
    """
    __tablename__ = 'goals'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    deadline = Column(DateTime, nullable=True)
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    parent_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=True)
    sort_order = Column(Integer, default=0)  # Sibling order for UI display
    
    # Practice Session specific fields (nullable for other goals)
    root_id = Column(String, nullable=True) # Useful for all goals? Or just PS?
    duration_minutes = Column(Integer, nullable=True)
    
    # Session analytics fields (promoted from JSON for query performance)
    session_start = Column(DateTime, nullable=True)  # When session actually started
    session_end = Column(DateTime, nullable=True)    # When session actually ended
    total_duration_seconds = Column(Integer, nullable=True)  # Calculated or from session_end - session_start
    template_id = Column(String, nullable=True)      # Reference to session template
    
    # Flexible data storage (renamed from session_data for semantic clarity)
    attributes = Column(Text, nullable=True)  # JSON - stores sections, exercises, notes, etc.
    session_data = Column(Text, nullable=True)  # DEPRECATED - kept for backward compatibility, use attributes
    
    # JSON Plans/Targets
    targets = Column(Text, nullable=True)
    
    __table_args__ = (
        CheckConstraint(
            type.in_([
                'UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal',
                'PracticeSession', 'ImmediateGoal', 'MicroGoal', 'NanoGoal'
            ]),
            name='valid_goal_type'
        ),
    )
    
    # SQLAlchemy Polymorphism
    __mapper_args__ = {
        'polymorphic_on': type,
        'polymorphic_identity': 'Goal'
    }

    # Tree relationship
    children = relationship(
        "Goal",
        backref=backref('parent', remote_side=[id]),
        cascade="all, delete-orphan"
    )


    def to_dict(self, include_children=True):
        """Convert goal to dictionary format compatible with frontend."""
        result = {
            "name": self.name,
            "id": self.id,
            "description": self.description,
            "deadline": self.deadline.isoformat() if self.deadline else None,
            "attributes": {
                "id": self.id,
                "type": self.type,
                "parent_id": self.parent_id,
                "root_id": self.root_id,
                "description": self.description,
                "deadline": self.deadline.isoformat() if self.deadline else None,
                "completed": self.completed,
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "updated_at": self.updated_at.isoformat() if self.updated_at else None,
                "targets": json.loads(self.targets) if self.targets else [],
            },
            "children": []
        }
        
        if include_children:
            result["children"] = [child.to_dict() for child in self.children]
            
        return result
    
    def __repr__(self):
        return f"<{self.type}(id={self.id}, name={self.name})>"

class UltimateGoal(Goal):
    __mapper_args__ = {'polymorphic_identity': 'UltimateGoal'}

class LongTermGoal(Goal):
    __mapper_args__ = {'polymorphic_identity': 'LongTermGoal'}

class MidTermGoal(Goal):
    __mapper_args__ = {'polymorphic_identity': 'MidTermGoal'}

class ShortTermGoal(Goal):
    __mapper_args__ = {'polymorphic_identity': 'ShortTermGoal'}

class ImmediateGoal(Goal):
    __mapper_args__ = {'polymorphic_identity': 'ImmediateGoal'}

class MicroGoal(Goal):
    __mapper_args__ = {'polymorphic_identity': 'MicroGoal'}

class NanoGoal(Goal):
    __mapper_args__ = {'polymorphic_identity': 'NanoGoal'}



class PracticeSession(Goal):
    """
    PracticeSession is now a node in the Goal tree.
    """
    __mapper_args__ = {
        'polymorphic_identity': 'PracticeSession',
    }
    
    # Relationship to Activity Instances (One-to-Many)
    activity_instances = relationship(
        "ActivityInstance",
        backref="practice_session",
        cascade="all, delete-orphan",
        foreign_keys="ActivityInstance.practice_session_id"
    )

    # Many-to-Many with ShortTermGoal (linked via junction)
    # This allows a session to satisfy targets for multiple goals
    parent_goals = relationship(
        "Goal",
        secondary=practice_session_goals,
        primaryjoin="PracticeSession.id==practice_session_goals.c.practice_session_id",
        secondaryjoin="Goal.id==practice_session_goals.c.short_term_goal_id",
        backref="linked_practice_sessions",
        viewonly=False # explicit
    )
    
    def to_dict(self, include_children=True):
        # Result uses basic Goal structure but adds PS fields
        result = super().to_dict(include_children)
        result["session_start"] = self.session_start.isoformat() if self.session_start else None
        result["session_end"] = self.session_end.isoformat() if self.session_end else None
        result["template_id"] = self.template_id
        result["total_duration_seconds"] = self.total_duration_seconds
        result["attributes"]["duration_minutes"] = self.duration_minutes
        
        # Add session analytics fields
        result["attributes"]["session_start"] = self.session_start.isoformat() if self.session_start else None
        result["attributes"]["session_end"] = self.session_end.isoformat() if self.session_end else None
        result["attributes"]["total_duration_seconds"] = self.total_duration_seconds
        result["attributes"]["template_id"] = self.template_id
        
        # Parse session data from attributes (new) or session_data (legacy)
        session_data_json = self.attributes or self.session_data
        if session_data_json:
             try:
                 data_obj = json.loads(session_data_json)
                 result["attributes"]["session_data"] = data_obj
                 
                 # Hydrate "exercises" from database ActivityInstances (Database-Only Architecture)
                 if "sections" in data_obj:
                     # Pre-fetch instances to a map
                     # Note: This might trigger lazy loads. For performance, ensure joinedload usage in queries.
                     instance_map = {inst.id: inst for inst in self.activity_instances}
                     print(f"DEBUG: Hydration instance_map keys: {list(instance_map.keys())}")
                     
                     for section in data_obj["sections"]:
                         # Only hydrate if this is a migrated session (has activity_ids)
                         # Otherwise preserve legacy 'exercises' data for display
                         if "activity_ids" in section:
                             activity_ids = section["activity_ids"]
                             exercises = []
                             for inst_id in activity_ids:
                                 if inst_id in instance_map:
                                     inst = instance_map[inst_id]
                                     # Convert to dict and add compatibility fields for frontend
                                     ex = inst.to_dict()
                                     ex['type'] = 'activity'
                                     ex['instance_id'] = inst.id  # Frontend looks for instance_id
                                     ex['name'] = ex.get('definition_name', 'Unknown Activity')
                                     ex['activity_id'] = inst.activity_definition_id
                                 
                                     # Set has_sets flag so frontend knows how to render
                                     ex['has_sets'] = len(ex.get('sets', [])) > 0
                                 
                                     # Map metric_values to metrics for frontend list compatibility
                                     ex['metrics'] = ex['metric_values']
                                     exercises.append(ex)
                             section["exercises"] = exercises
             except:
                 pass
        
        # Parent IDs (Combine primary parent_id and any secondary parents)
        # Note: In new creation logic, parent_id should be in parent_goals list too.
        # So we just can use parent_goals if populated.
        p_ids = [g.id for g in self.parent_goals]
        if self.parent_id and self.parent_id not in p_ids:
             p_ids.append(self.parent_id)
        
        result["attributes"]["parent_ids"] = p_ids
        
        return result



class ActivityGroup(Base):
    __tablename__ = 'activity_groups'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    created_at = Column(DateTime, default=datetime.now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)  # Audit trail
    sort_order = Column(Integer, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "root_id": self.root_id,
            "name": self.name,
            "description": self.description,
            "sort_order": self.sort_order,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class ActivityDefinition(Base):
    __tablename__ = 'activity_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    created_at = Column(DateTime, default=datetime.now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)  # Audit trail
    has_sets = Column(Boolean, default=False)
    has_metrics = Column(Boolean, default=True)
    metrics_multiplicative = Column(Boolean, default=False)  # When true, allows metric1 × metric2 × ... derived value
    has_splits = Column(Boolean, default=False)  # When true, activity can be split into multiple portions (e.g., left/right)
    group_id = Column(String, ForeignKey('activity_groups.id'), nullable=True)

    group = relationship("ActivityGroup", backref="activities")

    metric_definitions = relationship("MetricDefinition", backref="activity_definition", cascade="all, delete-orphan")
    split_definitions = relationship("SplitDefinition", backref="activity_definition", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "group_id": self.group_id,
            "has_sets": self.has_sets,
            "has_metrics": self.has_metrics,
            "metrics_multiplicative": self.metrics_multiplicative,
            "has_splits": self.has_splits,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "metric_definitions": [m.to_dict() for m in self.metric_definitions],
            "split_definitions": [s.to_dict() for s in self.split_definitions]
        }

class MetricDefinition(Base):
    __tablename__ = 'metric_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)  # Performance: direct fractal scoping
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)  # Audit trail
    is_active = Column(Boolean, default=True)
    is_top_set_metric = Column(Boolean, default=False)  # Determines which metric defines "top set"
    is_multiplicative = Column(Boolean, default=True)   # Include in product calculations
    sort_order = Column(Integer, default=0)  # UI display order

    def to_dict(self):
        return {
            "id": self.id, 
            "name": self.name, 
            "unit": self.unit, 
            "is_active": self.is_active,
            "is_top_set_metric": self.is_top_set_metric,
            "is_multiplicative": self.is_multiplicative
        }

class SplitDefinition(Base):
    __tablename__ = 'split_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)  # Performance: direct fractal scoping
    name = Column(String, nullable=False)  # e.g., "Left", "Right", "Split #1"
    order = Column(Integer, nullable=False)  # Display order
    created_at = Column(DateTime, default=datetime.now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)  # Audit trail

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "order": self.order
        }

class ActivityInstance(Base):
    __tablename__ = 'activity_instances'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # practice_session_id points to goals.id because PracticeSession is a Goal
    practice_session_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False)
    activity_definition_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)  # Performance: direct fractal scoping
    created_at = Column(DateTime, default=datetime.now)
    time_start = Column(DateTime, nullable=True)
    time_stop = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)  # Audit trail
    sort_order = Column(Integer, default=0)  # UI display order within session

    metric_values = relationship("MetricValue", backref="activity_instance", cascade="all, delete-orphan")
    definition = relationship("ActivityDefinition")

    # Additional fields for state persistence
    completed = Column(Boolean, default=False)
    notes = Column(String, nullable=True)
    data = Column(String, nullable=True)  # JSON store for sets and other extended attributes

    def to_dict(self):
        data_dict = json.loads(self.data) if self.data else {}
        return {
            "id": self.id,
            "practice_session_id": self.practice_session_id,
            "activity_definition_id": self.activity_definition_id,
            "definition_name": self.definition.name if self.definition else "Unknown",
            "created_at": self.created_at.isoformat(timespec='seconds') + 'Z' if self.created_at else None,
            "time_start": self.time_start.isoformat(timespec='seconds') + 'Z' if self.time_start else None,
            "time_stop": self.time_stop.isoformat(timespec='seconds') + 'Z' if self.time_stop else None,
            "duration_seconds": self.duration_seconds,
            "completed": self.completed,
            "notes": self.notes,
            "sets": data_dict.get('sets', []),
            "data": data_dict,
            "metric_values": [m.to_dict() for m in self.metric_values]
        }

class MetricValue(Base):
    __tablename__ = 'metric_values'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='CASCADE'), nullable=False)
    metric_definition_id = Column(String, ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=False)
    split_definition_id = Column(String, ForeignKey('split_definitions.id', ondelete='RESTRICT'), nullable=True)  # Nullable for non-split activities
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)  # Performance: direct fractal scoping
    value = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.now)  # Audit trail
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)  # Audit trail

    definition = relationship("MetricDefinition")
    split = relationship("SplitDefinition")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.definition.name if self.definition else "",
            "metric_definition_id": self.metric_definition_id,
            "metric_id": self.metric_definition_id, # Frontend alias
            "value": self.value,
            "unit": self.definition.unit if self.definition else "",
            "split_id": self.split_definition_id,
            "split_name": self.split.name if self.split else None
        }

class SessionTemplate(Base):
    __tablename__ = 'session_templates'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, default='')
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)  # Audit trail
    template_data = Column(String, nullable=False)
    
    def to_dict(self):
        return {"id": self.id, "name": self.name, "template_data": json.loads(self.template_data) if self.template_data else {}}


class Program(Base):
    __tablename__ = 'programs'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    is_active = Column(Boolean, default=True)
    
    # JSON fields (Legacy/Deprecated in favor of relational structure)
    goal_ids = Column(Text, nullable=False)  # JSON array of goal IDs
    weekly_schedule = Column(Text, nullable=False)  # JSON object with days -> template IDs
    
    # Relationships
    blocks = relationship("ProgramBlock", back_populates="program", cascade="all, delete-orphan")
    
    def to_dict(self):
        return {
            "id": self.id,
            "root_id": self.root_id,
            "name": self.name,
            "description": self.description,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "is_active": self.is_active,
            "goal_ids": json.loads(self.goal_ids) if self.goal_ids else [],
            "weekly_schedule": json.loads(self.weekly_schedule) if self.weekly_schedule else {},
            # Include blocks summary if needed, but usually fetched via separate endpoint or expansive query
            "blocks": [b.to_dict() for b in self.blocks]
        }

class ProgramBlock(Base):
    __tablename__ = 'program_blocks'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_id = Column(String, ForeignKey('programs.id'), nullable=False)
    
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=True) # Nullable for abstract blocks
    end_date = Column(Date, nullable=True)   # Nullable for abstract blocks
    color = Column(String)
    
    # JSON List of Goal IDs specific to this block
    goal_ids = Column(Text) 
    
    program = relationship("Program", back_populates="blocks")
    days = relationship("ProgramDay", back_populates="block", cascade="all, delete-orphan", order_by="ProgramDay.day_number")

    def to_dict(self):
        return {
            "id": self.id,
            "program_id": self.program_id,
            "name": self.name,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "color": self.color,
            "goal_ids": json.loads(self.goal_ids) if self.goal_ids else [],
            # Include nested days for UI
            "days": [d.to_dict() for d in self.days]
        }

class ProgramDay(Base):
    __tablename__ = 'program_days'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    block_id = Column(String, ForeignKey('program_blocks.id'), nullable=False)
    
    date = Column(Date, nullable=True) # Abstract days don't have concrete dates
    day_number = Column(Integer, nullable=True) # Order within block (1, 2, 3...)
    name = Column(String) # Optional
    notes = Column(Text)
    
    block = relationship("ProgramBlock", back_populates="days")
    sessions = relationship("ScheduledSession", back_populates="day", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "block_id": self.block_id,
            "date": self.date.isoformat() if self.date else None,
            "day_number": self.day_number,
            "name": self.name,
            "notes": self.notes,
            # Include sessions
            "sessions": [s.to_dict() for s in self.sessions]
        }

class ScheduledSession(Base):
    __tablename__ = 'scheduled_sessions'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    day_id = Column(String, ForeignKey('program_days.id'), nullable=False)
    
    session_template_id = Column(String, ForeignKey('session_templates.id'), nullable=True)
    
    is_completed = Column(Boolean, default=False)
    completion_data = Column(Text) # JSON
    
    day = relationship("ProgramDay", back_populates="sessions")
    template = relationship("SessionTemplate")

    def to_dict(self):
        return {
            "id": self.id,
            "day_id": self.day_id,
            "session_template_id": self.session_template_id,
            "is_completed": self.is_completed,
            "completion_data": json.loads(self.completion_data) if self.completion_data else {},
            "template_name": self.template.name if self.template else None
        }


# Database Helper Functions
def get_engine(db_path=None):
    """Get SQLAlchemy engine with environment-based database path."""
    if db_path is None:
        # Import here to avoid circular dependency
        from config import config
        db_path = f"sqlite:///{config.get_db_path()}"
    return create_engine(db_path, echo=False)

def init_db(engine):
    Base.metadata.create_all(engine)

def get_session(engine):
    Session = sessionmaker(bind=engine)
    return Session()

def get_all_root_goals(session):
    return session.query(Goal).filter(
        Goal.parent_id == None,
        Goal.type != 'PracticeSession'
    ).all()

def get_goal_by_id(session, goal_id):
    return session.query(Goal).filter(Goal.id == goal_id).first()

def get_practice_session_by_id(session, session_id):
    # This now queries the goals table where type='PracticeSession'
    return session.query(PracticeSession).filter(PracticeSession.id == session_id).first()

def get_all_practice_sessions(session):
    return session.query(PracticeSession).all()

def get_immediate_goals_for_session(session, practice_session_id):
    # Immediate goals are now just children of the session (which is a Goal)
    # But since ImmediateGoal is a Goal, simple query works.
    return session.query(Goal).filter(
        Goal.type == 'ImmediateGoal',
        Goal.parent_id == practice_session_id
    ).all()

def delete_goal_recursive(session, goal_id):
    goal = get_goal_by_id(session, goal_id)
    if goal:
        session.delete(goal)
        session.commit()
        return True
    return False

def delete_practice_session(session, session_id):
    return delete_goal_recursive(session, session_id)

def build_goal_tree(session, goal):
    # Goal.to_dict(include_children=True) uses the relationship, which is efficient/lazy loaded.
    # But recursively, valid.
    # IMPORTANT: The old logic manually queried children. SQLAlchemy 'children' relationship does that for us.
    # However, to be safe and consistent with recursive formatting:
    return goal.to_dict(include_children=True)

def build_practice_session_tree(session, practice_session):
    # Same as goal tree now!
    return build_goal_tree(session, practice_session)

# Common 'root_id' finder
def get_root_id_for_goal(session, goal_id):
    goal = get_goal_by_id(session, goal_id)
    if not goal: return None
    curr = goal
    count = 0
    while curr.parent and count < 20: # Use relationship 'parent'
        curr = curr.parent
        count += 1
    return curr.id

def validate_root_goal(session, root_id):
    """
    Validate that a root_id exists and is actually a root goal (has no parent).
    """
    goal = get_goal_by_id(session, root_id)
    if goal and goal.parent_id is None:
        return goal
    return None
