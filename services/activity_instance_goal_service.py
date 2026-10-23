"""Transactional, tenant-owned links from one execution to a goal."""
from sqlalchemy import select
from models import ActivityInstance, Goal, Session, activity_instance_goal_associations, utc_now, validate_root_goal
from services.association_reconciliation import append_goal_association_event
from services.instance_goal_evidence import load_instance_goal_ids
from services.goal_condition_service import reconcile_activity_conditions
from services._completion_context import _emit_pending_events
from services.events import Event, Events, event_bus


class ActivityInstanceGoalService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _instance(self, root_id, instance_id, user_id, *, lock=False):
        if not validate_root_goal(self.db_session, root_id, owner_id=user_id):
            return None
        if lock:
            # A root-level lock also serializes ancestor condition rollups across instances.
            self.db_session.query(Goal).filter(Goal.id == root_id).with_for_update().one()
        query = self.db_session.query(ActivityInstance).filter(
            ActivityInstance.id == instance_id, ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at.is_(None),
            # Sessionless instances are supported; removed session contents are not.
            (ActivityInstance.session_id.is_(None) | ActivityInstance.session.has(Session.deleted_at.is_(None))),
        )
        if lock:
            query = query.populate_existing().with_for_update()
        return query.first()

    def get_goals(self, root_id, instance_id, user_id):
        instance = self._instance(root_id, instance_id, user_id)
        if not instance:
            return None, 'Activity instance not found or access denied', 404
        return self._payload(instance), None, 200

    def _payload(self, instance):
        links = load_instance_goal_ids(self.db_session, instance.root_id, instance_ids={instance.id})
        return {'instance_id': instance.id, 'associated_goal_ids': sorted(links.get(instance.id, set()))}

    def set_goal(self, root_id, instance_id, goal_id, user_id, *, remove=False):
        # Serialize changes per instance so duplicate requests cannot create duplicate rows.
        instance = self._instance(root_id, instance_id, user_id, lock=True)
        if not instance:
            return None, 'Activity instance not found or access denied', 404
        goal = self.db_session.query(Goal).filter(
            Goal.id == goal_id, Goal.root_id == root_id, Goal.deleted_at.is_(None),
        ).with_for_update().first()
        if not goal:
            return None, 'Goal not found in this fractal', 404
        table = activity_instance_goal_associations
        criteria = (table.c.activity_instance_id == instance_id, table.c.goal_id == goal_id)
        row = self.db_session.execute(select(table).where(*criteria)).first()
        active = row is not None and row.deleted_at is None
        if active == (not remove):
            return self._payload(instance), None, 200
        now = utc_now()
        if row:
            self.db_session.execute(table.update().where(*criteria).values(deleted_at=now if remove else None))
        else:
            self.db_session.execute(table.insert().values(activity_instance_id=instance_id, goal_id=goal_id, created_at=now))
        association_event = Event(Events.ACTIVITY_INSTANCE_DISASSOCIATED if remove else Events.ACTIVITY_INSTANCE_ASSOCIATED, {
            'root_id': root_id, 'goal_id': goal_id, 'activity_instance_id': instance_id,
            'activity_name': instance.definition.name,
        }, source='activity_instance_goal_service')
        append_goal_association_event(
            self.db_session, root_id=root_id, goal_id=goal_id, association_kind='activity_instance',
            association_id=instance_id, association_name=instance.definition.name,
            action='disassociated' if remove else 'associated', occurred_at=now, event_id=association_event.id,
        )
        pending = []
        reconcile_activity_conditions(
            self.db_session, root_id, instance.activity_definition_id, pending,
            trigger='activity_instance_link_changed',
        )
        self.db_session.commit()
        self.db_session.expire(instance, ['associated_goal_ids'])
        event_bus.emit(association_event)
        _emit_pending_events(pending)
        event_bus.emit(Event(Events.ACTIVITY_INSTANCE_UPDATED, {
            'root_id': root_id, 'instance_id': instance_id, 'session_id': instance.session_id,
            'updated_fields': ['associated_goal_ids'],
        }, source='activity_instance_goal_service'))
        return self._payload(instance), None, 200
