# Proposed Schema Changes for Data Integrity
# Add to models.py

class MetricDefinition(Base):
    """
    Defines a numerical metric to track for a specific activity.
    Example: "BPM", "Accuracy (%)", "Minutes"
    """
    __tablename__ = 'metric_definitions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id = Column(String, ForeignKey('activity_definitions.id'), nullable=False)
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    
    # NEW: Soft delete support
    deleted_at = Column(DateTime, nullable=True)  # NULL = active, timestamp = deleted
    is_active = Column(Boolean, default=True)     # Quick filter for active metrics
    
    def to_dict(self):
        return {
            "id": self.id,
            "activity_id": self.activity_id,
            "name": self.name,
            "unit": self.unit,
            "is_active": self.is_active
        }


class MetricValue(Base):
    """
    The value recorded for a specific metric in an activity instance.
    
    Uses ON DELETE RESTRICT to prevent deletion of metric definitions
    that have recorded values. This ensures data integrity.
    """
    __tablename__ = 'metric_values'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_instance_id = Column(String, ForeignKey('activity_instances.id', ondelete='CASCADE'), nullable=False)
    
    # CHANGED: Add ON DELETE RESTRICT to prevent orphaning
    metric_definition_id = Column(
        String, 
        ForeignKey('metric_definitions.id', ondelete='RESTRICT'),  # Prevent deletion if values exist
        nullable=False
    )
    value = Column(Float, nullable=False)
    
    # Relationship to definition
    definition = relationship("MetricDefinition")

    def to_dict(self):
        return {
            "id": self.id,
            "metric_definition_id": self.metric_definition_id,
            "name": self.definition.name if self.definition else "Unknown",
            "unit": self.definition.unit if self.definition else "",
            "value": self.value,
            "is_active": self.definition.is_active if self.definition else False
        }


# Migration Strategy Functions

def soft_delete_metric_definition(session, metric_id):
    """
    Soft delete a metric definition instead of hard deleting it.
    This preserves historical data while hiding the metric from new activities.
    """
    metric = session.query(MetricDefinition).filter_by(id=metric_id).first()
    if metric:
        metric.deleted_at = datetime.now()
        metric.is_active = False
        session.commit()
        return True
    return False


def get_active_metrics_for_activity(session, activity_id):
    """
    Get only active (non-deleted) metrics for an activity.
    Use this when creating new activity instances.
    """
    return session.query(MetricDefinition).filter_by(
        activity_id=activity_id,
        is_active=True
    ).all()


def migrate_json_to_relational(session, practice_session_id):
    """
    Migrate a session's JSON activity data to relational tables.
    This is a one-time migration for existing sessions.
    """
    import json
    
    ps = session.query(PracticeSession).filter_by(id=practice_session_id).first()
    if not ps or not ps.session_data:
        return False
    
    try:
        data = json.loads(ps.session_data)
        sections = data.get('sections', [])
        
        for section in sections:
            exercises = section.get('exercises', [])
            for exercise in exercises:
                if exercise.get('type') == 'activity':
                    # Create ActivityInstance
                    instance = ActivityInstance(
                        practice_session_id=ps.id,
                        activity_definition_id=exercise.get('activity_id')
                    )
                    session.add(instance)
                    session.flush()  # Get instance ID
                    
                    # Create MetricValues
                    metrics = exercise.get('metrics', [])
                    for metric in metrics:
                        if metric.get('value'):
                            metric_value = MetricValue(
                                activity_instance_id=instance.id,
                                metric_definition_id=metric.get('metric_id'),
                                value=float(metric.get('value'))
                            )
                            session.add(metric_value)
        
        session.commit()
        return True
        
    except Exception as e:
        session.rollback()
        print(f"Migration failed: {e}")
        return False
