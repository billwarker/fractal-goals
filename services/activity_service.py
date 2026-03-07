import logging
from sqlalchemy.orm import joinedload
from sqlalchemy import select
from models import (
    ActivityDefinition, MetricDefinition, SplitDefinition, ActivityGroup, Goal,
    utc_now
)
from services.events import event_bus, Event, Events

logger = logging.getLogger(__name__)

class ActivityService:
    def __init__(self, db_session):
        self.db_session = db_session

    def create_activity(self, root_id, activity_name, data):
        """Handle full creation lifecycle of an ActivityDefinition including Metrics and Splits."""
        group_id = data.get('group_id')
        
        # Create Activity
        new_activity = ActivityDefinition(
            root_id=root_id,
            name=activity_name,
            description=data.get('description', ''),
            has_sets=data.get('has_sets', False),
            has_metrics=data.get('has_metrics', True),
            metrics_multiplicative=data.get('metrics_multiplicative', False),
            has_splits=data.get('has_splits', False),
            group_id=group_id
        )
        self.db_session.add(new_activity)
        self.db_session.flush() # Get ID
        
        # Create Metrics
        metrics_data = data.get('metrics', [])
        for m in metrics_data:
            if m.get('name') and m.get('unit'):
                new_metric = MetricDefinition(
                    activity_id=new_activity.id,
                    root_id=root_id,
                    name=m['name'],
                    unit=m['unit'],
                    is_top_set_metric=m.get('is_top_set_metric', False),
                    is_multiplicative=m.get('is_multiplicative', True)
                )
                self.db_session.add(new_metric)
        
        # Create Splits
        splits_data = data.get('splits', [])
        for idx, s in enumerate(splits_data):
            if s.get('name'):
                new_split = SplitDefinition(
                    activity_id=new_activity.id,
                    root_id=root_id,
                    name=s['name'],
                    order=idx
                )
                self.db_session.add(new_split)
                
        # Handle Goal Associations
        goal_ids = data.get('goal_ids', [])
        if goal_ids:
            goals = self.db_session.query(Goal).filter(
                Goal.id.in_(goal_ids), 
                Goal.root_id == root_id
            ).all()
            new_activity.associated_goals.extend(
                [g for g in goals if g not in new_activity.associated_goals]
            )

        self.db_session.commit()
        self.db_session.refresh(new_activity)
        
        event_bus.emit(Event(Events.ACTIVITY_CREATED, {
            'activity_id': new_activity.id,
            'activity_name': new_activity.name,
            'root_id': root_id
        }, source='activity_service.create_activity'))
        
        return new_activity

    def update_activity(self, root_id, activity, data):
        """Update an existing activity definition, metrics, and splits."""
        if 'name' in data and (data['name'] or '').strip():
            activity.name = (data['name'] or '').strip()
        if 'description' in data:
            activity.description = data['description']
        if 'has_sets' in data:
            activity.has_sets = data['has_sets']
        if 'has_metrics' in data:
            activity.has_metrics = data['has_metrics']
        if 'metrics_multiplicative' in data:
            activity.metrics_multiplicative = data['metrics_multiplicative']
        if 'has_splits' in data:
            activity.has_splits = data['has_splits']
        if 'group_id' in data:
            activity.group_id = data['group_id']

        # Update metrics if provided
        if 'metrics' in data:
            metrics_data = data.get('metrics', [])
            existing_metrics = self.db_session.query(MetricDefinition).filter(
                MetricDefinition.activity_id == activity.id,
                MetricDefinition.deleted_at.is_(None)
            ).all()
            existing_metrics_dict = {m.id: m for m in existing_metrics}
            updated_metric_ids = set()

            for m in metrics_data:
                if m.get('name') and m.get('unit'):
                    metric_id = m.get('id')
                    
                    if metric_id and metric_id in existing_metrics_dict:
                        existing_metric = existing_metrics_dict[metric_id]
                        existing_metric.name = m['name']
                        existing_metric.unit = m['unit']
                        existing_metric.is_top_set_metric = m.get('is_top_set_metric', False)
                        existing_metric.is_multiplicative = m.get('is_multiplicative', True)
                        updated_metric_ids.add(metric_id)
                    else:
                        matched_metric = None
                        for existing_metric in existing_metrics:
                            if (existing_metric.name == m['name'] and 
                                existing_metric.unit == m['unit'] and 
                                existing_metric.id not in updated_metric_ids):
                                matched_metric = existing_metric
                                break
                        
                        if matched_metric:
                            matched_metric.is_top_set_metric = m.get('is_top_set_metric', False)
                            matched_metric.is_multiplicative = m.get('is_multiplicative', True)
                            updated_metric_ids.add(matched_metric.id)
                        else:
                            new_metric = MetricDefinition(
                                activity_id=activity.id,
                                root_id=root_id,
                                name=m['name'],
                                unit=m['unit'],
                                is_top_set_metric=m.get('is_top_set_metric', False),
                                is_multiplicative=m.get('is_multiplicative', True)
                            )
                            self.db_session.add(new_metric)

            # Soft-delete metrics that were not in the update
            for existing_metric in existing_metrics:
                if existing_metric.id not in updated_metric_ids:
                    existing_metric.deleted_at = utc_now()
                    existing_metric.is_active = False

        # Update splits if provided
        if 'splits' in data:
            splits_data = data.get('splits', [])
            existing_splits = self.db_session.query(SplitDefinition).filter_by(activity_id=activity.id).all()
            existing_splits_dict = {s.id: s for s in existing_splits}
            updated_split_ids = set()
            
            for idx, s in enumerate(splits_data):
                if s.get('name'):
                    split_id = s.get('id')
                    if split_id and split_id in existing_splits_dict:
                        existing_split = existing_splits_dict[split_id]
                        existing_split.name = s['name']
                        existing_split.order = idx
                        updated_split_ids.add(split_id)
                    else:
                        new_split = SplitDefinition(
                            activity_id=activity.id,
                            root_id=root_id,
                            name=s['name'],
                            order=idx
                        )
                        self.db_session.add(new_split)
            
            for existing_split in existing_splits:
                if existing_split.id not in updated_split_ids:
                    self.db_session.delete(existing_split)

        # Update goal associations if provided
        if 'goal_ids' in data:
            goal_ids = data.get('goal_ids', [])
            goals = self.db_session.query(Goal).filter(
                Goal.id.in_(goal_ids), 
                Goal.root_id == root_id
            ).all()
            activity.associated_goals.clear()
            for goal in goals:
                if goal not in activity.associated_goals:
                    activity.associated_goals.append(goal)

        self.db_session.commit()
        self.db_session.refresh(activity)

        event_bus.emit(Event(Events.ACTIVITY_UPDATED, {
            'activity_id': activity.id,
            'activity_name': activity.name,
            'root_id': root_id,
            'updated_fields': list(data.keys())
        }, source='activity_service.update_activity'))
        
        return activity

    def delete_activity(self, root_id, activity):
        act_id = activity.id
        act_name = activity.name
        
        activity.deleted_at = utc_now()
        self.db_session.commit()

        event_bus.emit(Event(Events.ACTIVITY_DELETED, {
            'activity_id': act_id,
            'activity_name': act_name,
            'root_id': root_id
        }, source='activity_service.delete_activity'))
