
from sqlalchemy import create_engine, Column, String, Boolean, DateTime, Date, Integer, ForeignKey, Table, CheckConstraint, Float, Text
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, backref
from datetime import datetime, timezone
import uuid
import json

def utc_now():
    return datetime.now(timezone.utc)

def format_utc(dt):
    """Format a datetime object to UTC ISO string with 'Z' suffix."""
    if not dt: return None
    # If naive, assume UTC and append Z
    if dt.tzinfo is None:
        return dt.isoformat(timespec='seconds') + 'Z'
    # If aware, ensure UTC and use Z suffix
    return dt.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

Base = declarative_base()

# Junction table for linking Sessions to multiple Goals (ShortTerm and Immediate)
session_goals = Table(
    'session_goals', Base.metadata,
    Column('session_id', String, ForeignKey('sessions.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_type', String, nullable=False),  # 'short_term' or 'immediate'
    Column('created_at', DateTime, default=utc_now)

)

# Junction table for linking ProgramDays to multiple SessionTemplates (many-to-many)
program_day_templates = Table(
    'program_day_templates', Base.metadata,
    Column('program_day_id', String, ForeignKey('program_days.id', ondelete='CASCADE'), primary_key=True),
    Column('session_template_id', String, ForeignKey('session_templates.id', ondelete='CASCADE'), primary_key=True),
    Column('order', Integer, default=0)  # For ordering templates within a day
)

# Junction table for linking Activities to Goals (for SMART "Achievable" criterion)
activity_goal_associations = Table(
    'activity_goal_associations', Base.metadata,
    Column('activity_id', String, ForeignKey('activity_definitions.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now)
)

# Junction table for linking Activity GROUPS to Goals
# When a group is linked, ALL activities in that group (including future ones) are considered associated
goal_activity_group_associations = Table(
    'goal_activity_group_associations', Base.metadata,
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('activity_group_id', String, ForeignKey('activity_groups.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now)
)

class Goal(Base):
    """
    Represents all nodes in the fractal goal tree.
    
    Sessions are NO LONGER part of the goal hierarchy.
    Hierarchy: UltimateGoal → LongTermGoal → MidTermGoal → ShortTermGoal → ImmediateGoal → MicroGoal → NanoGoal
    
    Single Table Inheritance is used to distinguish types.
    """
    __tablename__ = 'goals'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    deadline = Column(DateTime, nullable=True)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)  # When goal was marked complete
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    parent_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=True)
    sort_order = Column(Integer, default=0)  # Sibling order for UI display
    
    # Root goal reference (for performance queries)
    root_id = Column(String, nullable=True)
    
    # SMART goal fields
    relevance_statement = Column(Text, nullable=True)  # "How does this goal help achieve [parent]?"
    is_smart = Column(Boolean, default=False)  # Computed flag, updated on save
    completed_via_children = Column(Boolean, default=False)  # If true, completion is derived from children
    allow_manual_completion = Column(Boolean, default=True)
    track_activities = Column(Boolean, default=True)

    # JSON Plans/Targets
    targets = Column(Text, nullable=True)
    
    __table_args__ = (
        CheckConstraint(
            type.in_([
                'UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal',
                'ImmediateGoal', 'MicroGoal', 'NanoGoal'
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

    # Sessions associated with this goal (via junction table)
    sessions = relationship(
        "Session",
        secondary=session_goals,
        back_populates="goals",
        viewonly=True
    )
    
    # Activities associated with this goal (for SMART "Achievable" criterion)
    associated_activities = relationship(
        "ActivityDefinition",
        secondary=activity_goal_associations,
        back_populates="associated_goals",
        viewonly=True
    )
    
    # Activity Groups associated with this goal (includes ALL activities in group, including future ones)
    associated_activity_groups = relationship(
        "ActivityGroup",
        secondary=goal_activity_group_associations,
        back_populates="associated_goals",
        viewonly=True
    )

    def calculate_smart_status(self):
        """Calculate SMART criteria status for this goal."""
        targets = json.loads(self.targets) if self.targets else []
        
        # Achievable: has associated activities OR has associated activity groups OR completed via children
        # If track_activities is False, we consider it achievable by default (user's responsibility)
        if self.track_activities:
            has_activities = len(self.associated_activities) > 0 if self.associated_activities else False
            has_groups = len(self.associated_activity_groups) > 0 if self.associated_activity_groups else False
            is_achievable = has_activities or has_groups or self.completed_via_children
            is_measurable = len(targets) > 0 or self.completed_via_children
        else:
            is_achievable = True
            is_measurable = True
        
        return {
            "specific": bool(self.description and self.description.strip()),
            "measurable": is_measurable,
            "achievable": is_achievable,
            "relevant": bool(self.relevance_statement and self.relevance_statement.strip()),
            "time_bound": self.deadline is not None
        }
    
    def is_smart_goal(self):
        """Check if this goal meets all SMART criteria."""
        status = self.calculate_smart_status()
        return all(status.values())
    
    def to_dict(self, include_children=True):
        """Convert goal to dictionary format compatible with frontend."""
        smart_status = self.calculate_smart_status()
        
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
                "completed_at": format_utc(self.completed_at),
                "created_at": format_utc(self.created_at),
                "updated_at": format_utc(self.updated_at),
                "targets": json.loads(self.targets) if self.targets else [],
                "relevance_statement": self.relevance_statement,
                "completed_via_children": self.completed_via_children,
                "allow_manual_completion": self.allow_manual_completion,
                "track_activities": self.track_activities,
                "is_smart": all(smart_status.values()),
                "smart_status": smart_status,
                "associated_activity_ids": [a.id for a in self.associated_activities] if self.associated_activities else [],
                "associated_activity_group_ids": [g.id for g in self.associated_activity_groups] if self.associated_activity_groups else [],
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


class Session(Base):
    """
    Represents a practice/work session.
    
    Sessions are now SEPARATE from the goal hierarchy.
    They can be associated with ShortTermGoals and ImmediateGoals via the session_goals junction table.
    """
    __tablename__ = 'sessions'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    
    # Session timing
    session_start = Column(DateTime, nullable=True)
    session_end = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    total_duration_seconds = Column(Integer, nullable=True)
    
    # Template/Program references
    template_id = Column(String, ForeignKey('session_templates.id'), nullable=True)
    program_day_id = Column(String, ForeignKey('program_days.id'), nullable=True)
    
    # Flexible data storage (sections, exercises, notes, etc.)
    attributes = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    
    # Completion
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
        secondary=session_goals,
        back_populates="sessions",
        viewonly=True
    )
    
    program_day = relationship("ProgramDay", back_populates="completed_sessions")
    template = relationship("SessionTemplate")
    
    def get_short_term_goals(self, db_session):
        """Get all ShortTermGoals associated with this session."""
        from sqlalchemy import select
        stmt = select(Goal).join(session_goals).where(
            session_goals.c.session_id == self.id,
            session_goals.c.goal_type == 'short_term'
        )
        return db_session.execute(stmt).scalars().all()
    
    def get_immediate_goals(self, db_session):
        """Get all ImmediateGoals associated with this session."""
        from sqlalchemy import select
        stmt = select(Goal).join(session_goals).where(
            session_goals.c.session_id == self.id,
            session_goals.c.goal_type == 'immediate'
        )
        return db_session.execute(stmt).scalars().all()
    
    def get_program_info(self):
        """Get full program context for this session."""
        if not self.program_day:
            return None
        
        day = self.program_day
        block = day.block
        program = block.program
        
        return {
            "program_id": program.id,
            "program_name": program.name,
            "block_id": block.id,
            "block_name": block.name,
            "block_color": block.color,
            "day_id": day.id,
            "day_name": day.name,
            "day_number": day.day_number,
            "day_date": day.date.isoformat() if day.date else None
        }
    
    def to_dict(self):
        """Convert session to dictionary format compatible with frontend."""
        


        result = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "root_id": self.root_id,
            "session_start": format_utc(self.session_start),
            "session_end": format_utc(self.session_end),
            "duration_minutes": self.duration_minutes,
            "total_duration_seconds": self.total_duration_seconds,
            "template_id": self.template_id,
            "program_day_id": self.program_day_id,
            "completed": self.completed,
            "completed_at": format_utc(self.completed_at),
            "created_at": format_utc(self.created_at),
            "updated_at": format_utc(self.updated_at),
            "attributes": {
                "id": self.id,
                "type": "Session",  # For frontend compatibility
                "session_start": format_utc(self.session_start),
                "session_end": format_utc(self.session_end),
                "duration_minutes": self.duration_minutes,
                "total_duration_seconds": self.total_duration_seconds,
                "template_id": self.template_id,
                "completed": self.completed,
                "completed_at": format_utc(self.completed_at),
                "created_at": format_utc(self.created_at),
                "updated_at": format_utc(self.updated_at),
            }
        }
        
        # Parse session data from attributes
        if self.attributes:
            try:
                data_obj = json.loads(self.attributes)
                result["attributes"]["session_data"] = data_obj
                
                # Hydrate "exercises" from database ActivityInstances
                if "sections" in data_obj:
                    instance_map = {inst.id: inst for inst in self.activity_instances}
                    
                    for section in data_obj["sections"]:
                        if "activity_ids" in section:
                            activity_ids = section["activity_ids"]
                            exercises = []
                            for inst_id in activity_ids:
                                if inst_id in instance_map:
                                    inst = instance_map[inst_id]
                                    ex = inst.to_dict()
                                    ex['type'] = 'activity'
                                    ex['instance_id'] = inst.id
                                    ex['name'] = ex.get('definition_name', 'Unknown Activity')
                                    ex['activity_id'] = inst.activity_definition_id
                                    ex['has_sets'] = len(ex.get('sets', [])) > 0
                                    ex['metrics'] = ex['metric_values']
                                    exercises.append(ex)
                            section["exercises"] = exercises
            except:
                pass
        
        # Get associated goals with type information
        short_term_goals = []
        immediate_goals = []
        
        for goal in self.goals:
            goal_data = {
                "id": goal.id,
                "name": goal.name,
                "type": goal.type,
                "parent_id": goal.parent_id,
                "description": goal.description,
                "completed": goal.completed
            }
            
            if goal.type == 'ShortTermGoal':
                short_term_goals.append(goal_data)
            elif goal.type == 'ImmediateGoal':
                immediate_goals.append(goal_data)
        
        # Legacy: maintain goal_ids for backward compatibility
        result["attributes"]["goal_ids"] = [g.id for g in self.goals]
        result["attributes"]["parent_ids"] = [g.id for g in self.goals if g.type == 'ShortTermGoal']
        
        # New: separate goal data by type for enhanced display
        result["short_term_goals"] = short_term_goals
        result["immediate_goals"] = immediate_goals
        
        # Add program info if linked to program day
        program_info = self.get_program_info()
        if program_info:
            result["program_info"] = program_info
        
        # Collect all notes for this session
        all_notes = {}
        
        # 1. Notes directly linked to session via session_id
        if hasattr(self, 'notes_list') and self.notes_list:
            for n in self.notes_list:
                if n.deleted_at is None:
                    all_notes[n.id] = n

        # 2. Notes linked via activity instances (in case session_id wasn't set on them)
        if hasattr(self, 'activity_instances'):
            for ai in self.activity_instances:
                if hasattr(ai, 'notes_list') and ai.notes_list:
                    for n in ai.notes_list:
                        if n.deleted_at is None:
                            all_notes[n.id] = n
        
        # Convert to dict list
        notes_data = [n.to_dict() for n in all_notes.values()]
        
        # Sort by creation time (descending)
        notes_data.sort(key=lambda x: x['created_at'], reverse=True)
        
        result["notes"] = notes_data
        result["notes_count"] = len(notes_data)
        
        return result


class ActivityGroup(Base):
    __tablename__ = 'activity_groups'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)  # Audit trail
    sort_order = Column(Integer, default=0)
    
    # Goals that have "include entire group" enabled for this group
    associated_goals = relationship(
        "Goal",
        secondary=goal_activity_group_associations,
        back_populates="associated_activity_groups",
        viewonly=True
    )

    def to_dict(self):
        return {
            "id": self.id,
            "root_id": self.root_id,
            "name": self.name,
            "description": self.description,
            "sort_order": self.sort_order,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "associated_goal_ids": [g.id for g in self.associated_goals] if self.associated_goals else []
        }


class ActivityDefinition(Base):
    __tablename__ = 'activity_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)  # Audit trail
    has_sets = Column(Boolean, default=False)
    has_metrics = Column(Boolean, default=True)
    metrics_multiplicative = Column(Boolean, default=False)  # When true, allows metric1 × metric2 × ... derived value
    has_splits = Column(Boolean, default=False)  # When true, activity can be split into multiple portions (e.g., left/right)
    group_id = Column(String, ForeignKey('activity_groups.id'), nullable=True)

    group = relationship("ActivityGroup", backref="activities")

    metric_definitions = relationship("MetricDefinition", backref="activity_definition", cascade="all, delete-orphan")
    split_definitions = relationship("SplitDefinition", backref="activity_definition", cascade="all, delete-orphan")
    
    # Goals associated with this activity (for SMART "Achievable" criterion)
    associated_goals = relationship(
        "Goal",
        secondary=activity_goal_associations,
        back_populates="associated_activities",
        viewonly=True
    )

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
            "split_definitions": [s.to_dict() for s in self.split_definitions],
            "associated_goal_ids": [g.id for g in self.associated_goals] if self.associated_goals else []
        }

class MetricDefinition(Base):
    __tablename__ = 'metric_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)  # Performance: direct fractal scoping
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)  # Audit trail
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
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)  # Audit trail

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "order": self.order
        }

class ActivityInstance(Base):
    __tablename__ = 'activity_instances'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # New session_id column pointing to sessions table
    session_id = Column(String, ForeignKey('sessions.id', ondelete='CASCADE'), nullable=True)
    # Legacy column - kept for migration compatibility, will be deprecated
    practice_session_id = Column(String, nullable=True)
    activity_definition_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)  # Performance: direct fractal scoping
    created_at = Column(DateTime, default=utc_now)
    time_start = Column(DateTime, nullable=True)
    time_stop = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)  # Audit trail
    sort_order = Column(Integer, default=0)  # UI display order within session

    metric_values = relationship("MetricValue", backref="activity_instance", cascade="all, delete-orphan")
    definition = relationship("ActivityDefinition")

    # Additional fields for state persistence
    completed = Column(Boolean, default=False)
    notes = Column(String, nullable=True)
    data = Column(String, nullable=True)  # JSON store for sets and other extended attributes

    def to_dict(self):
        data_dict = json.loads(self.data) if self.data else {}
        metric_values_list = [m.to_dict() for m in self.metric_values]
        return {
            "id": self.id,
            "session_id": self.session_id,
            "practice_session_id": self.practice_session_id,  # Legacy support
            "activity_definition_id": self.activity_definition_id,
            "definition_name": self.definition.name if self.definition else "Unknown",
            "created_at": format_utc(self.created_at),
            "time_start": format_utc(self.time_start),
            "time_stop": format_utc(self.time_stop),
            "duration_seconds": self.duration_seconds,
            "completed": self.completed,
            "notes": self.notes,
            "sets": data_dict.get('sets', []),
            "data": data_dict,
            "metric_values": metric_values_list,
            "metrics": metric_values_list  # Frontend alias for consistency
        }

class MetricValue(Base):
    __tablename__ = 'metric_values'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='CASCADE'), nullable=False)
    metric_definition_id = Column(String, ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=False)
    split_definition_id = Column(String, ForeignKey('split_definitions.id', ondelete='RESTRICT'), nullable=True)  # Nullable for non-split activities
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)  # Performance: direct fractal scoping
    value = Column(Float, nullable=False)
    created_at = Column(DateTime, default=utc_now)  # Audit trail
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)  # Audit trail

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


class Note(Base):
    """
    Timestamped notes that can be attached to various entities.
    
    context_type determines what the note is attached to:
    - 'session': General session-level note
    - 'activity_instance': Note for a specific activity occurrence
    - 'set': Note for a specific set within an activity
    """
    __tablename__ = 'notes'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    
    # Polymorphic context - what is this note attached to?
    context_type = Column(String, nullable=False)  # 'session', 'activity_instance', 'set'
    context_id = Column(String, nullable=False, index=True)  # ID of the parent entity
    
    # Denormalized foreign keys for efficient queries
    session_id = Column(String, ForeignKey('sessions.id', ondelete='CASCADE'), nullable=True, index=True)
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='SET NULL'), nullable=True, index=True)
    activity_definition_id = Column(String, ForeignKey('activity_definitions.id', ondelete='SET NULL'), nullable=True, index=True)
    
    # For set-level notes
    set_index = Column(Integer, nullable=True)  # 0-indexed set number
    
    # Content
    content = Column(Text, nullable=False)
    image_data = Column(Text, nullable=True)  # Base64-encoded image data for pasted images
    
    # Timestamps
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    
    # Relationships
    session = relationship("Session", backref="notes_list")
    activity_instance = relationship("ActivityInstance", backref="notes_list")
    activity_definition = relationship("ActivityDefinition", backref="notes_list")
    
    def to_dict(self):
        return {
            "id": self.id,
            "root_id": self.root_id,
            "context_type": self.context_type,
            "context_id": self.context_id,
            "session_id": self.session_id,
            "activity_instance_id": self.activity_instance_id,
            "activity_definition_id": self.activity_definition_id,
            "set_index": self.set_index,
            "content": self.content,
            "image_data": self.image_data,
            "created_at": format_utc(self.created_at),
            "updated_at": format_utc(self.updated_at)
        }


class VisualizationAnnotation(Base):
    """
    Annotations for analytics visualizations.
    
    Allows users to select data points on visualizations (heatmaps, charts, etc.)
    and add notes/insights about the selected data patterns.
    
    visualization_type: The type of visualization ('heatmap', 'scatter', 'line', 'bar', etc.)
    visualization_context: JSON object with viz-specific params (e.g., activity_id, time_range, metric_id)
    selected_points: JSON array of selected data point identifiers (format depends on viz type)
    """
    __tablename__ = 'visualization_annotations'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    
    # Visualization identification
    visualization_type = Column(String, nullable=False)  # 'heatmap', 'scatter', 'line', 'bar', 'timeline', etc.
    visualization_context = Column(Text, nullable=True)  # JSON: {"activity_id": "...", "time_range": 12, ...}
    
    # Selected data points (format varies by visualization type)
    # Heatmap: ["2024-01-15", "2024-01-16", ...]
    # Scatter/Line: [{"x": "2024-01-15", "y": 45}, ...]
    # Bar: [{"label": "Week 1", "value": 5}, ...]
    selected_points = Column(Text, nullable=False)  # JSON array
    
    # Selection bounds (optional, for visual reconstruction)
    selection_bounds = Column(Text, nullable=True)  # JSON: {"x1": 0, "y1": 0, "x2": 100, "y2": 100}
    
    # The annotation content
    content = Column(Text, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    
    def to_dict(self):
        return {
            "id": self.id,
            "root_id": self.root_id,
            "visualization_type": self.visualization_type,
            "visualization_context": json.loads(self.visualization_context) if self.visualization_context else None,
            "selected_points": json.loads(self.selected_points) if self.selected_points else [],
            "selection_bounds": json.loads(self.selection_bounds) if self.selection_bounds else None,
            "content": self.content,
            "created_at": format_utc(self.created_at),
            "updated_at": format_utc(self.updated_at)
        }

class SessionTemplate(Base):
    __tablename__ = 'session_templates'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, default='')
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)  # Audit trail
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
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    is_active = Column(Boolean, default=True)
    
    # JSON fields (Legacy/Deprecated in favor of relational structure)
    goal_ids = Column(Text, nullable=False)  # JSON array of goal IDs
    weekly_schedule = Column(Text, nullable=False)  # JSON object with days -> template IDs
    
    # Relationships
    blocks = relationship("ProgramBlock", back_populates="program", cascade="all, delete-orphan")
    
    def to_dict(self):
        # Build weekly_schedule from relational blocks (Source of Truth)
        # Transform snake_case keys (DB) to camelCase (Frontend legacy compatibility)
        schedule_from_db = []
        if self.blocks:
            for b in self.blocks:
                bd = b.to_dict()
                bd['startDate'] = bd.pop('start_date', None)
                bd['endDate'] = bd.pop('end_date', None)
                schedule_from_db.append(bd)

        return {
            "id": self.id,
            "root_id": self.root_id,
            "name": self.name,
            "description": self.description,
            "start_date": format_utc(self.start_date),
            "end_date": format_utc(self.end_date),
            "created_at": format_utc(self.created_at),
            "updated_at": format_utc(self.updated_at),
            "is_active": self.is_active,
            "goal_ids": json.loads(self.goal_ids) if self.goal_ids else [],
            "weekly_schedule": schedule_from_db,
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
    is_completed = Column(Boolean, default=False)  # Track if all templates have been completed
    
    # Relationships
    block = relationship("ProgramBlock", back_populates="days")
    templates = relationship("SessionTemplate", secondary=program_day_templates, order_by="program_day_templates.c.order")
    completed_sessions = relationship("Session", back_populates="program_day")

    def check_completion(self):
        """Check if all templates have been completed"""
        if not self.templates:
            return False
        
        # Get template IDs from completed sessions
        completed_template_ids = {s.template_id for s in self.completed_sessions if s.template_id and not s.deleted_at}
        required_template_ids = {t.id for t in self.templates if not t.deleted_at}
        
        # Day is complete if all required templates have been done
        return required_template_ids.issubset(completed_template_ids)

    def to_dict(self):
        return {
            "id": self.id,
            "block_id": self.block_id,
            "date": self.date.isoformat() if self.date else None,
            "day_number": self.day_number,
            "name": self.name,
            "notes": self.notes,
            "is_completed": self.is_completed,
            # Include templates
            "templates": [{"id": t.id, "name": t.name, "description": t.description} for t in self.templates if not t.deleted_at],
            # Include completed sessions summary
            "completed_sessions": [{"id": s.id, "name": s.name, "created_at": format_utc(s.created_at)} for s in self.completed_sessions if not s.deleted_at]
        }


# Database Helper Functions
def get_engine(db_url=None):
    """
    Get SQLAlchemy engine with environment-based database configuration.
    
    Supports both SQLite (development) and PostgreSQL (production).
    """
    if db_url is None:
        # Import here to avoid circular dependency
        from config import config
        db_url = config.get_database_url()
    return create_engine(db_url, echo=False)

def init_db(engine):
    Base.metadata.create_all(engine)

def get_session(engine):
    DBSession = sessionmaker(bind=engine)
    return DBSession()

def get_all_root_goals(db_session):
    return db_session.query(Goal).filter(
        Goal.parent_id == None
    ).all()

def get_goal_by_id(db_session, goal_id):
    return db_session.query(Goal).filter(Goal.id == goal_id).first()

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
    stmt = select(Goal).join(session_goals).where(
        session_goals.c.session_id == session_id,
        session_goals.c.goal_type == 'immediate'
    )
    return db_session.execute(stmt).scalars().all()

def delete_goal_recursive(db_session, goal_id):
    goal = get_goal_by_id(db_session, goal_id)
    if goal:
        db_session.delete(goal)
        db_session.commit()
        return True
    return False

def delete_session(db_session, session_id):
    """Delete a session."""
    session = get_session_by_id(db_session, session_id)
    if session:
        session.deleted_at = utc_now()
        db_session.commit()
        return True
    return False

def build_goal_tree(db_session, goal):
    # Goal.to_dict(include_children=True) uses the relationship, which is efficient/lazy loaded.
    return goal.to_dict(include_children=True)

# Common 'root_id' finder
def get_root_id_for_goal(db_session, goal_id):
    goal = get_goal_by_id(db_session, goal_id)
    if not goal: return None
    curr = goal
    count = 0
    while curr.parent and count < 20: # Use relationship 'parent'
        curr = curr.parent
        count += 1
    return curr.id

def validate_root_goal(db_session, root_id):
    """
    Validate that a root_id exists and is actually a root goal (has no parent).
    """
    goal = get_goal_by_id(db_session, root_id)
    if goal and goal.parent_id is None:
        return goal
    return None


# =============================================================================
# LEGACY ALIASES (for backwards compatibility during migration)
# =============================================================================

# Alias for old PracticeSession references - use Session instead
PracticeSession = Session

def get_practice_session_by_id(db_session, session_id):
    """DEPRECATED: Use get_session_by_id instead."""
    return get_session_by_id(db_session, session_id)

def get_all_practice_sessions(db_session):
    """DEPRECATED: Use get_all_sessions instead."""
    return get_all_sessions(db_session)

def delete_practice_session(db_session, session_id):
    """DEPRECATED: Use delete_session instead."""
    return delete_session(db_session, session_id)

def build_practice_session_tree(db_session, session):
    """DEPRECATED: Use session.to_dict() instead."""
    return session.to_dict()
