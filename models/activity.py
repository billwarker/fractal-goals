import sqlalchemy as sa
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Float
from sqlalchemy.orm import relationship, backref
import uuid
from .base import Base, utc_now, JSON_TYPE

class ActivityGroup(Base):
    __tablename__ = 'activity_groups'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    sort_order = Column(Integer, default=0)
    
    # Self-referential relationship for nested groups
    parent_id = Column(String, ForeignKey('activity_groups.id', ondelete='CASCADE'), nullable=True, index=True)
    
    children = relationship(
        "ActivityGroup",
        backref=backref('parent', remote_side=[id]),
        cascade="all, delete-orphan"
    )

    associated_goals = relationship(
        "Goal",
        secondary="goal_activity_group_associations",
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
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    has_sets = Column(Boolean, default=False)
    has_metrics = Column(Boolean, default=True)
    metrics_multiplicative = Column(Boolean, default=False)
    has_splits = Column(Boolean, default=False)
    group_id = Column(String, ForeignKey('activity_groups.id'), nullable=True, index=True)

    group = relationship("ActivityGroup", backref="activities")
    metric_definitions = relationship("MetricDefinition", backref="activity_definition", cascade="all, delete-orphan")
    split_definitions = relationship("SplitDefinition", backref="activity_definition", cascade="all, delete-orphan")
    
    associated_goals = relationship(
        "Goal",
        secondary="activity_goal_associations",
        back_populates="associated_activities",
        viewonly=True
    )

class MetricDefinition(Base):
    __tablename__ = 'metric_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False, index=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    is_active = Column(Boolean, default=True)
    is_top_set_metric = Column(Boolean, default=False)
    is_multiplicative = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

class SplitDefinition(Base):
    __tablename__ = 'split_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False, index=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String, nullable=False)
    order = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

class ActivityInstance(Base):
    __tablename__ = 'activity_instances'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, sa.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=True, index=True)
    # practice_session_id removed (deprecated)
    activity_definition_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False, index=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    created_at = Column(DateTime, default=utc_now)
    time_start = Column(DateTime, nullable=True)
    time_stop = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    sort_order = Column(Integer, default=0)

    metric_values = relationship("MetricValue", backref="activity_instance", cascade="all, delete-orphan")
    definition = relationship("ActivityDefinition")

    completed = Column(Boolean, default=False)
    notes = Column(String, nullable=True)
    data = Column(JSON_TYPE, nullable=True)
    
    __table_args__ = (
        sa.Index('ix_activity_instances_session_deleted', 'session_id', 'deleted_at'),
    )

class MetricValue(Base):
    __tablename__ = 'metric_values'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='CASCADE'), nullable=False, index=True)
    metric_definition_id = Column(String, ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=False)
    split_definition_id = Column(String, ForeignKey('split_definitions.id', ondelete='RESTRICT'), nullable=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    value = Column(Float, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    definition = relationship("MetricDefinition")
    split = relationship("SplitDefinition")
