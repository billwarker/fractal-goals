import sqlalchemy as sa
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Table, CheckConstraint, Text
from sqlalchemy.orm import relationship, backref
import uuid
from .base import Base, utc_now, JSON_TYPE

# Junction table for linking Sessions to multiple Goals (ShortTerm and Immediate)
session_goals = Table(
    'session_goals', Base.metadata,
    Column('session_id', String, ForeignKey('sessions.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_type', String, nullable=False),  # legacy type mapping or level
    Column('association_source', String, nullable=False, default='manual'),  # manual, activity, micro_goal
    Column('created_at', DateTime, default=utc_now),
    Column('deleted_at', DateTime, nullable=True)
)

# Junction table for linking Activities to Goals
activity_goal_associations = Table(
    'activity_goal_associations', Base.metadata,
    Column('activity_id', String, ForeignKey('activity_definitions.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now),
    Column('deleted_at', DateTime, nullable=True)
)

# Junction table for linking Activity GROUPS to Goals
goal_activity_group_associations = Table(
    'goal_activity_group_associations', Base.metadata,
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('activity_group_id', String, ForeignKey('activity_groups.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now),
    Column('deleted_at', DateTime, nullable=True)
)

# Junction table for linking Session Templates to Goals
session_template_goals = Table(
    'session_template_goals', Base.metadata,
    Column('session_template_id', String, ForeignKey('session_templates.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now),
    Column('deleted_at', DateTime, nullable=True)
)

# Junction table for linking Program Days to Goals
program_day_goals = Table(
    'program_day_goals', Base.metadata,
    Column('program_day_id', String, ForeignKey('program_days.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now),
    Column('deleted_at', DateTime, nullable=True)
)

class GoalLevel(Base):
    __tablename__ = 'goal_levels'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False) # e.g. "Long Term Goal", "Nano Goal"
    rank = Column(Integer, nullable=False, default=0) # 0 is highest level
    color = Column(String, nullable=True)
    secondary_color = Column(String, nullable=True)
    icon = Column(String, nullable=True)
    
    # Customization Fields
    owner_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    root_id = Column(String, nullable=True, index=True) # If tied to a specific fractal project
    
    # Characteristics Overrides
    allow_manual_completion = Column(Boolean, default=True)
    track_activities = Column(Boolean, default=True)
    requires_smart = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)

class Goal(Base):
    """
    Represents all nodes in the fractal goal tree.
    """
    __tablename__ = 'goals'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    level_id = Column(String, ForeignKey('goal_levels.id'), nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    deadline = Column(DateTime, nullable=True)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    parent_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=True)
    sort_order = Column(Integer, default=0)
    root_id = Column(String, nullable=True, index=True)
    owner_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    
    relevance_statement = Column(Text, nullable=True)
    is_smart = Column(Boolean, default=False)
    completed_via_children = Column(Boolean, default=False)
    allow_manual_completion = Column(Boolean, default=True)
    track_activities = Column(Boolean, default=True)
    targets = Column(JSON_TYPE, nullable=True) # Legacy JSON column
    
    __table_args__ = (
        sa.Index('ix_goals_root_deleted_level', 'root_id', 'deleted_at', 'level_id'),
        sa.Index('ix_goals_root_parent_deleted', 'root_id', 'parent_id', 'deleted_at'),
    )

    level = relationship("GoalLevel")
    owner = relationship("User", back_populates="goals")
    children = relationship(
        "Goal",
        backref=backref('parent', remote_side=[id]),
        cascade="all, delete-orphan"
    )
    sessions = relationship(
        "Session",
        secondary=session_goals,
        back_populates="goals",
        viewonly=True
    )
    associated_activities = relationship(
        "ActivityDefinition",
        secondary=activity_goal_associations,
        back_populates="associated_goals",
        viewonly=True
    )
    associated_activity_groups = relationship(
        "ActivityGroup",
        secondary=goal_activity_group_associations,
        back_populates="associated_goals",
        viewonly=True
    )
    targets_rel = relationship(
        "Target",
        back_populates="goal",
        cascade="all, delete-orphan",
        foreign_keys="Target.goal_id"
    )

    def __repr__(self):
        return f"<Goal(id={self.id}, name={self.name})>"

class TargetTemplate(Base):
    __tablename__ = 'target_templates'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, default='')
    type = Column(String, default='threshold')
    time_scope = Column(String, default='all_time')
    frequency_days = Column(Integer, nullable=True)
    frequency_count = Column(Integer, nullable=True)
    
    default_metrics = Column(JSON_TYPE, nullable=True) # JSON snapshot for default config conditions
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)

class Target(Base):
    __tablename__ = 'targets'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id = Column(String, ForeignKey('target_templates.id', ondelete='SET NULL'), nullable=True)
    goal_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    activity_id = Column(String, ForeignKey('activity_definitions.id', ondelete='SET NULL'), nullable=True, index=True)
    activity_group_id = Column(String, ForeignKey('activity_groups.id', ondelete='SET NULL'), nullable=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, default='threshold')
    time_scope = Column(String, default='all_time')
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    linked_block_id = Column(String, ForeignKey('program_blocks.id', ondelete='SET NULL'), nullable=True)
    frequency_days = Column(Integer, nullable=True)
    frequency_count = Column(Integer, nullable=True)
    completed = Column(Boolean, default=False, index=True)
    completed_at = Column(DateTime, nullable=True)
    completed_session_id = Column(String, ForeignKey('sessions.id', ondelete='SET NULL'), nullable=True)
    completed_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    
    __table_args__ = (
        sa.Index('ix_targets_goal_deleted', 'goal_id', 'deleted_at'),
        sa.Index('ix_targets_root_deleted', 'root_id', 'deleted_at'),
    )
    
    template = relationship("TargetTemplate")
    goal = relationship("Goal", back_populates="targets_rel", foreign_keys=[goal_id])
    activity = relationship("ActivityDefinition")
    activity_group = relationship("ActivityGroup")
    metric_conditions = relationship("TargetMetricCondition", back_populates="target", cascade="all, delete-orphan")
    ledger_entries = relationship("TargetContributionLedger", back_populates="target", cascade="all, delete-orphan")
    completed_session = relationship("Session", foreign_keys=[completed_session_id])
    completed_instance = relationship("ActivityInstance", foreign_keys=[completed_instance_id])

class TargetMetricCondition(Base):
    """
    Explicit relational conditions that must be met to fulfill a Target.
    """
    __tablename__ = 'target_metric_conditions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    target_id = Column(String, ForeignKey('targets.id', ondelete='CASCADE'), nullable=False, index=True)
    metric_definition_id = Column(String, ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=False)
    operator = Column(String, nullable=False) # e.g. ">=", "<", "=="
    target_value = Column(Integer, nullable=False) # stored as int/float
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    target = relationship("Target", back_populates="metric_conditions")
    metric = relationship("MetricDefinition")

class TargetContributionLedger(Base):
    """
    Explicit log mapping an ActivityInstance's metric production to a Target's cumulative tracking.
    """
    __tablename__ = 'target_contribution_ledgers'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    target_id = Column(String, ForeignKey('targets.id', ondelete='CASCADE'), nullable=False, index=True)
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='CASCADE'), nullable=False, index=True)
    metric_condition_id = Column(String, ForeignKey('target_metric_conditions.id', ondelete='CASCADE'), nullable=False)
    contributed_value = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=utc_now)

    target = relationship("Target", back_populates="ledger_entries")
    instance = relationship("ActivityInstance")
    condition = relationship("TargetMetricCondition")

def get_all_root_goals(db_session):
    from sqlalchemy.orm import selectinload
    return db_session.query(Goal).options(
        selectinload(Goal.associated_activities),
        selectinload(Goal.associated_activity_groups),
        selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children)
    ).filter(
        Goal.parent_id == None
    ).all()

def get_goal_by_id(db_session, goal_id, load_associations=True):
    from sqlalchemy.orm import selectinload
    query = db_session.query(Goal)
    if load_associations:
        query = query.options(
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups),
            selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children)
        )
    return query.filter(Goal.id == goal_id).first()

def get_root_id_for_goal(db_session, goal_id):
    goal = get_goal_by_id(db_session, goal_id)
    if not goal: return None
    curr = goal
    count = 0
    while curr.parent and count < 20:
        curr = curr.parent
        count += 1
    return curr.id

def validate_root_goal(db_session, root_id, owner_id=None):
    query = db_session.query(Goal).filter(Goal.id == root_id, Goal.parent_id == None, Goal.deleted_at == None)
    if owner_id:
        query = query.filter(Goal.owner_id == owner_id)
    return query.first()

def delete_goal_recursive(db_session, goal_id):
    goal = get_goal_by_id(db_session, goal_id)
    if goal:
        db_session.delete(goal)
        db_session.commit()
        return True
    return False
