import sqlalchemy as sa
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Float
from sqlalchemy.orm import relationship, backref
import uuid
from .base import Base, utc_now, JSON_TYPE


class FractalMetricDefinition(Base):
    __tablename__ = 'fractal_metric_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    is_multiplicative = Column(Boolean, default=True, nullable=False, server_default=sa.text('true'))
    is_additive = Column(Boolean, default=True, nullable=False, server_default=sa.text('true'))
    input_type = Column(String, default='number', nullable=False, server_default='number')  # 'number' | 'integer' | 'duration'
    precision = Column(Integer, default=2, nullable=False, server_default='2')
    default_value = Column(Float, nullable=True)
    higher_is_better = Column(Boolean, nullable=True)
    predefined_values = Column(JSON_TYPE, nullable=True)
    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    description = Column(String, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False, server_default='0')
    default_progress_aggregation = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, server_default=sa.text('true'))
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)

    __table_args__ = (
        sa.CheckConstraint('precision >= 0 AND precision <= 6', name='ck_fractal_metric_precision'),
    )

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
    active_progress_view_id = Column(
        String,
        ForeignKey(
            'activity_progress_views.id',
            ondelete='SET NULL',
            use_alter=True,
            name='fk_activity_definitions_active_progress_view_id',
        ),
        nullable=True,
        index=True,
    )

    group = relationship("ActivityGroup", backref="activities")
    metric_definitions = relationship("MetricDefinition", backref="activity_definition", cascade="all, delete-orphan")
    split_definitions = relationship("SplitDefinition", backref="activity_definition", cascade="all, delete-orphan")
    tags = relationship("ActivityTag", back_populates="activity_definition", cascade="all, delete-orphan")
    progress_views = relationship(
        "ActivityProgressView",
        back_populates="activity_definition",
        cascade="all, delete-orphan",
        foreign_keys="ActivityProgressView.activity_definition_id",
    )
    active_progress_view = relationship(
        "ActivityProgressView",
        foreign_keys=[active_progress_view_id],
        post_update=True,
    )
    
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
    track_progress = Column(Boolean, default=True, nullable=False, server_default=sa.text('true'))
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


class ActivityTagDefinition(Base):
    """Fractal-owned canonical identity for one logical activity tag."""

    __tablename__ = 'activity_tag_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String, nullable=False)
    color = Column(String(7), nullable=True)
    scope = Column(String(16), nullable=False, default='selected', server_default='selected')
    sort_order = Column(Integer, nullable=False, default=0, server_default='0')
    version = Column(Integer, nullable=False, default=1, server_default='1')
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False, server_default=sa.func.now())
    deleted_at = Column(DateTime, nullable=True)

    bindings = relationship(
        "ActivityTag",
        back_populates="definition",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        sa.Index(
            'uq_activity_tag_definitions_global_name',
            'root_id',
            sa.text("regexp_replace(lower(btrim(name)), '\\s+', ' ', 'g')"),
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL AND scope = 'global'"),
        ),
        sa.Index(
            'ix_activity_tag_definitions_root_active_order',
            'root_id',
            'sort_order',
            'name',
            postgresql_where=sa.text('deleted_at IS NULL'),
        ),
        sa.CheckConstraint("scope IN ('selected', 'global')", name='ck_activity_tag_definitions_scope'),
        sa.CheckConstraint('sort_order >= 0', name='ck_activity_tag_definitions_sort_order_nonnegative'),
        sa.CheckConstraint('version > 0', name='ck_activity_tag_definitions_version_positive'),
        sa.CheckConstraint(
            "color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'",
            name='ck_activity_tag_definitions_color',
        ),
    )


class ActivityTag(Base):
    """Per-activity binding used by historical and live tag assignments."""

    __tablename__ = 'activity_tags'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    activity_definition_id = Column(
        String,
        ForeignKey('activity_definitions.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    definition_id = Column(
        String,
        ForeignKey('activity_tag_definitions.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False, server_default=sa.func.now())
    deleted_at = Column(DateTime, nullable=True)

    activity_definition = relationship("ActivityDefinition", back_populates="tags")
    definition = relationship("ActivityTagDefinition", back_populates="bindings", lazy="joined")

    @property
    def name(self):
        return self.definition.name

    @property
    def color(self):
        return self.definition.color

    @property
    def sort_order(self):
        return self.definition.sort_order

    @property
    def catalog_archived(self):
        return self.definition.deleted_at is not None

    __table_args__ = (
        sa.UniqueConstraint(
            'activity_definition_id',
            'definition_id',
            name='uq_activity_tags_activity_definition',
        ),
        sa.Index(
            'ix_activity_tags_activity_active',
            'activity_definition_id',
            'definition_id',
            postgresql_where=sa.text('deleted_at IS NULL'),
        ),
    )


class ActivityProgressView(Base):
    __tablename__ = 'activity_progress_views'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    activity_definition_id = Column(
        String,
        ForeignKey('activity_definitions.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    config = Column(JSON_TYPE, nullable=False, default=dict, server_default=sa.text("'{}'::jsonb"))
    version = Column(Integer, nullable=False, default=1, server_default='1')
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False, server_default=sa.func.now())
    deleted_at = Column(DateTime, nullable=True)

    activity_definition = relationship(
        "ActivityDefinition",
        back_populates="progress_views",
        foreign_keys=[activity_definition_id],
    )

    __table_args__ = (
        sa.Index(
            'uq_activity_progress_views_active_name',
            'activity_definition_id',
            sa.func.lower(name),
            unique=True,
            postgresql_where=sa.text('deleted_at IS NULL'),
        ),
        sa.Index(
            'ix_activity_progress_views_active_activity_updated',
            'activity_definition_id',
            'updated_at',
            postgresql_where=sa.text('deleted_at IS NULL'),
        ),
        sa.CheckConstraint('version > 0', name='ck_activity_progress_views_version_positive'),
    )


class ActivityInstanceTag(Base):
    __tablename__ = 'activity_instance_tags'

    activity_instance_id = Column(
        String,
        ForeignKey('activity_instances.id', ondelete='CASCADE'),
        primary_key=True,
    )
    activity_tag_id = Column(
        String,
        ForeignKey('activity_tags.id', ondelete='CASCADE'),
        primary_key=True,
    )
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())

    __table_args__ = (
        sa.Index('ix_activity_instance_tags_tag', 'activity_tag_id', 'activity_instance_id'),
    )


class ActivitySetTag(Base):
    __tablename__ = 'activity_set_tags'

    activity_set_id = Column(
        String,
        ForeignKey('activity_sets.id', ondelete='CASCADE'),
        primary_key=True,
    )
    activity_tag_id = Column(
        String,
        ForeignKey('activity_tags.id', ondelete='CASCADE'),
        primary_key=True,
    )
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())

    __table_args__ = (
        sa.Index('ix_activity_set_tags_tag', 'activity_tag_id', 'activity_set_id'),
    )

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
    tag_assignment_version = Column(Integer, nullable=False, default=1, server_default='1')

    metric_values = relationship("MetricValue", backref="activity_instance", cascade="all, delete-orphan")
    sets = relationship(
        "ActivitySet",
        back_populates="activity_instance",
        cascade="all, delete-orphan",
        order_by="ActivitySet.sort_order",
    )
    work_intervals = relationship("SessionWorkInterval", back_populates="activity_instance")
    definition = relationship("ActivityDefinition")
    tags = relationship(
        "ActivityTag",
        secondary="activity_instance_tags",
        lazy="selectin",
    )
    completed = Column(Boolean, default=False)
    notes = Column(String, nullable=True)
    data = Column(JSON_TYPE, nullable=True)
    
    __table_args__ = (
        sa.CheckConstraint(
            'target_duration_seconds IS NULL OR target_duration_seconds > 0',
            name='ck_activity_instances_target_duration_positive',
        ),
        sa.CheckConstraint('tag_assignment_version > 0', name='ck_activity_instances_tag_assignment_version_positive'),
        sa.Index('ix_activity_instances_session_deleted', 'session_id', 'deleted_at'),
        sa.Index(
            'ix_activity_instances_root_deleted_activity_session',
            'root_id',
            'deleted_at',
            'activity_definition_id',
            'session_id',
        ),
        sa.Index(
            'ix_activity_instances_progress_history',
            'activity_definition_id',
            'root_id',
            'time_stop',
            'created_at',
            'id',
            postgresql_where=sa.text('deleted_at IS NULL'),
        ),
    )


class ActivitySet(Base):
    __tablename__ = 'activity_sets'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_instance_id = Column(
        String,
        ForeignKey('activity_instances.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    sort_order = Column(Integer, nullable=False)
    status = Column(String(16), nullable=False, default='planned', server_default='planned')
    duration_seconds = Column(Integer, nullable=False, default=0, server_default=sa.text('0'))
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False, server_default=sa.func.now())
    tag_assignment_version = Column(Integer, nullable=False, default=1, server_default='1')

    activity_instance = relationship("ActivityInstance", back_populates="sets")
    metric_values = relationship(
        "MetricValue",
        back_populates="activity_set",
        cascade="all, delete-orphan",
    )
    work_intervals = relationship("SessionWorkInterval", back_populates="activity_set")
    circuit_member = relationship(
        "CircuitRoundMember",
        back_populates="activity_set",
        uselist=False,
        foreign_keys="CircuitRoundMember.activity_set_id",
    )
    tags = relationship(
        "ActivityTag",
        secondary="activity_set_tags",
        lazy="selectin",
    )

    __table_args__ = (
        sa.CheckConstraint('sort_order >= 0', name='ck_activity_sets_sort_order_nonnegative'),
        sa.CheckConstraint(
            "status IN ('planned', 'active', 'completed', 'skipped', 'unfinished')",
            name='ck_activity_sets_status',
        ),
        sa.CheckConstraint('duration_seconds >= 0', name='ck_activity_sets_duration_nonnegative'),
        sa.CheckConstraint('tag_assignment_version > 0', name='ck_activity_sets_tag_assignment_version_positive'),
        sa.UniqueConstraint('activity_instance_id', 'sort_order', name='uq_activity_sets_instance_order'),
    )

class MetricValue(Base):
    __tablename__ = 'metric_values'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='CASCADE'), nullable=False, index=True)
    activity_set_id = Column(String, ForeignKey('activity_sets.id', ondelete='CASCADE'), nullable=True, index=True)
    metric_definition_id = Column(String, ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=False)
    split_definition_id = Column(String, ForeignKey('split_definitions.id', ondelete='RESTRICT'), nullable=True)
    value = Column(Float, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    definition = relationship("MetricDefinition")
    split = relationship("SplitDefinition")
    activity_set = relationship("ActivitySet", back_populates="metric_values")

    __table_args__ = (
        sa.Index(
            'uq_metric_values_result_metric_split',
            'activity_instance_id',
            sa.func.coalesce(activity_set_id, ''),
            'metric_definition_id',
            sa.func.coalesce(split_definition_id, ''),
            unique=True,
        ),
    )
