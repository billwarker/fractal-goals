import sqlalchemy as sa
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Float, event
from sqlalchemy.orm import relationship, backref, column_property
from .goal import Goal, activity_instance_goal_associations
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
    row_version = Column(Integer, nullable=False, server_default=sa.text('1'), default=1)

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
    row_version = Column(Integer, nullable=False, default=1, server_default=sa.text('1'))

    group = relationship("ActivityGroup", backref="activities")
    metric_definitions = relationship(
        "MetricDefinition",
        backref="activity_definition",
        cascade="all, delete-orphan",
        order_by=lambda: (MetricDefinition.created_at, MetricDefinition.id),
    )
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
    __mapper_args__ = {'version_id_col': row_version}

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

    @property
    def multiplies(self) -> bool:
        """Whether the metric takes part in yield: the linked fractal metric's flag, else its own.

        The fractal metric is the source of truth once linked (as for name, unit and
        is_additive); the activity's own column is only a fallback and can be stale.
        """
        fractal_metric = self.fractal_metric
        if fractal_metric is not None and fractal_metric.is_multiplicative is not None:
            return bool(fractal_metric.is_multiplicative)
        return self.is_multiplicative is not False

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


# Collapse every whitespace run (tabs and newlines included), then trim.
TAG_NAME_NORMALIZATION_SQL = "btrim(regexp_replace(lower({column}), '\\s+', ' ', 'g'))"


class ActivityTagFamily(Base):
    """An ordered, named group of tags shown together in tag pickers."""

    __tablename__ = 'activity_tag_families'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String, nullable=False)
    normalized_name = Column(String, sa.Computed(TAG_NAME_NORMALIZATION_SQL.format(column='name'), persisted=True))
    sort_order = Column(Integer, nullable=False, default=0, server_default='0')
    # A "pick one" family: an instance or set holds at most one of its tags directly.
    single_select = Column(Boolean, nullable=False, default=False, server_default=sa.text('false'))
    version = Column(Integer, nullable=False, default=1, server_default='1')
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False, server_default=sa.func.now())

    tags = relationship("ActivityTagDefinition", back_populates="family", passive_deletes=True)

    __table_args__ = (
        sa.UniqueConstraint('root_id', 'normalized_name', name='uq_activity_tag_families_root_name'),
        sa.CheckConstraint('sort_order >= 0', name='ck_activity_tag_families_sort_order_nonnegative'),
        sa.CheckConstraint('version > 0', name='ck_activity_tag_families_version_positive'),
    )


class ActivityTagDefinition(Base):
    """The one identity of a tag. Any tag in a fractal can be applied to any activity."""

    __tablename__ = 'activity_tag_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String, nullable=False)
    # Names are unique per fractal for the life of the tag, archived tags included.
    normalized_name = Column(String, sa.Computed(TAG_NAME_NORMALIZATION_SQL.format(column='name'), persisted=True))
    color = Column(String(7), nullable=True)
    family_id = Column(
        String,
        ForeignKey('activity_tag_families.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )
    # Order within the family, or within "Other tags" when the tag has no family.
    sort_order = Column(Integer, nullable=False, default=0, server_default='0')
    version = Column(Integer, nullable=False, default=1, server_default='1')
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False, server_default=sa.func.now())
    deleted_at = Column(DateTime, nullable=True)

    family = relationship("ActivityTagFamily", back_populates="tags")

    @property
    def archived(self):
        return self.deleted_at is not None

    __table_args__ = (
        sa.UniqueConstraint('root_id', 'normalized_name', name='uq_activity_tag_definitions_root_name'),
        sa.Index(
            'ix_activity_tag_definitions_root_active_order',
            'root_id',
            'sort_order',
            'name',
            postgresql_where=sa.text('deleted_at IS NULL'),
        ),
        sa.CheckConstraint('sort_order >= 0', name='ck_activity_tag_definitions_sort_order_nonnegative'),
        sa.CheckConstraint('version > 0', name='ck_activity_tag_definitions_version_positive'),
        sa.CheckConstraint(
            "color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'",
            name='ck_activity_tag_definitions_color',
        ),
    )


TAG_ORDER = (ActivityTagDefinition.sort_order, ActivityTagDefinition.name, ActivityTagDefinition.id)


class ActivityProgressDefault(Base):
    """The comparison last chosen for an activity in a session template and/or program day.

    A database trigger copies it onto new instances of the activity in sessions with the
    same template and program day, so the choice carries forward on every creation path.
    """

    __tablename__ = 'activity_progress_defaults'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    activity_definition_id = Column(
        String, ForeignKey('activity_definitions.id', ondelete='CASCADE'), nullable=False, index=True,
    )
    session_template_id = Column(String, ForeignKey('session_templates.id', ondelete='CASCADE'), nullable=True, index=True)
    program_day_id = Column(String, ForeignKey('program_days.id', ondelete='CASCADE'), nullable=True, index=True)
    compare_mode = Column(String(8), nullable=True)
    same_template = Column(Boolean, nullable=False, default=False, server_default=sa.text('false'))
    same_program_day = Column(Boolean, nullable=False, default=False, server_default=sa.text('false'))
    version = Column(Integer, nullable=False, default=1, server_default='1')
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False, server_default=sa.func.now())

    compare_tags = relationship(
        "ActivityTagDefinition",
        secondary="activity_progress_default_tags",
        order_by=TAG_ORDER,
        lazy="selectin",
    )

    __table_args__ = (
        sa.Index(
            'uq_activity_progress_defaults_context',
            'activity_definition_id',
            sa.func.coalesce(session_template_id, ''),
            sa.func.coalesce(program_day_id, ''),
            unique=True,
        ),
        sa.CheckConstraint(
            "compare_mode IS NULL OR compare_mode IN ('all', 'tags')",
            name='ck_activity_progress_defaults_compare_mode',
        ),
        sa.CheckConstraint(
            'session_template_id IS NOT NULL OR program_day_id IS NOT NULL',
            name='ck_activity_progress_defaults_has_context',
        ),
        sa.CheckConstraint('version > 0', name='ck_activity_progress_defaults_version_positive'),
    )


class ActivityProgressChart(Base):
    """The Progress pane chart last chosen for an activity in a session template / program day.

    Both context columns NULL is the activity-wide choice, used by sessions with neither and as
    the fallback. Metric references fall back to the default when their metric is deleted.
    Resolved and validated by services/progress_chart_settings.py.
    """

    __tablename__ = 'activity_progress_charts'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    activity_definition_id = Column(
        String, ForeignKey('activity_definitions.id', ondelete='CASCADE'), nullable=False, index=True,
    )
    session_template_id = Column(String, ForeignKey('session_templates.id', ondelete='CASCADE'), nullable=True, index=True)
    program_day_id = Column(String, ForeignKey('program_days.id', ondelete='CASCADE'), nullable=True, index=True)
    kind = Column(String(16), nullable=False)
    trend_series = Column(String(8), nullable=True)
    metric_id = Column(String, ForeignKey('metric_definitions.id', ondelete='SET NULL'), nullable=True)
    x_metric_id = Column(String, ForeignKey('metric_definitions.id', ondelete='SET NULL'), nullable=True)
    y_metric_id = Column(String, ForeignKey('metric_definitions.id', ondelete='SET NULL'), nullable=True)
    set_aggregation = Column(String(8), nullable=False, default='top', server_default='top')
    version = Column(Integer, nullable=False, default=1, server_default='1')
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False, server_default=sa.func.now())

    __table_args__ = (
        sa.Index(
            'uq_activity_progress_charts_context',
            'activity_definition_id',
            sa.func.coalesce(session_template_id, ''),
            sa.func.coalesce(program_day_id, ''),
            unique=True,
        ),
        sa.CheckConstraint(
            "kind IN ('goal', 'activity_trend', 'scatter', 'metric_trend')",
            name='ck_activity_progress_charts_kind',
        ),
        sa.CheckConstraint(
            "trend_series IS NULL OR (kind = 'activity_trend' AND trend_series IN ('metric', 'yield'))",
            name='ck_activity_progress_charts_trend_series',
        ),
        sa.CheckConstraint(
            "set_aggregation IN ('top', 'average', 'total')"
            " AND (set_aggregation <> 'total' OR trend_series = 'yield')",
            name='ck_activity_progress_charts_set_aggregation',
        ),
    )


class ActivityProgressDefaultTag(Base):
    __tablename__ = 'activity_progress_default_tags'

    default_id = Column(
        String, ForeignKey('activity_progress_defaults.id', ondelete='CASCADE'), primary_key=True,
    )
    tag_definition_id = Column(
        String, ForeignKey('activity_tag_definitions.id', ondelete='CASCADE'), primary_key=True,
    )

    __table_args__ = (
        sa.Index('ix_activity_progress_default_tags_tag', 'tag_definition_id'),
    )


class ActivityInstanceTag(Base):
    __tablename__ = 'activity_instance_tags'

    activity_instance_id = Column(
        String,
        ForeignKey('activity_instances.id', ondelete='CASCADE'),
        primary_key=True,
    )
    tag_definition_id = Column(
        String,
        ForeignKey('activity_tag_definitions.id', ondelete='CASCADE'),
        primary_key=True,
    )
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())

    __table_args__ = (
        sa.Index('ix_activity_instance_tags_tag', 'tag_definition_id', 'activity_instance_id'),
    )


class ActivitySetTag(Base):
    __tablename__ = 'activity_set_tags'

    activity_set_id = Column(
        String,
        ForeignKey('activity_sets.id', ondelete='CASCADE'),
        primary_key=True,
    )
    tag_definition_id = Column(
        String,
        ForeignKey('activity_tag_definitions.id', ondelete='CASCADE'),
        primary_key=True,
    )
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())

    __table_args__ = (
        sa.Index('ix_activity_set_tags_tag', 'tag_definition_id', 'activity_set_id'),
    )


class ActivityInstanceCompareTag(Base):
    """The chosen tags when an instance compares against a specific tag set."""

    __tablename__ = 'activity_instance_compare_tags'

    activity_instance_id = Column(
        String,
        ForeignKey('activity_instances.id', ondelete='CASCADE'),
        primary_key=True,
    )
    tag_definition_id = Column(
        String,
        ForeignKey('activity_tag_definitions.id', ondelete='CASCADE'),
        primary_key=True,
    )
    created_at = Column(DateTime, default=utc_now, nullable=False, server_default=sa.func.now())

    __table_args__ = (
        sa.Index('ix_activity_instance_compare_tags_tag', 'tag_definition_id'),
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
    # Sorted ids of the instance's own tags (empty when untagged), kept by a database
    # trigger. A lookup key for "same tags" progress comparisons, never progress itself.
    tag_signature = Column(String, nullable=False, default='', server_default='')
    # NULL compares with past instances that have the same tags; 'tags' compares with
    # the chosen compare_tags; 'all' compares with all history.
    progress_compare_mode = Column(String(8), nullable=True)
    # Narrow the comparison to past sessions from the same session template and/or program day.
    progress_compare_same_template = Column(Boolean, nullable=False, default=False, server_default=sa.text('false'))
    progress_compare_same_program_day = Column(Boolean, nullable=False, default=False, server_default=sa.text('false'))
    progress_compare_version = Column(Integer, nullable=False, default=1, server_default='1')

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
        "ActivityTagDefinition",
        secondary="activity_instance_tags",
        order_by=TAG_ORDER,
        lazy="selectin",
    )
    # Read only when progress_compare_mode == 'tags', so it loads on access.
    compare_tags = relationship(
        "ActivityTagDefinition",
        secondary="activity_instance_compare_tags",
        order_by=TAG_ORDER,
        lazy="select",
    )
    # Project only IDs in the instance query: no full goal hydration or N+1 reads.
    associated_goal_ids = column_property(
        sa.select(sa.func.array_agg(activity_instance_goal_associations.c.goal_id))
        .join(Goal, Goal.id == activity_instance_goal_associations.c.goal_id)
        .where(
            activity_instance_goal_associations.c.activity_instance_id == id,
            activity_instance_goal_associations.c.deleted_at.is_(None),
            Goal.deleted_at.is_(None), Goal.root_id == root_id,
        )
        .correlate_except(activity_instance_goal_associations, Goal)
        .scalar_subquery(), expire_on_flush=False
    )
    completed = Column(Boolean, default=False)
    notes = Column(String, nullable=True)
    data = Column(JSON_TYPE, nullable=True)
    # Planned values and notes snapshotted from the template or dated plan at creation.
    prescription = Column(JSON_TYPE, nullable=True)
    
    __table_args__ = (
        sa.CheckConstraint(
            'target_duration_seconds IS NULL OR target_duration_seconds > 0',
            name='ck_activity_instances_target_duration_positive',
        ),
        sa.CheckConstraint('tag_assignment_version > 0', name='ck_activity_instances_tag_assignment_version_positive'),
        sa.CheckConstraint(
            "progress_compare_mode IS NULL OR progress_compare_mode IN ('all', 'tags')",
            name='ck_activity_instances_progress_compare_mode',
        ),
        sa.CheckConstraint('progress_compare_version > 0', name='ck_activity_instances_progress_compare_version_positive'),
        sa.Index('ix_activity_instances_session_deleted', 'session_id', 'deleted_at'),
        sa.Index(
            'ix_activity_instances_activity_tag_signature',
            'activity_definition_id',
            'tag_signature',
            postgresql_where=sa.text('deleted_at IS NULL'),
        ),
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
    # Sorted ids of the set's own tags; see ActivityInstance.tag_signature.
    tag_signature = Column(String, nullable=False, default='', server_default='')

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
        "ActivityTagDefinition",
        secondary="activity_set_tags",
        order_by=TAG_ORDER,
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
    metric_definition_id = Column(String, ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=False, index=True)
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


# Tag-link integrity and signatures live in the database so every write path agrees:
# API assignment, circuit scopes, session creation, merges, cascades, and offline replay.
TAG_LINK_TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION enforce_activity_tag_link_root() RETURNS trigger AS $$
DECLARE owner_root text;
BEGIN
    IF TG_TABLE_NAME = 'activity_set_tags' THEN
        SELECT instance.root_id INTO owner_root
        FROM activity_sets activity_set
        JOIN activity_instances instance ON instance.id = activity_set.activity_instance_id
        WHERE activity_set.id = NEW.activity_set_id;
    ELSE
        SELECT root_id INTO owner_root FROM activity_instances WHERE id = NEW.activity_instance_id;
    END IF;
    IF owner_root IS NULL OR NOT EXISTS (
        SELECT 1 FROM activity_tag_definitions WHERE id = NEW.tag_definition_id AND root_id = owner_root
    ) THEN
        RAISE EXCEPTION 'tag and tagged activity must share a fractal' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_activity_tag_signature() RETURNS trigger AS $$
DECLARE target text;
BEGIN
    IF TG_TABLE_NAME = 'activity_set_tags' THEN
        FOR target IN
            SELECT DISTINCT id FROM (VALUES
                (CASE WHEN TG_OP <> 'INSERT' THEN OLD.activity_set_id END),
                (CASE WHEN TG_OP <> 'DELETE' THEN NEW.activity_set_id END)
            ) AS changed(id) WHERE id IS NOT NULL
        LOOP
            UPDATE activity_sets SET tag_signature = COALESCE((
                SELECT string_agg(tag_definition_id, ',' ORDER BY tag_definition_id COLLATE "C")
                FROM activity_set_tags WHERE activity_set_id = target
            ), '') WHERE id = target;
        END LOOP;
    ELSE
        FOR target IN
            SELECT DISTINCT id FROM (VALUES
                (CASE WHEN TG_OP <> 'INSERT' THEN OLD.activity_instance_id END),
                (CASE WHEN TG_OP <> 'DELETE' THEN NEW.activity_instance_id END)
            ) AS changed(id) WHERE id IS NOT NULL
        LOOP
            UPDATE activity_instances SET tag_signature = COALESCE((
                SELECT string_agg(tag_definition_id, ',' ORDER BY tag_definition_id COLLATE "C")
                FROM activity_instance_tags WHERE activity_instance_id = target
            ), '') WHERE id = target;
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
"""


PROGRESS_DEFAULT_TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION apply_activity_progress_default() RETURNS trigger AS $$
DECLARE remembered record;
BEGIN
    IF NEW.session_id IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT progress_default.* INTO remembered
    FROM activity_progress_defaults progress_default
    JOIN sessions session_row ON session_row.id = NEW.session_id
    WHERE progress_default.activity_definition_id = NEW.activity_definition_id
      AND progress_default.session_template_id IS NOT DISTINCT FROM session_row.template_id
      AND progress_default.program_day_id IS NOT DISTINCT FROM session_row.program_day_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    UPDATE activity_instances SET
        progress_compare_mode = remembered.compare_mode,
        progress_compare_same_template = remembered.same_template,
        progress_compare_same_program_day = remembered.same_program_day
    WHERE id = NEW.id;
    INSERT INTO activity_instance_compare_tags (activity_instance_id, tag_definition_id)
    SELECT NEW.id, default_tag.tag_definition_id
    FROM activity_progress_default_tags default_tag
    JOIN activity_tag_definitions tag ON tag.id = default_tag.tag_definition_id
    WHERE default_tag.default_id = remembered.id AND tag.root_id = NEW.root_id
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activity_instances_progress_default ON activity_instances;
CREATE TRIGGER trg_activity_instances_progress_default AFTER INSERT ON activity_instances
FOR EACH ROW EXECUTE FUNCTION apply_activity_progress_default();
"""


def tag_link_triggers_sql(table_name: str, *, signature: bool = True) -> str:
    statements = [
        f"DROP TRIGGER IF EXISTS trg_{table_name}_root ON {table_name};",
        f"CREATE TRIGGER trg_{table_name}_root BEFORE INSERT OR UPDATE ON {table_name} "
        "FOR EACH ROW EXECUTE FUNCTION enforce_activity_tag_link_root();",
    ]
    if signature:
        statements += [
            f"DROP TRIGGER IF EXISTS trg_{table_name}_signature ON {table_name};",
            f"CREATE TRIGGER trg_{table_name}_signature AFTER INSERT OR UPDATE OR DELETE ON {table_name} "
            "FOR EACH ROW EXECUTE FUNCTION refresh_activity_tag_signature();",
        ]
    return "\n".join(statements)


def _install_tag_link_triggers(table_name, *, signature=True):
    def install(_target, connection, **_kwargs):
        if connection.dialect.name != 'postgresql':
            return
        connection.exec_driver_sql(TAG_LINK_TRIGGER_SQL)
        connection.exec_driver_sql(tag_link_triggers_sql(table_name, signature=signature))
    return install


event.listen(ActivityInstanceTag.__table__, 'after_create', _install_tag_link_triggers('activity_instance_tags'))
event.listen(ActivitySetTag.__table__, 'after_create', _install_tag_link_triggers('activity_set_tags'))
def _install_progress_default_trigger(_target, connection, **_kwargs):
    if connection.dialect.name == 'postgresql':
        connection.exec_driver_sql(PROGRESS_DEFAULT_TRIGGER_SQL)


# The trigger needs only its own table to exist; the function resolves the others when it runs.
event.listen(ActivityInstance.__table__, 'after_create', _install_progress_default_trigger)
event.listen(
    ActivityInstanceCompareTag.__table__,
    'after_create',
    _install_tag_link_triggers('activity_instance_compare_tags', signature=False),
)
