import sqlalchemy as sa
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship
import uuid
from .base import Base, utc_now, JSON_TYPE

class Note(Base):
    __tablename__ = 'notes'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    
    context_type = Column(String, nullable=False) # 'session', 'activity_instance', 'set'
    context_id = Column(String, nullable=False, index=True)
    
    __table_args__ = (
        sa.Index('ix_notes_root_context_deleted', 'root_id', 'context_type', 'context_id', 'deleted_at'),
    )
    
    session_id = Column(String, ForeignKey('sessions.id', ondelete='CASCADE'), nullable=True, index=True)
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='SET NULL'), nullable=True, index=True)
    activity_definition_id = Column(String, ForeignKey('activity_definitions.id', ondelete='SET NULL'), nullable=True, index=True)
    nano_goal_id = Column(String, ForeignKey('goals.id', ondelete='SET NULL'), nullable=True, index=True)
    
    set_index = Column(Integer, nullable=True)
    
    content = Column(Text, nullable=False)
    image_data = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
    
    session = relationship("Session", backref="notes_list")
    activity_instance = relationship("ActivityInstance", backref="notes_list")
    activity_definition = relationship("ActivityDefinition", backref="notes_list")

class VisualizationAnnotation(Base):
    __tablename__ = 'visualization_annotations'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    
    visualization_type = Column(String, nullable=False)
    visualization_context = Column(JSON_TYPE, nullable=True)
    
    selected_points = Column(JSON_TYPE, nullable=False)
    selection_bounds = Column(JSON_TYPE, nullable=True)
    
    __table_args__ = (
        sa.Index('ix_viz_annotations_root_type_context', 'root_id', 'visualization_type', 'deleted_at'),
    )
    
    content = Column(Text, nullable=False)
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)

class EventLog(Base):
    __tablename__ = 'event_logs'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    
    event_type = Column(String, nullable=False)
    entity_type = Column(String, nullable=True)
    entity_id = Column(String, nullable=True)
    
    description = Column(Text, nullable=True)
    payload = Column(JSON_TYPE, nullable=True)
    
    source = Column(String, nullable=True)
    timestamp = Column(DateTime, default=utc_now)
