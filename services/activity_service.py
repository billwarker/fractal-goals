import logging
from sqlalchemy.orm import joinedload
from sqlalchemy import select
from models import (
    ActivityDefinition, MetricDefinition,
    SplitDefinition, ActivityGroup, Goal,
    activity_goal_associations, goal_activity_group_associations,
    validate_root_goal, utc_now
)
from services.activity_group_service import ActivityGroupService, validate_activity_group_id
from services.activity_metric_service import (
    ALLOWED_PROGRESS_AGGREGATIONS,
    ActivityMetricService,
    normalize_progress_aggregation,
)
from services.events import event_bus, Event, Events
from services.payload_normalizers import (
    normalize_activity_metrics,
    normalize_activity_payload,
    normalize_activity_splits,
    normalize_id_list,
)
from services.quota_service import QuotaService
from services.service_types import JsonDict, JsonList, ServiceResult

logger = logging.getLogger(__name__)

def _validate_and_normalize_metrics(metrics_data):
    """Require metrics to include both name and unit if provided."""
    if metrics_data is None:
        return [], None
    if not isinstance(metrics_data, list):
        return None, "Metrics must be an array"

    normalized = []
    for idx, metric in enumerate(metrics_data):
        if not isinstance(metric, dict):
            return None, f"Metric at index {idx} must be an object"
        name = (metric.get('name') or '').strip()
        unit = (metric.get('unit') or '').strip()
        if not name and not unit:
            continue
        if not name or not unit:
            return None, f"Metric at index {idx} must include both name and unit"

        progress_aggregation = normalize_progress_aggregation(metric.get('progress_aggregation'))
        if progress_aggregation not in ALLOWED_PROGRESS_AGGREGATIONS and progress_aggregation is not None:
            return None, (
                f"Metric at index {idx} has invalid progress_aggregation. "
                f"Expected one of: {', '.join(sorted(ALLOWED_PROGRESS_AGGREGATIONS))}"
            )

        normalized.append({
            **metric,
            'name': name,
            'unit': unit,
            'track_progress': metric.get('track_progress') is not False,
            'progress_aggregation': progress_aggregation,
        })
    return normalized, None


class ActivityService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _validate_activity_definition_payload(
        self,
        root_id,
        data,
        *,
        partial=False,
    ) -> tuple[dict | None, tuple[str, int] | None]:
        data = normalize_activity_payload(data, partial=partial)

        if 'name' in data:
            next_name = (data.get('name') or '').strip()
            if not next_name:
                return None, ("Name is required", 400)
            data['name'] = next_name

        if 'group_id' in data:
            normalized_group_id = data.get('group_id') or None
            group_err = validate_activity_group_id(self.db_session, root_id, normalized_group_id)
            if group_err:
                return None, (group_err, 400)
            data['group_id'] = normalized_group_id

        if 'metrics' in data:
            metrics_data, metrics_err = _validate_and_normalize_metrics(data.get('metrics'))
            if metrics_err:
                return None, (metrics_err, 400)
            if len(metrics_data) > 3:
                return None, ("Maximum of 3 metrics allowed per activity.", 400)
            data['metrics'] = metrics_data

        if 'splits' in data:
            splits_data = data.get('splits') or []
            if not isinstance(splits_data, list):
                return None, ("Splits must be an array", 400)
            if len(splits_data) > 5:
                return None, ("Maximum of 5 splits allowed per activity.", 400)
            data['splits'] = splits_data

        return data, None

    def _validate_owned_root(self, root_id, current_user_id) -> tuple[Goal | None, tuple[str, int] | None]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, ("Fractal not found or access denied", 404)
        return root, None

    def _replace_activity_goal_associations(self, activity_id, root_id, goal_ids) -> list[str]:
        goal_ids = normalize_id_list(goal_ids)
        valid_goal_ids = []
        if goal_ids:
            valid_goal_ids = [
                goal_id
                for (goal_id,) in self.db_session.query(Goal.id).filter(
                    Goal.id.in_(goal_ids),
                    Goal.root_id == root_id,
                    Goal.deleted_at.is_(None),
                ).all()
            ]

        self.db_session.execute(
            activity_goal_associations.delete().where(
                activity_goal_associations.c.activity_id == activity_id
            )
        )
        if valid_goal_ids:
            self.db_session.execute(
                activity_goal_associations.insert(),
                [
                    {"activity_id": activity_id, "goal_id": goal_id}
                    for goal_id in valid_goal_ids
                ],
            )
        return valid_goal_ids

    def list_activity_groups(self, root_id, current_user_id):
        return ActivityGroupService(self.db_session).list_activity_groups(root_id, current_user_id)

    # ── Fractal Metrics ─────────────────────────────────────────────────────

    def list_fractal_metrics(self, root_id, current_user_id):
        return ActivityMetricService(self.db_session).list_fractal_metrics(root_id, current_user_id)

    def create_fractal_metric(self, root_id, current_user_id, data):
        return ActivityMetricService(self.db_session).create_fractal_metric(root_id, current_user_id, data)

    def update_fractal_metric(self, root_id, metric_id, current_user_id, data):
        return ActivityMetricService(self.db_session).update_fractal_metric(root_id, metric_id, current_user_id, data)

    def delete_fractal_metric(self, root_id, metric_id, current_user_id):
        return ActivityMetricService(self.db_session).delete_fractal_metric(root_id, metric_id, current_user_id)

    def create_activity_group(self, root_id, current_user_id, data):
        return ActivityGroupService(self.db_session).create_activity_group(root_id, current_user_id, data)

    def update_activity_group(self, root_id, group_id, current_user_id, data):
        return ActivityGroupService(self.db_session).update_activity_group(root_id, group_id, current_user_id, data)

    def delete_activity_group(self, root_id, group_id, current_user_id):
        return ActivityGroupService(self.db_session).delete_activity_group(root_id, group_id, current_user_id)

    def reorder_activity_groups(self, root_id, current_user_id, group_ids):
        return ActivityGroupService(self.db_session).reorder_activity_groups(root_id, current_user_id, group_ids)

    def set_activity_group_goals(self, root_id, group_id, current_user_id, goal_ids):
        return ActivityGroupService(self.db_session).set_activity_group_goals(root_id, group_id, current_user_id, goal_ids)

    def set_activity_goals(self, root_id, activity_id, current_user_id, goal_ids) -> ServiceResult[ActivityDefinition]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        activity = self.db_session.query(ActivityDefinition).filter_by(id=activity_id, root_id=root_id).first()
        if not activity:
            return None, "Activity not found", 404

        self._replace_activity_goal_associations(activity_id, root_id, goal_ids)

        self.db_session.commit()
        self.db_session.expire(activity, ['associated_goals'])

        event_bus.emit(Event(Events.ACTIVITY_UPDATED, {
            'activity_id': activity_id,
            'activity_name': activity.name,
            'root_id': root_id,
            'updated_fields': ['associated_goals'],
        }, source='activity_service.set_activity_goals'))

        return activity, None, 200

    def remove_activity_goal(self, root_id, activity_id, goal_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        activity = self.db_session.query(ActivityDefinition).filter_by(id=activity_id, root_id=root_id).first()
        if not activity:
            return None, "Activity not found", 404

        result = self.db_session.execute(
            activity_goal_associations.delete().where(
                activity_goal_associations.c.activity_id == activity_id,
                activity_goal_associations.c.goal_id == goal_id,
            )
        )
        if result.rowcount == 0:
            return None, "Association not found", 404

        self.db_session.commit()

        event_bus.emit(Event(Events.ACTIVITY_UPDATED, {
            'activity_id': activity_id,
            'activity_name': activity.name,
            'root_id': root_id,
            'updated_fields': ['associated_goals'],
        }, source='activity_service.remove_activity_goal'))

        return {"message": "Goal association removed"}, None, 200

    def set_goal_associations_batch(
        self, root_id, goal_id, current_user_id, activity_ids, group_ids
    ) -> ServiceResult[JsonDict]:
        activity_ids = normalize_id_list(activity_ids)
        group_ids = normalize_id_list(group_ids)
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).filter_by(id=goal_id, root_id=root_id).first()
        if not goal:
            return None, "Goal not found", 404

        if not isinstance(activity_ids, list) or not isinstance(group_ids, list):
            return None, "activity_ids and group_ids must be lists", 400

        valid_activities = self.db_session.query(ActivityDefinition.id).filter(
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.id.in_(activity_ids),
            ActivityDefinition.deleted_at.is_(None),
        ).all()
        valid_groups = self.db_session.query(ActivityGroup.id).filter(
            ActivityGroup.root_id == root_id,
            ActivityGroup.id.in_(group_ids),
            ActivityGroup.deleted_at.is_(None),
        ).all()
        valid_activity_ids = {row[0] for row in valid_activities}
        valid_group_ids = {row[0] for row in valid_groups}

        self.db_session.execute(
            activity_goal_associations.delete().where(activity_goal_associations.c.goal_id == goal_id)
        )
        if valid_activity_ids:
            self.db_session.execute(
                activity_goal_associations.insert(),
                [{"goal_id": goal_id, "activity_id": activity_id} for activity_id in valid_activity_ids],
            )

        self.db_session.execute(
            goal_activity_group_associations.delete().where(goal_activity_group_associations.c.goal_id == goal_id)
        )
        if valid_group_ids:
            self.db_session.execute(
                goal_activity_group_associations.insert(),
                [{"goal_id": goal_id, "activity_group_id": group_id} for group_id in valid_group_ids],
            )

        self.db_session.commit()
        return {
            "activity_ids": list(valid_activity_ids),
            "group_ids": list(valid_group_ids),
        }, None, 200

    def get_goal_activities(self, root_id, goal_id, current_user_id) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).filter_by(id=goal_id, root_id=root_id).first()
        if not goal:
            return None, "Goal not found", 404

        def upsert_activity(
            activity,
            activities_map,
            *,
            is_inherited,
            source_name=None,
            source_goal_id=None,
            from_linked_group=False,
            direction=None,
        ):
            entry = activities_map.get(activity.id)
            if entry is None:
                entry = {
                    "id": activity.id,
                    "name": activity.name,
                    "description": activity.description,
                    "group_id": activity.group_id,
                    "from_linked_group": from_linked_group,
                    "has_direct_association": not is_inherited,
                    "inherited_from_children": direction == "child",
                    "inherited_from_parent": direction == "parent",
                    "inherited_source_goal_names": [source_name] if direction == "child" and source_name else [],
                    "inherited_source_goal_ids": [source_goal_id] if direction == "child" and source_goal_id else [],
                    "is_inherited": is_inherited,
                    "source_goal_name": source_name if is_inherited else None,
                    "source_goal_id": source_goal_id if is_inherited else None,
                }
                activities_map[activity.id] = entry
                return

            if is_inherited:
                if direction == "parent":
                    entry["inherited_from_parent"] = True
                else:
                    entry["inherited_from_children"] = True
                    if source_name and source_name not in entry["inherited_source_goal_names"]:
                        entry["inherited_source_goal_names"].append(source_name)
                    if source_goal_id and source_goal_id not in entry["inherited_source_goal_ids"]:
                        entry["inherited_source_goal_ids"].append(source_goal_id)
                if entry["source_goal_name"] is None and source_name:
                    entry["source_goal_name"] = source_name
                if entry["source_goal_id"] is None and source_goal_id:
                    entry["source_goal_id"] = source_goal_id
                return

            entry["has_direct_association"] = True
            entry["is_inherited"] = False
            entry["from_linked_group"] = from_linked_group
            if not entry["inherited_from_children"]:
                entry["source_goal_name"] = None
                entry["source_goal_id"] = None

        def process_goal(goal_node, activities_map, *, is_inherited=False, source_name=None, direction=None):
            source_goal_id = goal_node.id if is_inherited else None

            for activity in goal_node.associated_activities:
                if activity.deleted_at:
                    continue

                upsert_activity(
                    activity,
                    activities_map,
                    is_inherited=is_inherited,
                    source_name=source_name,
                    source_goal_id=source_goal_id,
                    from_linked_group=False,
                    direction=direction,
                )

            for group in goal_node.associated_activity_groups:
                for activity in group.activities:
                    if activity.deleted_at:
                        continue

                    upsert_activity(
                        activity,
                        activities_map,
                        is_inherited=is_inherited,
                        source_name=source_name,
                        source_goal_id=source_goal_id,
                        from_linked_group=True,
                        direction=direction,
                    )

        activities = {}
        process_goal(goal, activities, is_inherited=False)

        stack = [goal]
        while stack:
            current = stack.pop(0)
            for child in current.children:
                if child.deleted_at:
                    continue
                process_goal(child, activities, is_inherited=True, source_name=child.name, direction="child")
                stack.append(child)

        if goal.inherit_parent_activities and goal.parent_id:
            parent = self.db_session.query(Goal).filter_by(id=goal.parent_id, root_id=root_id).first()
            if parent and not parent.deleted_at:
                process_goal(parent, activities, is_inherited=True, source_name=parent.name, direction="parent")

        return list(activities.values()), None, 200

    def get_goal_activity_groups(self, root_id, goal_id, current_user_id) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).filter_by(id=goal_id, root_id=root_id).first()
        if not goal:
            return None, "Goal not found", 404

        groups = [{"id": group.id, "name": group.name} for group in goal.associated_activity_groups]
        return groups, None, 200

    def link_goal_activity_group(self, root_id, goal_id, group_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).filter_by(id=goal_id, root_id=root_id).first()
        if not goal:
            return None, "Goal not found", 404

        group = self.db_session.query(ActivityGroup).filter_by(id=group_id, root_id=root_id).first()
        if not group:
            return None, "Activity group not found", 404

        existing = self.db_session.execute(
            select(goal_activity_group_associations).where(
                goal_activity_group_associations.c.goal_id == goal_id,
                goal_activity_group_associations.c.activity_group_id == group_id,
            )
        ).first()
        if existing:
            return {"message": "Group already linked"}, None, 200

        self.db_session.execute(
            goal_activity_group_associations.insert().values(
                goal_id=goal_id,
                activity_group_id=group_id,
            )
        )
        self.db_session.commit()
        return {"message": "Group linked successfully"}, None, 201

    def unlink_goal_activity_group(self, root_id, goal_id, group_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        result = self.db_session.execute(
            goal_activity_group_associations.delete().where(
                goal_activity_group_associations.c.goal_id == goal_id,
                goal_activity_group_associations.c.activity_group_id == group_id,
            )
        )
        if result.rowcount == 0:
            return None, "Link not found", 404

        self.db_session.commit()
        return {"message": "Group unlinked successfully"}, None, 200

    def create_activity(self, root_id, activity_name, data) -> ActivityDefinition:
        """Handle full creation lifecycle of an ActivityDefinition including Metrics and Splits."""
        data = normalize_activity_payload({**data, 'name': activity_name})
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
            group_id=group_id,
            track_progress=data.get('track_progress', None),
            progress_aggregation=data.get('progress_aggregation', None),
            delta_display_mode=data.get('delta_display_mode', None),
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
                    fractal_metric_id=m.get('fractal_metric_id'),
                    name=m['name'],
                    unit=m['unit'],
                    is_best_set_metric=m.get('is_best_set_metric', False),
                    is_multiplicative=m.get('is_multiplicative', True),
                    track_progress=m.get('track_progress', True),
                    progress_aggregation=m.get('progress_aggregation'),
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
            self._replace_activity_goal_associations(new_activity.id, root_id, goal_ids)

        self.db_session.commit()
        self.db_session.refresh(new_activity)
        
        event_bus.emit(Event(Events.ACTIVITY_CREATED, {
            'activity_id': new_activity.id,
            'activity_name': new_activity.name,
            'root_id': root_id
        }, source='activity_service.create_activity'))
        
        return new_activity

    def update_activity(self, root_id, activity, data) -> ActivityDefinition:
        """Patch scalar fields, but replace metrics/splits/goal associations when those keys are present."""
        data = normalize_activity_payload(data, partial=True)
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
        if 'track_progress' in data:
            activity.track_progress = data['track_progress']
        if 'progress_aggregation' in data:
            activity.progress_aggregation = data['progress_aggregation']
        if 'delta_display_mode' in data:
            activity.delta_display_mode = data['delta_display_mode'] or None

        # Update metrics if provided
        if 'metrics' in data:
            metrics_data = normalize_activity_metrics(data.get('metrics'))
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
                        existing_metric.fractal_metric_id = m.get('fractal_metric_id')
                        existing_metric.name = m['name']
                        existing_metric.unit = m['unit']
                        existing_metric.is_best_set_metric = m.get('is_best_set_metric', False)
                        existing_metric.is_multiplicative = m.get('is_multiplicative', True)
                        existing_metric.track_progress = m.get('track_progress', True)
                        existing_metric.progress_aggregation = m.get('progress_aggregation')
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
                            matched_metric.fractal_metric_id = m.get('fractal_metric_id')
                            matched_metric.is_best_set_metric = m.get('is_best_set_metric', False)
                            matched_metric.is_multiplicative = m.get('is_multiplicative', True)
                            matched_metric.track_progress = m.get('track_progress', True)
                            matched_metric.progress_aggregation = m.get('progress_aggregation')
                            updated_metric_ids.add(matched_metric.id)
                        else:
                            new_metric = MetricDefinition(
                                activity_id=activity.id,
                                root_id=root_id,
                                fractal_metric_id=m.get('fractal_metric_id'),
                                name=m['name'],
                                unit=m['unit'],
                                is_best_set_metric=m.get('is_best_set_metric', False),
                                is_multiplicative=m.get('is_multiplicative', True),
                                track_progress=m.get('track_progress', True),
                                progress_aggregation=m.get('progress_aggregation'),
                            )
                            self.db_session.add(new_metric)

            # Soft-delete metrics that were not in the update
            for existing_metric in existing_metrics:
                if existing_metric.id not in updated_metric_ids:
                    existing_metric.deleted_at = utc_now()
                    existing_metric.is_active = False

        # Update splits if provided
        if 'splits' in data:
            splits_data = normalize_activity_splits(data.get('splits'))
            existing_splits = self.db_session.query(SplitDefinition).filter(
                SplitDefinition.activity_id == activity.id,
                SplitDefinition.deleted_at.is_(None),
            ).all()
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
                    existing_split.deleted_at = utc_now()

        # Update goal associations if provided
        if 'goal_ids' in data:
            self._replace_activity_goal_associations(activity.id, root_id, data.get('goal_ids', []))

        self.db_session.commit()
        self.db_session.refresh(activity)
        if 'goal_ids' in data:
            self.db_session.expire(activity, ['associated_goals'])

        progress_affecting_keys = {'track_progress', 'progress_aggregation', 'metrics'}
        if progress_affecting_keys.intersection(data.keys()):
            from services.progress_service import ProgressService
            ProgressService(self.db_session).recompute_progress_for_activity(activity.id, root_id)

        event_bus.emit(Event(Events.ACTIVITY_UPDATED, {
            'activity_id': activity.id,
            'activity_name': activity.name,
            'root_id': root_id,
            'updated_fields': list(data.keys())
        }, source='activity_service.update_activity'))
        
        return activity

    def create_activity_definition(self, root_id, current_user_id, data) -> ServiceResult[ActivityDefinition]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        validated_data, validation_error = self._validate_activity_definition_payload(
            root_id,
            data,
            partial=False,
        )
        if validation_error:
            return None, *validation_error

        quota_service = QuotaService(self.db_session)
        _, quota_error, quota_status = quota_service.check_available(current_user_id, "activities")
        if quota_error:
            return None, quota_error, quota_status

        metric_increment = sum(
            1
            for metric in validated_data.get('metrics', [])
            if metric.get('name') and metric.get('unit') and not metric.get('fractal_metric_id')
        )
        _, quota_error, quota_status = quota_service.check_available(current_user_id, "metrics", metric_increment)
        if quota_error:
            return None, quota_error, quota_status

        activity_name = validated_data['name']
        new_activity = self.create_activity(root_id, activity_name, validated_data)
        return new_activity, None, 201

    def update_activity_definition(
        self,
        root_id,
        activity_id,
        current_user_id,
        data,
    ) -> ServiceResult[ActivityDefinition]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        activity = self.db_session.query(ActivityDefinition).filter(
            ActivityDefinition.id == activity_id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).first()
        if not activity:
            return None, "Activity not found", 404

        validated_data, validation_error = self._validate_activity_definition_payload(
            root_id,
            data,
            partial=True,
        )
        if validation_error:
            return None, *validation_error

        if 'metrics' in validated_data:
            existing_metrics = self.db_session.query(MetricDefinition).filter(
                MetricDefinition.activity_id == activity.id,
                MetricDefinition.deleted_at.is_(None),
            ).all()
            existing_by_id = {metric.id: metric for metric in existing_metrics}
            existing_by_signature = {
                (metric.name, metric.unit): metric
                for metric in existing_metrics
            }
            new_standalone_count = 0
            retained_standalone_ids = set()
            for metric in normalize_activity_metrics(validated_data.get('metrics')):
                if not metric.get('name') or not metric.get('unit') or metric.get('fractal_metric_id'):
                    continue
                metric_id = metric.get('id')
                existing_metric = existing_by_id.get(metric_id) if metric_id else None
                if not existing_metric:
                    existing_metric = existing_by_signature.get((metric['name'], metric['unit']))
                if existing_metric:
                    retained_standalone_ids.add(existing_metric.id)
                else:
                    new_standalone_count += 1

            removed_standalone_count = sum(
                1
                for metric in existing_metrics
                if metric.fractal_metric_id is None and metric.id not in retained_standalone_ids
            )
            net_metric_increment = max(0, new_standalone_count - removed_standalone_count)
            _, quota_error, quota_status = QuotaService(self.db_session).check_available(
                current_user_id,
                "metrics",
                net_metric_increment,
            )
            if quota_error:
                return None, quota_error, quota_status

        updated_activity = self.update_activity(root_id, activity, validated_data)
        return updated_activity, None, 200

    def delete_activity(self, root_id, activity) -> None:
        act_id = activity.id
        act_name = activity.name
        
        activity.deleted_at = utc_now()
        self.db_session.commit()

        event_bus.emit(Event(Events.ACTIVITY_DELETED, {
            'activity_id': act_id,
            'activity_name': act_name,
            'root_id': root_id
        }, source='activity_service.delete_activity'))
