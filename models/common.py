import sqlalchemy as sa
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship
import uuid
from .base import Base, utc_now, JSON_TYPE

class Note(Base):
    __tablename__ = 'notes'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    
    context_type = Column(String, nullable=False) # 'root', 'goal', 'session', 'program', 'activity_instance', 'activity_definition'
    context_id = Column(String, nullable=False, index=True)
    
    __table_args__ = (
        sa.Index('ix_notes_root_context_deleted', 'root_id', 'context_type', 'context_id', 'deleted_at'),
    )
    
    session_id = Column(String, ForeignKey('sessions.id', ondelete='CASCADE'), nullable=True, index=True)
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='SET NULL'), nullable=True, index=True)
    activity_definition_id = Column(String, ForeignKey('activity_definitions.id', ondelete='SET NULL'), nullable=True, index=True)
    goal_id = Column(String, ForeignKey('goals.id', ondelete='SET NULL'), nullable=True, index=True)

    set_index = Column(Integer, nullable=True)

    content = Column(Text, nullable=False)
    image_data = Column(Text, nullable=True)
    pinned_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)

    session = relationship("Session", backref="notes_list")
    activity_instance = relationship("ActivityInstance", backref="notes_list")
    activity_definition = relationship("ActivityDefinition", backref="notes_list")
    goal = relationship("Goal", foreign_keys=[goal_id])

class AnalyticsDashboard(Base):
    __tablename__ = 'analytics_dashboards'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String, nullable=False)
    layout = Column(JSON_TYPE, nullable=False)

    __table_args__ = (
        sa.Index('ix_analytics_dashboards_root_user_deleted', 'root_id', 'user_id', 'deleted_at'),
    )

    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)

class EventLog(Base):
    __tablename__ = 'event_logs'
    __table_args__ = (
        sa.Index('ix_event_logs_root_timestamp_desc', 'root_id', sa.text('timestamp DESC')),
        sa.Index('ix_event_logs_root_event_type_timestamp_desc', 'root_id', 'event_type', sa.text('timestamp DESC')),
    )
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    
    event_type = Column(String, nullable=False)
    entity_type = Column(String, nullable=True)
    entity_id = Column(String, nullable=True)
    
    description = Column(Text, nullable=True)
    payload = Column(JSON_TYPE, nullable=True)
    
    source = Column(String, nullable=True)
    timestamp = Column(DateTime, default=utc_now)
