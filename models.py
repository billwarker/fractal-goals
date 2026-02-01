
import sqlalchemy as sa
from sqlalchemy import create_engine, Column, String, Boolean, DateTime, Date, Integer, ForeignKey, Table, CheckConstraint, Float, Text, JSON
from sqlalchemy.dialects.postgresql import JSONB

# Fallback for SQLite/other engines
# JSONB gives us indexing and faster processing in Postgres
JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")
from sqlalchemy.pool import QueuePool, NullPool
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, backref, scoped_session, selectinload
from datetime import datetime, timezone
import uuid
import json
from werkzeug.security import generate_password_hash, check_password_hash

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

def _safe_load_json(data, default=None):
    if data is None: return default
    if isinstance(data, (dict, list)): return data
    try:
        return json.loads(data)
    except:
        return default

Base = declarative_base()

class User(Base):
    """
    Represents a user in the system.
    """
    __tablename__ = 'users'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(80), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    preferences = Column(JSON_TYPE, default={})  # Store UI preferences like goal colors
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    # Relationships
    goals = relationship("Goal", back_populates="owner", cascade="all, delete-orphan")
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    


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
    root_id = Column(String, nullable=True, index=True)
    
    # User ownership
    owner_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    owner = relationship("User", back_populates="goals")
    
    # SMART goal fields
    relevance_statement = Column(Text, nullable=True)  # "How does this goal help achieve [parent]?"
    is_smart = Column(Boolean, default=False)  # Computed flag, updated on save
    completed_via_children = Column(Boolean, default=False)  # If true, completion is derived from children
    allow_manual_completion = Column(Boolean, default=True)
    track_activities = Column(Boolean, default=True)

    # JSON Plans/Targets
    targets = Column(JSON_TYPE, nullable=True)
    
    __table_args__ = (
        CheckConstraint(
            type.in_([
                'UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal',
                'ImmediateGoal', 'MicroGoal', 'NanoGoal'
            ]),
            name='valid_goal_type'
        ),
        # Composite indexes for common query patterns
        sa.Index('ix_goals_root_deleted_type', 'root_id', 'deleted_at', 'type'),
        sa.Index('ix_goals_root_parent_deleted', 'root_id', 'parent_id', 'deleted_at'),
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

    # Business logic methods calculate_smart_status, is_smart_goal and to_dict moved to services/serializers.py
    
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
    root_id = Column(String, ForeignKey('goals.id'), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    
    # Session timing
    session_start = Column(DateTime, nullable=True)
    session_end = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    total_duration_seconds = Column(Integer, nullable=True)
    
    __table_args__ = (
        sa.Index('ix_sessions_root_deleted_completed', 'root_id', 'deleted_at', 'completed'),
    )
    
    # Template/Program references
    template_id = Column(String, ForeignKey('session_templates.id'), nullable=True)
    program_day_id = Column(String, ForeignKey('program_days.id'), nullable=True)
    
    # Flexible data storage (sections, exercises, notes, etc.)
    attributes = Column(JSON_TYPE, nullable=True)
    
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
    
    # Methods get_short_term_goals, get_immediate_goals, get_program_info, and to_dict moved/deprecated. 
    # Use services/serializers.py for serialization.




class ActivityGroup(Base):
    __tablename__ = 'activity_groups'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False, index=True)
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




class ActivityDefinition(Base):
    __tablename__ = 'activity_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)  # Audit trail
    has_sets = Column(Boolean, default=False)
    has_metrics = Column(Boolean, default=True)
    metrics_multiplicative = Column(Boolean, default=False)  # When true, allows metric1 × metric2 × ... derived value
    has_splits = Column(Boolean, default=False)  # When true, activity can be split into multiple portions (e.g., left/right)
    group_id = Column(String, ForeignKey('activity_groups.id'), nullable=True, index=True)

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



class MetricDefinition(Base):
    __tablename__ = 'metric_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False, index=True)
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



class SplitDefinition(Base):
    __tablename__ = 'split_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False, index=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)  # Performance: direct fractal scoping
    name = Column(String, nullable=False)  # e.g., "Left", "Right", "Split #1"
    order = Column(Integer, nullable=False)  # Display order
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)  # Audit trail



class ActivityInstance(Base):
    __tablename__ = 'activity_instances'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # New session_id column pointing to sessions table
    session_id = Column(String, ForeignKey('sessions.id', ondelete='CASCADE'), nullable=True, index=True)
    # Legacy column - kept for migration compatibility, will be deprecated
    practice_session_id = Column(String, nullable=True)
    activity_definition_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False, index=True)
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
    data = Column(JSON_TYPE, nullable=True)  # JSON store for sets and other extended attributes
    
    __table_args__ = (
        sa.Index('ix_activity_instances_session_deleted', 'session_id', 'deleted_at'),
    )



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
    
    __table_args__ = (
        sa.Index('ix_notes_root_context_deleted', 'root_id', 'context_type', 'context_id', 'deleted_at'),
    )
    
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
    visualization_context = Column(JSON_TYPE, nullable=True)  # JSON: {"activity_id": "...", "time_range": 12, ...}
    
    # Selected data points (format varies by visualization type)
    # Heatmap: ["2024-01-15", "2024-01-16", ...]
    # Scatter/Line: [{"x": "2024-01-15", "y": 45}, ...]
    # Bar: [{"label": "Week 1", "value": 5}, ...]
    selected_points = Column(JSON_TYPE, nullable=False)  # JSON array
    
    # Selection bounds (optional, for visual reconstruction)
    selection_bounds = Column(JSON_TYPE, nullable=True)  # JSON: {"x1": 0, "y1": 0, "x2": 100, "y2": 100}
    
    __table_args__ = (
        sa.Index('ix_viz_annotations_root_type_context', 'root_id', 'visualization_type', 'deleted_at'),
    )
    
    # The annotation content
    content = Column(Text, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    



class EventLog(Base):
    """
    Captured logs for all events that occur in the application.
    This allows for auditing, debugging, and providing a history of actions.
    """
    __tablename__ = 'event_logs'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    
    event_type = Column(String, nullable=False)  # e.g., 'session.completed', 'goal.created'
    entity_type = Column(String, nullable=True)  # e.g., 'session', 'goal', 'target'
    entity_id = Column(String, nullable=True)    # ID of the involved entity
    
    description = Column(Text, nullable=True)
    payload = Column(JSON_TYPE, nullable=True)    # Full event payload
    
    source = Column(String, nullable=True)       # Where the event originated
    timestamp = Column(DateTime, default=utc_now)
    


class SessionTemplate(Base):
    __tablename__ = 'session_templates'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, default='')
    root_id = Column(String, ForeignKey('goals.id'), nullable=False, index=True)
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete support
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)  # Audit trail
    template_data = Column(JSON_TYPE, nullable=False)
    



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
    
    # JSON fields (Legacy/Deprecated in favor of relational structure)
    goal_ids = Column(JSON_TYPE, nullable=False)  # JSON array of goal IDs
    weekly_schedule = Column(JSON_TYPE, nullable=False)  # JSON object with days -> template IDs
    
    # Relationships
    blocks = relationship("ProgramBlock", back_populates="program", cascade="all, delete-orphan")
    


class ProgramBlock(Base):
    __tablename__ = 'program_blocks'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_id = Column(String, ForeignKey('programs.id'), nullable=False, index=True)
    
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=True) # Nullable for abstract blocks
    end_date = Column(Date, nullable=True)   # Nullable for abstract blocks
    color = Column(String)
    
    # JSON List of Goal IDs specific to this block
    goal_ids = Column(JSON_TYPE, nullable=False, default=list) 
    
    program = relationship("Program", back_populates="blocks")
    days = relationship("ProgramDay", back_populates="block", cascade="all, delete-orphan", order_by="ProgramDay.day_number")



class ProgramDay(Base):
    __tablename__ = 'program_days'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    block_id = Column(String, ForeignKey('program_blocks.id'), nullable=False, index=True)
    
    date = Column(Date, nullable=True) # Abstract days don't have concrete dates
    day_number = Column(Integer, nullable=True) # Order within block (1, 2, 3...)
    name = Column(String) # Optional
    notes = Column(Text)
    is_completed = Column(Boolean, default=False)  # Track if all templates have been completed
    
    day_of_week = Column(JSON_TYPE) # To persist the mapping (Mon, Tue, etc.)
    
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




# Database Helper Functions

# Singleton engine for connection pooling
_cached_engine = None

def get_engine(db_url=None):
    """
    Get SQLAlchemy engine with environment-based database configuration.
    
    Uses a singleton pattern to reuse the engine across requests.
    For PostgreSQL, configures connection pooling with QueuePool.
    """
    global _cached_engine
    
    # Return cached engine if available and no custom URL specified
    if _cached_engine is not None and db_url is None:
        return _cached_engine
    
    if db_url is None:
        # Import here to avoid circular dependency
        from config import config
        db_url = config.get_database_url()
    
    # Create new engine with appropriate pooling
    from config import config
    
    if config.is_postgres():
        # PostgreSQL: Use QueuePool with connection pooling
        engine = create_engine(
            db_url,
            echo=False,
            poolclass=QueuePool,
            pool_size=10,           # Number of persistent connections
            max_overflow=20,        # Additional connections when pool is exhausted
            pool_pre_ping=True,     # Verify connection health before use
            pool_recycle=3600,      # Recycle connections after 1 hour
            pool_timeout=30,        # Timeout for getting connection from pool
        )
    else:
        # SQLite: Use NullPool (no pooling needed for file-based DB)
        engine = create_engine(db_url, echo=False, poolclass=NullPool)
    
    # Cache the engine if using default URL
    if db_url == config.get_database_url():
        _cached_engine = engine
    
    return engine

def reset_engine():
    """Reset the cached engine. Useful for testing or reconfiguration."""
    global _cached_engine
    if _cached_engine is not None:
        _cached_engine.dispose()
        _cached_engine = None

def init_db(engine):
    Base.metadata.create_all(engine)

# Scoped session factory for Flask request lifecycle
_session_factory = None

def get_scoped_session():
    """
    Get a thread-local scoped session.
    
    This session is automatically scoped to the current thread/request.
    Use remove_session() at the end of each request to clean up.
    """
    global _session_factory
    if _session_factory is None:
        engine = get_engine()
        session_factory = sessionmaker(bind=engine)
        _session_factory = scoped_session(session_factory)
    return _session_factory()

def remove_session():
    """
    Remove the current scoped session.
    
    Should be called at the end of each request (via Flask teardown).
    """
    global _session_factory
    if _session_factory is not None:
        _session_factory.remove()

def get_session(engine):
    """
    Create a new session bound to the given engine.
    
    DEPRECATED: Prefer get_scoped_session() for Flask request handling.
    This function is kept for backward compatibility.
    """
    DBSession = sessionmaker(bind=engine)
    return DBSession()

def get_all_root_goals(db_session):
    return db_session.query(Goal).options(
        selectinload(Goal.associated_activities),
        selectinload(Goal.associated_activity_groups)
    ).filter(
        Goal.parent_id == None
    ).all()

def get_goal_by_id(db_session, goal_id, load_associations=True):
    query = db_session.query(Goal)
    if load_associations:
        query = query.options(
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups)
        )
    return query.filter(Goal.id == goal_id).first()

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

# build_goal_tree deprecated. Use services.serializers.serialize_goal instead.

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

def validate_root_goal(db_session, root_id, owner_id=None):
    """
    Validate that a root_id exists and is actually a root goal (has no parent).
    If owner_id is provided, also validates ownership.
    """
    query = db_session.query(Goal).filter(Goal.id == root_id, Goal.parent_id == None, Goal.deleted_at == None)
    if owner_id:
        query = query.filter(Goal.owner_id == owner_id)
    return query.first()


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

# build_practice_session_tree deprecated. Use services.serializers.serialize_session instead.
