import sqlalchemy as sa
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Table, CheckConstraint, Text, event
from sqlalchemy.orm import relationship, backref
import uuid
from .base import Base, utc_now, JSON_TYPE

COMPLETION_CONDITION_ACTIVITY_THRESHOLD = 'activity_threshold'
COMPLETION_CONDITION_CHILDREN = 'children'
COMPLETION_CONDITION_MANUAL = 'manual'
COMPLETION_CONDITIONS = (
    COMPLETION_CONDITION_ACTIVITY_THRESHOLD, COMPLETION_CONDITION_CHILDREN, COMPLETION_CONDITION_MANUAL,
)
# How a completed goal got there. 'manual_override' completes a goal whose own condition is not manual.
COMPLETION_SOURCES = ('condition', 'children', 'manual', 'manual_override')
COMPLETION_CONDITIONS_SQL = "('activity_threshold', 'children', 'manual')"
CONDITION_NAME_MAX_LENGTH = 120

# Periodic reviews (goal_review notes) repeat on a cadence: a level's default, or a goal's own.
REVIEW_CADENCE_UNITS = ('days', 'weeks', 'months', 'years')
REVIEW_CADENCE_UNITS_SQL = "('days', 'weeks', 'months', 'years')"


def _review_cadence_checks(table):
    return (
        CheckConstraint(
            f"review_cadence_unit IS NULL OR review_cadence_unit IN {REVIEW_CADENCE_UNITS_SQL}",
            name=f'ck_{table}_review_cadence_unit',
        ),
        CheckConstraint(
            "(review_cadence_value IS NULL) = (review_cadence_unit IS NULL)"
            " AND (review_cadence_value IS NULL OR review_cadence_value > 0)",
            name=f'ck_{table}_review_cadence_pair',
        ),
    )
COMPLETION_SOURCES_SQL = "('condition', 'children', 'manual', 'manual_override')"
PAUSE_REASON_MANUAL = 'manual'
PAUSE_REASON_SEQUENCE = 'sequence'

# Junction table for linking Sessions to multiple Goals (ShortTerm and Immediate)
session_goals = Table(
    'session_goals', Base.metadata,
    Column('session_id', String, ForeignKey('sessions.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_type', String, nullable=False),  # legacy type mapping or level
    Column('association_source', String, nullable=False, default='manual'),  # manual, activity
    Column('created_at', DateTime, default=utc_now),
    Column('deleted_at', DateTime, nullable=True),
    # Reverse lookup; the composite primary key leads with the other column.
    sa.Index('ix_session_goals_goal_id', 'goal_id')
)

# Junction table for linking Activities to Goals
activity_goal_associations = Table(
    'activity_goal_associations', Base.metadata,
    Column('activity_id', String, ForeignKey('activity_definitions.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now),
    Column('deleted_at', DateTime, nullable=True),
    # Reverse lookup; the composite primary key leads with the other column.
    sa.Index('ix_activity_goal_associations_goal_id', 'goal_id')
)

# Explicit links credit only the selected execution, never its definition.
activity_instance_goal_associations = Table(
    'activity_instance_goal_associations', Base.metadata,
    Column('activity_instance_id', String, ForeignKey('activity_instances.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, nullable=False, default=utc_now, server_default=sa.func.now()),
    Column('deleted_at', DateTime, nullable=True),
    sa.Index('ix_activity_instance_goal_associations_goal_id', 'goal_id', 'activity_instance_id'),
)

# Junction table for linking Activity GROUPS to Goals
goal_activity_group_associations = Table(
    'goal_activity_group_associations', Base.metadata,
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('activity_group_id', String, ForeignKey('activity_groups.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now),
    Column('deleted_at', DateTime, nullable=True),
    # Reverse lookup; the composite primary key leads with the other column.
    sa.Index('ix_goal_activity_group_associations_activity_group_id', 'activity_group_id'),
    # A goal links at most one live activity group (services/goal_activity_group_links.py).
    sa.Index(
        'uq_goal_activity_group_associations_one_active', 'goal_id',
        unique=True, postgresql_where=sa.text('deleted_at IS NULL'),
    ),
)

# Junction table for linking Session Templates to Goals
session_template_goals = Table(
    'session_template_goals', Base.metadata,
    Column('session_template_id', String, ForeignKey('session_templates.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now),
    Column('deleted_at', DateTime, nullable=True),
    # Reverse lookup; the composite primary key leads with the other column.
    sa.Index('ix_session_template_goals_goal_id', 'goal_id')
)

# Junction table for linking Program Days to Goals
program_day_goals = Table(
    'program_day_goals', Base.metadata,
    Column('program_day_id', String, ForeignKey('program_days.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now),
    Column('deleted_at', DateTime, nullable=True),
    # Reverse lookup; the composite primary key leads with the other column.
    sa.Index('ix_program_day_goals_goal_id', 'goal_id')
)

class GoalLevel(Base):
    __tablename__ = 'goal_levels'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False) # e.g. "Long Term Goal", "Immediate Goal"
    rank = Column(Integer, nullable=False, default=0) # 0 is highest level
    color = Column(String, nullable=True)
    secondary_color = Column(String, nullable=True)
    icon = Column(String, nullable=True)
    
    # Customization Fields
    owner_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    root_id = Column(String, nullable=True, index=True) # If tied to a specific fractal project
    
    # Characteristics Overrides
    track_activities = Column(Boolean, default=True)
    requires_smart = Column(Boolean, default=False)
    
    # Deadline constraints (value + unit pairs, e.g. value=2, unit='years')
    deadline_min_value = Column(Integer, nullable=True)
    deadline_min_unit = Column(String, nullable=True)  # minutes, hours, days, weeks, months, years, decades
    deadline_max_value = Column(Integer, nullable=True)
    deadline_max_unit = Column(String, nullable=True)
    
    # Hierarchy behavior
    max_children = Column(Integer, nullable=True)  # null = unlimited

    # Content requirements
    description_required = Column(Boolean, default=False)
    default_deadline_offset_value = Column(Integer, nullable=True)
    default_deadline_offset_unit = Column(String, nullable=True)
    
    # Display
    sort_children_by = Column(String, nullable=True)  # 'manual', 'deadline', 'created_at', 'completion_rate'

    # Long-horizon levels review their goals (SMART's R), on this default cadence.
    uses_reviews = Column(Boolean, nullable=False, default=False, server_default=sa.false())
    review_cadence_value = Column(Integer, nullable=True)
    review_cadence_unit = Column(String, nullable=True)  # days, weeks, months, years
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)

    __table_args__ = _review_cadence_checks('goal_levels')

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
    completion_source = Column(String, nullable=True)
    completion_reason = Column(String, nullable=True)
    manually_uncompleted_at = Column(DateTime, nullable=True)
    completed_session_id = Column(
        String,
        ForeignKey(
            'sessions.id',
            ondelete='SET NULL',
            name='fk_goals_completed_session_id_sessions',
            use_alter=True,
        ),
        nullable=True,
    )
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    parent_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=True)
    sort_order = Column(Integer, default=0)
    root_id = Column(String, nullable=True, index=True)
    owner_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True)
    
    is_smart = Column(Boolean, default=False)
    inherit_parent_activities = Column(Boolean, default=False, nullable=False)
    track_activities = Column(Boolean, default=True)
    paused = Column(Boolean, default=False)
    paused_at = Column(DateTime, nullable=True)
    # Exactly one way a goal completes on its own; manual override is always available.
    completion_condition = Column(
        String, nullable=False, default=COMPLETION_CONDITION_MANUAL,
        server_default=COMPLETION_CONDITION_MANUAL,
    )
    # Start of the goal's active period: evidence before it never counts.
    started_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.func.now())
    # Reviews: an own cadence overrides the level's; reviews can be turned off or put off to a date.
    review_cadence_value = Column(Integer, nullable=True)
    review_cadence_unit = Column(String, nullable=True)
    review_disabled = Column(Boolean, nullable=False, default=False, server_default=sa.false())
    review_deferred_until = Column(DateTime, nullable=True)
    sequence_track_id = Column(
        String,
        ForeignKey(
            'goal_sequence_tracks.id', ondelete='SET NULL',
            name='fk_goals_sequence_track_id_goal_sequence_tracks', use_alter=True,
        ),
        nullable=True,
        index=True,
    )
    sequence_position = Column(Integer, nullable=True)
    progress_settings = Column(JSON_TYPE, nullable=True)  # Root-level progress config (ignored on non-root goals)
    row_version = Column(Integer, nullable=False, default=1, server_default=sa.text('1'))
    
    __table_args__ = (
        sa.Index('ix_goals_root_deleted_level', 'root_id', 'deleted_at', 'level_id'),
        sa.Index('ix_goals_root_parent_deleted', 'root_id', 'parent_id', 'deleted_at'),
        # Child lookups that do not filter by root (completion cascade, agent tree walks).
        sa.Index('ix_goals_parent_deleted', 'parent_id', 'deleted_at'),
        sa.Index('ix_goals_completed_session_id', 'completed_session_id'),
        sa.Index(
            'uq_goals_sequence_track_position', 'sequence_track_id', 'sequence_position', unique=True,
            postgresql_where=sa.text('sequence_track_id IS NOT NULL AND deleted_at IS NULL'),
            sqlite_where=sa.text('sequence_track_id IS NOT NULL AND deleted_at IS NULL'),
        ),
        CheckConstraint(
            f"completion_condition IN {COMPLETION_CONDITIONS_SQL}", name='ck_goals_completion_condition',
        ),
        CheckConstraint(
            f"completion_source IS NULL OR completion_source IN {COMPLETION_SOURCES_SQL}",
            name='ck_goals_completion_source',
        ),
        CheckConstraint(
            'sequence_track_id IS NULL OR sequence_position IS NOT NULL', name='ck_goals_sequence_pair',
        ),
        *_review_cadence_checks('goals'),
    )
    __mapper_args__ = {'version_id_col': row_version}

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
    completed_session = relationship("Session", foreign_keys=[completed_session_id])
    # Live links only: removed link rows and deleted groups never read as associations.
    associated_activities = relationship(
        "ActivityDefinition",
        secondary=activity_goal_associations,
        primaryjoin="and_(Goal.id == activity_goal_associations.c.goal_id, "
                    "activity_goal_associations.c.deleted_at.is_(None))",
        secondaryjoin="ActivityDefinition.id == activity_goal_associations.c.activity_id",
        back_populates="associated_goals",
        viewonly=True
    )
    # At most one live group (uq_goal_activity_group_associations_one_active); a list for loaders.
    associated_activity_groups = relationship(
        "ActivityGroup",
        secondary=goal_activity_group_associations,
        primaryjoin="and_(Goal.id == goal_activity_group_associations.c.goal_id, "
                    "goal_activity_group_associations.c.deleted_at.is_(None))",
        secondaryjoin="and_(ActivityGroup.id == goal_activity_group_associations.c.activity_group_id, "
                      "ActivityGroup.deleted_at.is_(None))",
        back_populates="associated_goals",
        viewonly=True
    )
    condition = relationship(
        "GoalCompletionCondition",
        primaryjoin="and_(Goal.id == GoalCompletionCondition.goal_id, GoalCompletionCondition.deleted_at.is_(None))",
        uselist=False,
        viewonly=True,
    )
    sequence_track = relationship("GoalSequenceTrack", foreign_keys=[sequence_track_id])
    # Media attached to the description. Read on demand (GET …/goals/<id>/attachments); serialized only when loaded.
    attachments = relationship("GoalAttachment", order_by="GoalAttachment.position", passive_deletes=True)
    pause_intervals = relationship(
        "GoalPauseInterval",
        back_populates="goal",
        cascade="all, delete-orphan",
        order_by="GoalPauseInterval.paused_at",
        foreign_keys="GoalPauseInterval.goal_id",
    )

    def __repr__(self):
        return f"<Goal(id={self.id}, name={self.name})>"


class GoalPauseInterval(Base):
    """
    Durable record of each pause window for a goal.

    An open interval (resumed_at is NULL) means the goal is currently paused.
    Activity performed while a timestamp falls inside any interval must never
    count as evidence toward the goal, even after the goal is resumed.
    """
    __tablename__ = 'goal_pause_intervals'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    goal_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    root_id = Column(String, nullable=True, index=True)
    paused_at = Column(DateTime, nullable=False)
    resumed_at = Column(DateTime, nullable=True)
    # 'sequence' pauses hold a goal until its predecessor in a sequence track completes.
    reason = Column(String, nullable=False, default=PAUSE_REASON_MANUAL, server_default=PAUSE_REASON_MANUAL)
    # Set when completing another goal resumed this one, so un-completion can re-pause exactly.
    resumed_by_goal_id = Column(
        String,
        ForeignKey('goals.id', ondelete='SET NULL', name='fk_goal_pause_intervals_resumed_by_goal_id_goals'),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=utc_now)

    goal = relationship("Goal", back_populates="pause_intervals", foreign_keys=[goal_id])

    __table_args__ = (
        sa.Index('ix_goal_pause_intervals_goal_resumed', 'goal_id', 'resumed_at'),
        CheckConstraint("reason IN ('manual', 'sequence')", name='ck_goal_pause_intervals_reason'),
    )


class GoalSequenceTrack(Base):
    """An ordered progression of same-level sibling goals under one parent."""
    __tablename__ = 'goal_sequence_tracks'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    parent_goal_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    level_id = Column(String, ForeignKey('goal_levels.id'), nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)


class GoalCompletionCondition(Base):
    """The activity threshold a goal completes on (one live row per goal).

    single_session: one activity instance reaches `min_sets` sets meeting every rule
        (measure 'sets'), or its total yield reaches `target_value` (measure 'yield').
    cumulative: the summed metric (measure 'metric') or yield (measure 'yield') across the
        goal's active period reaches `target_value`.
    consistency: `required_count` instances in the active period each have `min_sets` (default 1)
        sets meeting every rule (any completed instance counts when there are no rules); with `consecutive`,
        they must be logged in a row, so a logged instance that misses resets the count.

    `set_aggregate = 'average'` (single_session and consistency, measure 'sets'): instead of
    individual sets meeting every rule, a session qualifies when the average of each rule's metric
    across all of its counted sets meets the rule, over at least `min_sets` sets.

    `tags` narrows the evidence: only sets carrying every tag count (`tag_match = 'exact'`: only
    sets whose effective tags are exactly these) (a set inherits its
    instance's tags; an activity without sets is one implicit set).
    """
    __tablename__ = 'goal_completion_conditions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    goal_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    activity_definition_id = Column(
        String, ForeignKey('activity_definitions.id', ondelete='CASCADE'), nullable=False, index=True,
    )
    name = Column(String(CONDITION_NAME_MAX_LENGTH), nullable=True)  # None: described from the rules
    kind = Column(String, nullable=False)
    measure = Column(String, nullable=False)
    min_sets = Column(Integer, nullable=True)
    required_count = Column(Integer, nullable=True)
    metric_definition_id = Column(String, ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=True)
    operator = Column(String, nullable=True)
    target_value = Column(sa.Numeric(14, 4), nullable=True)
    consecutive = Column(Boolean, nullable=False, default=False, server_default=sa.text('false'))
    set_aggregate = Column(String, nullable=False, default='each', server_default='each')
    # How counted sets match `tags`: 'contains' (every tag, others allowed) or 'exact' (just these).
    tag_match = Column(String, nullable=False, default='contains', server_default='contains')
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)

    __table_args__ = (
        sa.Index(
            'uq_goal_completion_conditions_live_goal', 'goal_id', unique=True,
            postgresql_where=sa.text('deleted_at IS NULL'), sqlite_where=sa.text('deleted_at IS NULL'),
        ),
        CheckConstraint("kind IN ('single_session', 'cumulative', 'consistency')", name='ck_goal_conditions_kind'),
        CheckConstraint(
            "(kind = 'single_session' AND measure IN ('sets', 'yield'))"
            " OR (kind = 'cumulative' AND measure IN ('metric', 'yield'))"
            " OR (kind = 'consistency' AND measure = 'sets')",
            name='ck_goal_conditions_kind_measure',
        ),
        CheckConstraint("measure <> 'sets' OR kind <> 'single_session' OR min_sets >= 1", name='ck_goal_conditions_min_sets'),
        CheckConstraint("kind <> 'consistency' OR required_count >= 1", name='ck_goal_conditions_required_count'),
        CheckConstraint(
            "measure NOT IN ('yield', 'metric') OR (target_value IS NOT NULL AND operator IN ('>=', '>', '<=', '<'))",
            name='ck_goal_conditions_total',
        ),
        CheckConstraint("measure <> 'metric' OR metric_definition_id IS NOT NULL", name='ck_goal_conditions_metric'),
        CheckConstraint("NOT consecutive OR kind = 'consistency'", name='ck_goal_conditions_consecutive'),
        CheckConstraint(
            "set_aggregate = 'each' OR (set_aggregate = 'average' AND measure = 'sets'"
            " AND kind IN ('single_session', 'consistency') AND min_sets >= 1)",
            name='ck_goal_conditions_set_aggregate',
        ),
        CheckConstraint("tag_match IN ('contains', 'exact')", name='ck_goal_conditions_tag_match'),
    )

    goal = relationship("Goal", foreign_keys=[goal_id])
    activity = relationship("ActivityDefinition")
    metric = relationship("MetricDefinition", foreign_keys=[metric_definition_id])
    rules = relationship(
        "GoalConditionMetricRule", back_populates="condition", cascade="all, delete-orphan",
        order_by="GoalConditionMetricRule.position",
    )
    tags = relationship(
        "ActivityTagDefinition", secondary="goal_condition_tags",
        order_by="(ActivityTagDefinition.sort_order, ActivityTagDefinition.name, ActivityTagDefinition.id)",
    )


class GoalConditionMetricRule(Base):
    """One metric comparison every qualifying set must satisfy."""
    __tablename__ = 'goal_condition_metric_rules'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    condition_id = Column(
        String, ForeignKey('goal_completion_conditions.id', ondelete='CASCADE'), nullable=False, index=True,
    )
    metric_definition_id = Column(String, ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=False)
    operator = Column(String, nullable=False)
    value = Column(sa.Numeric(14, 4), nullable=False)
    position = Column(Integer, nullable=False, default=0, server_default=sa.text('0'))

    __table_args__ = (
        sa.UniqueConstraint('condition_id', 'metric_definition_id', name='uq_goal_condition_rule_metric'),
        CheckConstraint("operator IN ('>=', '>', '<=', '<', '==')", name='ck_goal_condition_rules_operator'),
    )

    condition = relationship("GoalCompletionCondition", back_populates="rules")
    metric = relationship("MetricDefinition")


class GoalConditionTag(Base):
    """A tag every set counted toward a condition must carry."""
    __tablename__ = 'goal_condition_tags'

    condition_id = Column(
        String, ForeignKey('goal_completion_conditions.id', ondelete='CASCADE'), primary_key=True,
    )
    tag_definition_id = Column(
        String, ForeignKey('activity_tag_definitions.id', ondelete='CASCADE'), primary_key=True,
    )

    __table_args__ = (
        sa.Index('ix_goal_condition_tags_tag', 'tag_definition_id', 'condition_id'),
    )


# A condition and its tags share a fractal, whatever the write path.
GOAL_CONDITION_TAG_TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION enforce_goal_condition_tag_root() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM goal_completion_conditions condition_row
        JOIN activity_tag_definitions tag ON tag.root_id = condition_row.root_id
        WHERE condition_row.id = NEW.condition_id AND tag.id = NEW.tag_definition_id
    ) THEN
        RAISE EXCEPTION 'condition and tag must share a fractal' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_goal_condition_tags_root ON goal_condition_tags;
CREATE TRIGGER trg_goal_condition_tags_root BEFORE INSERT OR UPDATE ON goal_condition_tags
FOR EACH ROW EXECUTE FUNCTION enforce_goal_condition_tag_root();
"""


def _install_goal_condition_tag_trigger(_target, connection, **_kwargs):
    if connection.dialect.name == 'postgresql':
        connection.exec_driver_sql(GOAL_CONDITION_TAG_TRIGGER_SQL)


event.listen(GoalConditionTag.__table__, 'after_create', _install_goal_condition_tag_trigger)

def get_all_root_goals(db_session):
    from sqlalchemy.orm import selectinload
    return db_session.query(Goal).options(
        selectinload(Goal.associated_activities),
        selectinload(Goal.associated_activity_groups),
        selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children)
    ).filter(
        Goal.parent_id == None,
        Goal.deleted_at == None,
    ).all()

def get_goal_by_id(db_session, goal_id, load_associations=True, include_deleted=False):
    from sqlalchemy.orm import selectinload
    query = db_session.query(Goal)
    if load_associations:
        query = query.options(
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups),
            selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children).selectinload(Goal.children)
        )
    query = query.filter(Goal.id == goal_id)
    if not include_deleted:
        query = query.filter(Goal.deleted_at == None)
    return query.first()

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
