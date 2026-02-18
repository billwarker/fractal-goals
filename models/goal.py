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
    Column('goal_type', String, nullable=False),  # 'short_term' or 'immediate'
    Column('created_at', DateTime, default=utc_now)
)

# Junction table for linking Activities to Goals
activity_goal_associations = Table(
    'activity_goal_associations', Base.metadata,
    Column('activity_id', String, ForeignKey('activity_definitions.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now)
)

# Junction table for linking Activity GROUPS to Goals
goal_activity_group_associations = Table(
    'goal_activity_group_associations', Base.metadata,
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('activity_group_id', String, ForeignKey('activity_groups.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now)
)

# Junction table for linking Session Templates to Goals
session_template_goals = Table(
    'session_template_goals', Base.metadata,
    Column('session_template_id', String, ForeignKey('session_templates.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now)
)

# Junction table for linking Program Days to Goals
program_day_goals = Table(
    'program_day_goals', Base.metadata,
    Column('program_day_id', String, ForeignKey('program_days.id', ondelete='CASCADE'), primary_key=True),
    Column('goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=utc_now)
)

class Goal(Base):
    """
    Represents all nodes in the fractal goal tree.
    """
    __tablename__ = 'goals'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String, nullable=False)
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
        CheckConstraint(
            type.in_([
                'UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal',
                'ImmediateGoal', 'MicroGoal', 'NanoGoal'
            ]),
            name='valid_goal_type'
        ),
        sa.Index('ix_goals_root_deleted_type', 'root_id', 'deleted_at', 'type'),
        sa.Index('ix_goals_root_parent_deleted', 'root_id', 'parent_id', 'deleted_at'),
    )
    
    __mapper_args__ = {
        'polymorphic_on': type,
        'polymorphic_identity': 'Goal'
    }

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

class Target(Base):
    __tablename__ = 'targets'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    goal_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    activity_id = Column(String, ForeignKey('activity_definitions.id', ondelete='SET NULL'), nullable=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, default='threshold')
    metrics = Column(JSON_TYPE, nullable=True)
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
    
    goal = relationship("Goal", back_populates="targets_rel", foreign_keys=[goal_id])
    activity = relationship("ActivityDefinition")
    completed_session = relationship("Session", foreign_keys=[completed_session_id])
    completed_instance = relationship("ActivityInstance", foreign_keys=[completed_instance_id])

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

