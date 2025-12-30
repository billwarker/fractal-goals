
from sqlalchemy import create_engine, Column, String, Boolean, DateTime, Integer, ForeignKey, Table, CheckConstraint, Float, Text
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, backref
from datetime import datetime
import uuid
import json

Base = declarative_base()

# Junction table for linking PracticeSessions to multiple ShortTermGoals
practice_session_goals = Table(
    'practice_session_goals', Base.metadata,
    Column('practice_session_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True),
    Column('short_term_goal_id', String, ForeignKey('goals.id', ondelete='CASCADE'), primary_key=True)
)

class Goal(Base):
    """
    Represents all nodes in the fractal goal tree, including Practice Sessions.
    
    Single Table Inheritance is used to distinguish types.
    """
    __tablename__ = 'goals'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    deadline = Column(DateTime, nullable=True)
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    parent_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=True)
    
    # Practice Session specific fields (nullable for other goals)
    root_id = Column(String, nullable=True) # Useful for all goals? Or just PS?
    duration_minutes = Column(Integer, nullable=True)
    session_data = Column(Text, nullable=True) # JSON
    
    # JSON Plans/Targets
    targets = Column(Text, nullable=True)
    
    __table_args__ = (
        CheckConstraint(
            type.in_([
                'UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal',
                'PracticeSession', 'ImmediateGoal', 'MicroGoal', 'NanoGoal'
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


    def to_dict(self, include_children=True):
        """Convert goal to dictionary format compatible with frontend."""
        result = {
            "name": self.name,
            "id": self.id,
            "attributes": {
                "id": self.id,
                "type": self.type,
                "description": self.description,
                "deadline": self.deadline.isoformat() if self.deadline else None,
                "completed": self.completed,
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "updated_at": self.updated_at.isoformat() if self.updated_at else None,
                "targets": json.loads(self.targets) if self.targets else [],
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



class PracticeSession(Goal):
    """
    PracticeSession is now a node in the Goal tree.
    """
    __mapper_args__ = {
        'polymorphic_identity': 'PracticeSession',
    }
    
    # Relationship to Activity Instances (One-to-Many)
    activity_instances = relationship(
        "ActivityInstance",
        backref="practice_session",
        cascade="all, delete-orphan",
        foreign_keys="ActivityInstance.practice_session_id"
    )

    # Many-to-Many with ShortTermGoal (linked via junction)
    # This allows a session to satisfy targets for multiple goals
    parent_goals = relationship(
        "Goal",
        secondary=practice_session_goals,
        primaryjoin="PracticeSession.id==practice_session_goals.c.practice_session_id",
        secondaryjoin="Goal.id==practice_session_goals.c.short_term_goal_id",
        backref="linked_practice_sessions",
        viewonly=False # explicit
    )
    
    def to_dict(self, include_children=True):
        # Result uses basic Goal structure but adds PS fields
        result = super().to_dict(include_children)
        result["attributes"]["duration_minutes"] = self.duration_minutes
        
        # Parse session_data if needed, or rely on relational activities now?
        # The frontend might still expect 'session_data' blob or might expect new 'activities' list.
        # For backward compatibility, we send session_data if explicitly asked, 
        # OR we reconstruct it from ActivityInstances!
        # Let's send raw session_data for now if it exists, as frontend hasn't been updated to use relational endpoints yet.
        if self.session_data:
             try:
                 result["attributes"]["session_data"] = json.loads(self.session_data)
             except:
                 pass
        
        # Parent IDs (Combine primary parent_id and any secondary parents)
        # Note: In new creation logic, parent_id should be in parent_goals list too.
        # So we just can use parent_goals if populated.
        p_ids = [g.id for g in self.parent_goals]
        if self.parent_id and self.parent_id not in p_ids:
             p_ids.append(self.parent_id)
        
        result["attributes"]["parent_ids"] = p_ids
        
        return result


class ActivityDefinition(Base):
    __tablename__ = 'activity_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default='')
    created_at = Column(DateTime, default=datetime.now)
    has_sets = Column(Boolean, default=False)
    has_metrics = Column(Boolean, default=True)
    metrics_multiplicative = Column(Boolean, default=False)  # When true, allows metric1 × metric2 × ... derived value
    has_splits = Column(Boolean, default=False)  # When true, activity can be split into multiple portions (e.g., left/right)

    metric_definitions = relationship("MetricDefinition", backref="activity_definition", cascade="all, delete-orphan")
    split_definitions = relationship("SplitDefinition", backref="activity_definition", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "has_sets": self.has_sets,
            "has_metrics": self.has_metrics,
            "metrics_multiplicative": self.metrics_multiplicative,
            "has_splits": self.has_splits,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "metric_definitions": [m.to_dict() for m in self.metric_definitions],
            "split_definitions": [s.to_dict() for s in self.split_definitions]
        }

class MetricDefinition(Base):
    __tablename__ = 'metric_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False)
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    deleted_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    is_top_set_metric = Column(Boolean, default=False)  # Determines which metric defines "top set"
    is_multiplicative = Column(Boolean, default=True)   # Include in product calculations

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
    name = Column(String, nullable=False)  # e.g., "Left", "Right", "Split #1"
    order = Column(Integer, nullable=False)  # Display order
    created_at = Column(DateTime, default=datetime.now)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "order": self.order
        }

class ActivityInstance(Base):
    __tablename__ = 'activity_instances'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # practice_session_id points to goals.id because PracticeSession is a Goal
    practice_session_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False)
    activity_definition_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    time_start = Column(DateTime, nullable=True)
    time_stop = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)

    metric_values = relationship("MetricValue", backref="activity_instance", cascade="all, delete-orphan")
    definition = relationship("ActivityDefinition")

    def to_dict(self):
        return {
            "id": self.id,
            "practice_session_id": self.practice_session_id,
            "activity_definition_id": self.activity_definition_id,
            "definition_name": self.definition.name if self.definition else "Unknown",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "time_start": self.time_start.isoformat() if self.time_start else None,
            "time_stop": self.time_stop.isoformat() if self.time_stop else None,
            "duration_seconds": self.duration_seconds,
            "metric_values": [m.to_dict() for m in self.metric_values]
        }

class MetricValue(Base):
    __tablename__ = 'metric_values'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='CASCADE'), nullable=False)
    metric_definition_id = Column(String, ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=False)
    split_definition_id = Column(String, ForeignKey('split_definitions.id', ondelete='RESTRICT'), nullable=True)  # Nullable for non-split activities
    value = Column(Float, nullable=False)

    definition = relationship("MetricDefinition")
    split = relationship("SplitDefinition")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.definition.name if self.definition else "",
            "value": self.value,
            "unit": self.definition.unit if self.definition else "",
            "split_id": self.split_definition_id,
            "split_name": self.split.name if self.split else None
        }

class SessionTemplate(Base):
    __tablename__ = 'session_templates'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, default='')
    root_id = Column(String, ForeignKey('goals.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    template_data = Column(String, nullable=False)
    
    def to_dict(self):
        return {"id": self.id, "name": self.name, "template_data": json.loads(self.template_data) if self.template_data else {}}


# Database Helper Functions
def get_engine(db_path=None):
    """Get SQLAlchemy engine with environment-based database path."""
    if db_path is None:
        # Import here to avoid circular dependency
        from config import config
        db_path = f"sqlite:///{config.get_db_path()}"
    return create_engine(db_path, echo=False)

def init_db(engine):
    Base.metadata.create_all(engine)

def get_session(engine):
    Session = sessionmaker(bind=engine)
    return Session()

def get_all_root_goals(session):
    return session.query(Goal).filter(
        Goal.parent_id == None,
        Goal.type != 'PracticeSession'
    ).all()

def get_goal_by_id(session, goal_id):
    return session.query(Goal).filter(Goal.id == goal_id).first()

def get_practice_session_by_id(session, session_id):
    # This now queries the goals table where type='PracticeSession'
    return session.query(PracticeSession).filter(PracticeSession.id == session_id).first()

def get_all_practice_sessions(session):
    return session.query(PracticeSession).all()

def get_immediate_goals_for_session(session, practice_session_id):
    # Immediate goals are now just children of the session (which is a Goal)
    # But since ImmediateGoal is a Goal, simple query works.
    return session.query(Goal).filter(
        Goal.type == 'ImmediateGoal',
        Goal.parent_id == practice_session_id
    ).all()

def delete_goal_recursive(session, goal_id):
    goal = get_goal_by_id(session, goal_id)
    if goal:
        session.delete(goal)
        session.commit()
        return True
    return False

def delete_practice_session(session, session_id):
    return delete_goal_recursive(session, session_id)

def build_goal_tree(session, goal):
    # Goal.to_dict(include_children=True) uses the relationship, which is efficient/lazy loaded.
    # But recursively, valid.
    # IMPORTANT: The old logic manually queried children. SQLAlchemy 'children' relationship does that for us.
    # However, to be safe and consistent with recursive formatting:
    return goal.to_dict(include_children=True)

def build_practice_session_tree(session, practice_session):
    # Same as goal tree now!
    return build_goal_tree(session, practice_session)

# Common 'root_id' finder
def get_root_id_for_goal(session, goal_id):
    goal = get_goal_by_id(session, goal_id)
    if not goal: return None
    curr = goal
    count = 0
    while curr.parent and count < 20: # Use relationship 'parent'
        curr = curr.parent
        count += 1
    return curr.id

def validate_root_goal(session, root_id):
    """
    Validate that a root_id exists and is actually a root goal (has no parent).
    """
    goal = get_goal_by_id(session, root_id)
    if goal and goal.parent_id is None:
        return goal
    return None
