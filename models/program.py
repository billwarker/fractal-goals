from sqlalchemy import Column, String, Boolean, DateTime, Date, Integer, Float, ForeignKey, Text, Table, CheckConstraint, UniqueConstraint, Index
from sqlalchemy import DDL, event, func, text
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import backref, relationship
import uuid
from .base import Base, utc_now, JSON_TYPE

# Junction table for linking ProgramDays to multiple SessionTemplates
program_day_templates = Table(
    'program_day_templates', Base.metadata,
    Column('program_day_id', String, ForeignKey('program_days.id', ondelete='CASCADE'), primary_key=True),
    Column('session_template_id', String, ForeignKey('session_templates.id', ondelete='CASCADE'), primary_key=True),
    Column('order', Integer, default=0),
    Column('is_required', Boolean, nullable=False, default=True),
    # Reverse lookup; the composite primary key leads with the other column.
    Index('ix_program_day_templates_session_template_id', 'session_template_id')
)

# Junction table for linking Programs to Goals
program_goals = Table(
    'program_goals', Base.metadata,
    Column('program_id', String, ForeignKey('programs.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now),
    # Reverse lookup; the composite primary key leads with the other column.
    Index('ix_program_goals_goal_id', 'goal_id')
)

# Junction table for linking ProgramBlocks to Goals
program_block_goals = Table(
    'program_block_goals', Base.metadata,
    Column('program_block_id', String, ForeignKey('program_blocks.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now),
    # Reverse lookup; the composite primary key leads with the other column.
    Index('ix_program_block_goals_goal_id', 'goal_id')
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
    # Program days belong to the program; blocks only label and group the dates they cover.
    days = relationship(
        "ProgramDay",
        back_populates="program",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProgramDay.day_number",
    )
    day_status_overrides = relationship(
        "ProgramDayStatusOverride",
        back_populates="program",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    day_session_credits = relationship(
        "ProgramDaySessionCredit",
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
    # Week tracking: Week 1 starts on start_date; each later week starts on
    # week_start_day (Python weekday, 0 = Monday). See services/program_rollups.block_weeks.
    track_weeks = Column(Boolean, nullable=False, default=False, server_default='false')
    week_start_day = Column(Integer, nullable=True)
    row_version = Column(Integer, nullable=False, default=1, server_default='1')
    __mapper_args__ = {'version_id_col': row_version}
    # Backstop for the service guard in services/program_calendar_invariants.py:
    # dated blocks in one program never overlap (inclusive ranges).
    __table_args__ = (
        CheckConstraint(
            'start_date IS NULL OR end_date IS NULL OR start_date <= end_date',
            name='ck_program_blocks_date_order',
        ),
        CheckConstraint(
            'week_start_day IS NULL OR (week_start_day >= 0 AND week_start_day <= 6)',
            name='ck_program_blocks_week_start_day',
        ),
        CheckConstraint(
            'NOT track_weeks OR week_start_day IS NOT NULL',
            name='ck_program_blocks_track_weeks_start_day',
        ),
        ExcludeConstraint(
            (program_id, '='),
            (func.daterange(start_date, end_date, text("'[]'")), '&&'),
            name='ex_program_blocks_no_overlap',
            using='gist',
            where=text('start_date IS NOT NULL AND end_date IS NOT NULL'),
        ),
    )
    
    program = relationship("Program", back_populates="blocks")
    # program_block_goals is retained data only; blocks no longer carry goals.

event.listen(
    ProgramBlock.__table__,
    'before_create',
    DDL('CREATE EXTENSION IF NOT EXISTS btree_gist').execute_if(dialect='postgresql'),
)


class ProgramDay(Base):
    __tablename__ = 'program_days'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_id = Column(String, ForeignKey('programs.id', ondelete='CASCADE'), nullable=False, index=True)

    # Sidebar order within the program.
    day_number = Column(Integer, nullable=True)
    name = Column(String)
    notes = Column(Text)
    is_completed = Column(Boolean, default=False)
    
    day_of_week = Column(JSON_TYPE)
    repeat_every_weeks = Column(Integer, nullable=False, default=1, server_default='1')
    __table_args__ = (CheckConstraint('repeat_every_weeks >= 1', name='ck_program_days_repeat_every_weeks_positive'),)
    completion_min_templates = Column(Integer, nullable=True)
    row_version = Column(Integer, nullable=False, default=1, server_default='1')
    __mapper_args__ = {'version_id_col': row_version}

    program = relationship("Program", back_populates="days")
    # template_links is the only writable path to program_day_templates; templates is a
    # read projection of it, so a delete never removes the same association rows twice.
    template_links = relationship(
        "ProgramDayTemplate",
        back_populates="program_day",
        cascade="all, delete-orphan",
        order_by=program_day_templates.c.order,
    )
    templates = relationship(
        "SessionTemplate",
        secondary=program_day_templates,
        order_by="program_day_templates.c.order",
        viewonly=True,
    )
    completed_sessions = relationship("Session", back_populates="program_day")
    # Explicit dates a reusable definition was scheduled on; always batch-loaded
    # because the canonical occurrence evaluator reads them with every day.
    occurrence_schedules = relationship(
        "ProgramDayOccurrenceSchedule",
        back_populates="program_day",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
        order_by="ProgramDayOccurrenceSchedule.date",
    )
    
    occurrence_exclusions = relationship(
        "ProgramDayOccurrenceExclusion", back_populates="program_day",
        cascade="all, delete-orphan", passive_deletes=True, lazy="selectin",
        order_by="ProgramDayOccurrenceExclusion.date",
    )

    # Activities that count toward the day besides its session templates (any session that date).
    activity_conditions = relationship(
        "ProgramDayActivityCondition",
        back_populates="program_day",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProgramDayActivityCondition.order",
    )

    goals = relationship(
        "Goal",
        secondary="program_day_goals",
        secondaryjoin="and_(Goal.id == program_day_goals.c.goal_id, program_day_goals.c.deleted_at == None)",
        backref="program_days",
        viewonly=True
    )

class ProgramDayTemplate(Base):
    __table__ = program_day_templates

    program_day = relationship("ProgramDay", back_populates="template_links")
    template = relationship("SessionTemplate")

class ProgramDayActivityCondition(Base):
    """An activity a program day asks for: met by any completed instance of it on the occurrence's date,
    in any session (a quick session included). With `tags`, only an instance with a set (or the
    instance itself, when it has no sets) carrying every tag counts; `tag_match = 'exact'`: just these tags.

    It counts with the day's templates: required items must all be done, and `completion_min_templates`
    counts templates and activities together.
    """
    __tablename__ = 'program_day_activity_conditions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_day_id = Column(String, ForeignKey('program_days.id', ondelete='CASCADE'), nullable=False, index=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    activity_definition_id = Column(
        String, ForeignKey('activity_definitions.id', ondelete='CASCADE'), nullable=False, index=True,
    )
    is_required = Column(Boolean, nullable=False, default=True, server_default=text('true'))
    order = Column(Integer, nullable=False, default=0, server_default='0')
    tag_match = Column(String, nullable=False, default='contains', server_default='contains')
    created_at = Column(DateTime, default=utc_now)

    __table_args__ = (
        CheckConstraint("tag_match IN ('contains', 'exact')", name='ck_program_day_activity_conditions_tag_match'),
    )

    program_day = relationship("ProgramDay", back_populates="activity_conditions")
    activity = relationship("ActivityDefinition")
    tags = relationship(
        "ActivityTagDefinition", secondary="program_day_activity_condition_tags",
        order_by="(ActivityTagDefinition.sort_order, ActivityTagDefinition.name, ActivityTagDefinition.id)",
    )


class ProgramDayActivityConditionTag(Base):
    """A tag the activity counted toward a program day's condition must carry."""
    __tablename__ = 'program_day_activity_condition_tags'

    condition_id = Column(
        String, ForeignKey('program_day_activity_conditions.id', ondelete='CASCADE'), primary_key=True,
    )
    tag_definition_id = Column(
        String, ForeignKey('activity_tag_definitions.id', ondelete='CASCADE'), primary_key=True,
    )

    __table_args__ = (
        Index('ix_program_day_activity_condition_tags_tag', 'tag_definition_id', 'condition_id'),
    )


# A day's activity condition and its tags share a fractal, whatever the write path.
PROGRAM_DAY_ACTIVITY_CONDITION_TAG_TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION enforce_program_day_activity_condition_tag_root() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM program_day_activity_conditions condition_row
        JOIN activity_tag_definitions tag ON tag.root_id = condition_row.root_id
        WHERE condition_row.id = NEW.condition_id AND tag.id = NEW.tag_definition_id
    ) THEN
        RAISE EXCEPTION 'condition and tag must share a fractal' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_program_day_activity_condition_tags_root ON program_day_activity_condition_tags;
CREATE TRIGGER trg_program_day_activity_condition_tags_root
BEFORE INSERT OR UPDATE ON program_day_activity_condition_tags
FOR EACH ROW EXECUTE FUNCTION enforce_program_day_activity_condition_tag_root();
"""


def _install_program_day_activity_condition_tag_trigger(_target, connection, **_kwargs):
    if connection.dialect.name == 'postgresql':
        connection.exec_driver_sql(PROGRAM_DAY_ACTIVITY_CONDITION_TAG_TRIGGER_SQL)


event.listen(
    ProgramDayActivityConditionTag.__table__, 'after_create', _install_program_day_activity_condition_tag_trigger,
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

    # The ledger belongs to its day: deleting the day removes its rows (the FK cascades too).
    program_day = relationship(
        "ProgramDay",
        backref=backref("day_sessions", cascade="all, delete-orphan", passive_deletes=True),
    )
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


class ProgramDayOccurrenceSchedule(Base):
    """One explicit date on which a reusable program-day definition occurs."""

    __tablename__ = 'program_day_occurrence_schedules'
    __table_args__ = (
        UniqueConstraint('program_day_id', 'date', name='uq_program_day_occurrence_schedule_day_date'),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_day_id = Column(
        String, ForeignKey('program_days.id', ondelete='CASCADE'), nullable=False, index=True,
    )
    date = Column(Date, nullable=False, index=True)
    created_by_user_id = Column(String, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)

    program_day = relationship('ProgramDay', back_populates='occurrence_schedules')


class ProgramDayOccurrenceExclusion(Base):
    """Suppress one occurrence without changing the reusable weekday schedule."""
    __tablename__ = 'program_day_occurrence_exclusions'
    __table_args__ = (
        UniqueConstraint('program_day_id', 'date', name='uq_program_day_occurrence_exclusion_day_date'),
    )
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_day_id = Column(String, ForeignKey('program_days.id', ondelete='CASCADE'), nullable=False, index=True)
    date = Column(Date, nullable=False)
    created_by_user_id = Column(String, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    program_day = relationship('ProgramDay', back_populates='occurrence_exclusions')


class ProgramDaySessionCredit(Base):
    """A user's explicit credit or exclusion of one session for one program date.

    ``credit`` counts the session as ``template_id`` on that date; ``exclude``
    removes an automatic (linked or template-matched) credit. Rows only apply
    while the session's effective local date equals ``date``.
    """

    __tablename__ = 'program_day_session_credits'
    __table_args__ = (
        UniqueConstraint(
            'program_id', 'date', 'session_id',
            name='uq_program_day_session_credit_program_date_session',
        ),
        CheckConstraint(
            "disposition IN ('credit', 'exclude')",
            name='ck_program_day_session_credit_disposition',
        ),
        CheckConstraint(
            "(disposition = 'credit' AND template_id IS NOT NULL)"
            " OR (disposition = 'exclude' AND template_id IS NULL)",
            name='ck_program_day_session_credit_template',
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    program_id = Column(String, ForeignKey('programs.id', ondelete='CASCADE'), nullable=False, index=True)
    date = Column(Date, nullable=False)
    session_id = Column(String, ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False, index=True)
    disposition = Column(String, nullable=False)
    template_id = Column(String, ForeignKey('session_templates.id', ondelete='CASCADE'), nullable=True)
    set_by_user_id = Column(String, ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)

    program = relationship('Program', back_populates='day_session_credits')


class ProgramSessionPlan(Base):
    """A dated plan of one template for one program-day occurrence.

    ``plan_data`` is an independent snapshot of the template's ``sections`` whose
    activity items may carry ``prescription`` values and notes. Template edits never
    rewrite it; ``source_template_revision`` records which revision it copied. A plan
    whose date stops being an occurrence of its day is dormant, not deleted.
    """

    __tablename__ = 'program_session_plans'
    __table_args__ = (
        Index(
            'uq_program_session_plans_day_template_date',
            'program_day_id', 'session_template_id', 'date',
            unique=True,
            postgresql_where=text('deleted_at IS NULL'),
        ),
        Index('ix_program_session_plans_root_template_date', 'root_id', 'session_template_id', 'date'),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False)
    program_id = Column(String, ForeignKey('programs.id', ondelete='CASCADE'), nullable=False, index=True)
    program_day_id = Column(String, ForeignKey('program_days.id', ondelete='CASCADE'), nullable=False)
    session_template_id = Column(
        String, ForeignKey('session_templates.id', ondelete='CASCADE'), nullable=False, index=True,
    )
    date = Column(Date, nullable=False)
    plan_data = Column(JSON_TYPE, nullable=False)
    source_template_revision = Column(Integer, nullable=False, default=1, server_default='1')
    seeded_from_plan_id = Column(
        String, ForeignKey('program_session_plans.id', ondelete='SET NULL'), nullable=True,
    )
    created_by_user_id = Column(String, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    row_version = Column(Integer, nullable=False, default=1, server_default='1')

    __mapper_args__ = {'version_id_col': row_version}

    program_day = relationship('ProgramDay')
    template = relationship('SessionTemplate')


def program_day_activity_condition_loads(day_load):
    """Eager loads for the days' activity conditions under ``day_load`` (a loader of ProgramDay),
    so evaluating or serializing many days reads them in a fixed number of queries."""
    conditions = day_load.selectinload(ProgramDay.activity_conditions)
    return [
        conditions.selectinload(ProgramDayActivityCondition.tags),
        conditions.joinedload(ProgramDayActivityCondition.activity),
    ]


def get_program_day_activity_rules(day):
    """The day's activity conditions, in order, skipping deleted activities (as templates are skipped)."""
    conditions = sorted(getattr(day, 'activity_conditions', None) or [], key=lambda condition: condition.order or 0)
    return [
        {
            'condition': condition,
            'condition_id': condition.id,
            'activity_definition_id': condition.activity_definition_id,
            'is_required': bool(condition.is_required),
            'order': condition.order or 0,
            'tag_ids': frozenset(tag.id for tag in condition.tags),
            'tag_match': condition.tag_match or 'contains',
        }
        for condition in conditions
        if condition.activity is not None and not getattr(condition.activity, 'deleted_at', None)
    ]


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
