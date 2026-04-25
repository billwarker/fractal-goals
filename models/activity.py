import sqlalchemy as sa
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Float
from sqlalchemy.orm import relationship, backref
import uuid
from .base import Base, utc_now, JSON_TYPE


class ProgressRecord(Base):
    __tablename__ = 'progress_records'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    activity_definition_id = Column(String, ForeignKey('activity_definitions.id', ondelete='CASCADE'), nullable=False)
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='CASCADE'), nullable=False, unique=True)
    session_id = Column(String, ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False)
    previous_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='SET NULL'), nullable=True)
    is_first_instance = Column(Boolean, default=False, nullable=False)
    has_change = Column(Boolean, default=False, nullable=False)
    has_improvement = Column(Boolean, default=False, nullable=False)
    has_regression = Column(Boolean, default=False, nullable=False)
    comparison_type = Column(String, nullable=True)  # 'flat_metrics' | 'set_metrics' | 'yield' | 'first_instance'
    metric_comparisons = Column(JSON_TYPE, nullable=True)  # list of per-metric dicts
    derived_summary = Column(JSON_TYPE, nullable=True)  # UI-facing aggregates
    created_at = Column(DateTime, default=utc_now)

    __table_args__ = (
        sa.Index('ix_progress_records_root_activity_created', 'root_id', 'activity_definition_id', 'created_at'),
        sa.Index('ix_progress_records_session', 'session_id'),
    )


class FractalMetricDefinition(Base):
    __tablename__ = 'fractal_metric_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    is_multiplicative = Column(Boolean, default=True, nullable=False)
    is_additive = Column(Boolean, default=True, nullable=False)
    input_type = Column(String, default='number', nullable=False)  # 'number' | 'integer' | 'duration'
    default_value = Column(Float, nullable=True)
    higher_is_better = Column(Boolean, nullable=True)
    predefined_values = Column(JSON_TYPE, nullable=True)
    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    description = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)
    default_progress_aggregation = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)

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
    track_progress = Column(Boolean, nullable=True)       # null → treat as True (backward compat)
    progress_aggregation = Column(String, nullable=True)  # 'last' | 'sum' | 'max' | 'yield'
    delta_display_mode = Column(String(16), nullable=True)  # null = inherit from root; 'percent' | 'absolute'

    group = relationship("ActivityGroup", backref="activities")
    metric_definitions = relationship("MetricDefinition", backref="activity_definition", cascade="all, delete-orphan")
    split_definitions = relationship("SplitDefinition", backref="activity_definition", cascade="all, delete-orphan")
    
    associated_goals = relationship(
        "Goal",
        secondary="activity_goal_associations",
        back_populates="associated_activities",
        viewonly=True
    )

    __table_args__ = (
        sa.CheckConstraint(
            "delta_display_mode IS NULL OR delta_display_mode IN ('percent', 'absolute')",
            name='ck_activity_definitions_delta_display_mode',
        ),
    )

class MetricDefinition(Base):
    __tablename__ = 'metric_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False, index=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    fractal_metric_id = Column(String, ForeignKey('fractal_metric_definitions.id'), nullable=True, index=True)
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    is_active = Column(Boolean, default=True)
    is_best_set_metric = Column(Boolean, default=False)
    is_multiplicative = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    track_progress = Column(Boolean, default=True, nullable=False)
    progress_aggregation = Column(String, nullable=True)  # 'last' | 'sum' | 'max' | 'yield'

    fractal_metric = relationship("FractalMetricDefinition", lazy="joined")

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
    is_paused = Column(Boolean, nullable=False, server_default=sa.text('false'), default=False)
    last_paused_at = Column(DateTime, nullable=True)
    total_paused_seconds = Column(Integer, nullable=False, server_default=sa.text('0'), default=0)
    target_duration_seconds = Column(Integer, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    sort_order = Column(Integer, default=0)

    metric_values = relationship("MetricValue", backref="activity_instance", cascade="all, delete-orphan")
    definition = relationship("ActivityDefinition")
    progress_record = relationship(
        "ProgressRecord",
        primaryjoin="ActivityInstance.id == ProgressRecord.activity_instance_id",
        foreign_keys="[ProgressRecord.activity_instance_id]",
        uselist=False,
        lazy="noload",
    )

    completed = Column(Boolean, default=False)
    notes = Column(String, nullable=True)
    data = Column(JSON_TYPE, nullable=True)
    
    __table_args__ = (
        sa.CheckConstraint(
            'target_duration_seconds IS NULL OR target_duration_seconds > 0',
            name='ck_activity_instances_target_duration_positive',
        ),
        sa.Index('ix_activity_instances_session_deleted', 'session_id', 'deleted_at'),
        sa.Index(
            'ix_activity_instances_root_deleted_activity_session',
            'root_id',
            'deleted_at',
            'activity_definition_id',
            'session_id',
        ),
    )

class MetricValue(Base):
    __tablename__ = 'metric_values'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='CASCADE'), nullable=False, index=True)
    metric_definition_id = Column(String, ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=False)
    split_definition_id = Column(String, ForeignKey('split_definitions.id', ondelete='RESTRICT'), nullable=True)
    value = Column(Float, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    definition = relationship("MetricDefinition")
    split = relationship("SplitDefinition")
