"""Lifetime evidence and day inspection against real PostgreSQL read paths."""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import event
from models import ActivityInstance, EventLog, GoalPauseInterval, Session, Target, User, activity_goal_associations

UTC = timezone.utc


@pytest.fixture
def heatmap_evidence(db_session, sample_goal_hierarchy, sample_activity_definition):
    parent = sample_goal_hierarchy['mid_term']
    child = sample_goal_hierarchy['short_term']
    root = sample_goal_hierarchy['ultimate']
    parent.created_at = child.created_at = datetime(2026, 7, 1, tzinfo=UTC)
    parent.completed = True
    parent.completed_at = datetime(2026, 7, 4, 3, tzinfo=UTC)
    session = Session(id=str(uuid.uuid4()), owner_id=root.owner_id, root_id=root.id, name='Heatmap work')
    db_session.add(session)
    db_session.execute(activity_goal_associations.insert(), [
        {'goal_id': item.id, 'activity_id': sample_activity_definition.id} for item in [parent, child]
    ])
    instances = []
    for index in range(206):
        occurred = datetime(2026, 7, 2, 2 if index == 0 else 12, tzinfo=UTC)
        instance = ActivityInstance(
            id=str(uuid.uuid4()), root_id=root.id, session_id=session.id,
            activity_definition_id=sample_activity_definition.id,
            completed=True, created_at=occurred, time_start=occurred, time_stop=occurred,
            duration_seconds=None if index == 0 else 60, data={},
        )
        instances.append(instance)
    # Both out-of-lifetime and incomplete rows must be absent.
    for occurred, completed in [(datetime(2026, 6, 30, tzinfo=UTC), True),
                                (datetime(2026, 7, 4, 4, tzinfo=UTC), True),
                                (datetime(2026, 7, 2, 12, tzinfo=UTC), False)]:
        instances.append(ActivityInstance(
            id=str(uuid.uuid4()), root_id=root.id, session_id=session.id,
            activity_definition_id=sample_activity_definition.id,
            completed=completed, created_at=occurred, time_start=occurred, time_stop=occurred,
            duration_seconds=10000, data={},
        ))
    target = Target(id=str(uuid.uuid4()), root_id=root.id, goal_id=child.id,
                    activity_id=sample_activity_definition.id, name='Milestone', completed=True,
                    created_at=datetime(2026, 7, 2, 12, tzinfo=UTC),
                    completed_at=datetime(2026, 7, 2, 12, tzinfo=UTC))
    db_session.add_all(instances + [target])
    db_session.commit()
    return root, parent, child, instances, target


@pytest.mark.integration
class TestGoalActivityHeatmap:
    def test_subsecond_creation_and_new_events_do_not_shift_cursor_pages(self, authed_client, db_session, heatmap_evidence):
        root, parent, _, instances, _ = heatmap_evidence
        parent.created_at = datetime(2026, 7, 1, 0, 0, 0, 123456, tzinfo=UTC)
        db_session.commit()
        url = f'/api/{root.id}/goals/{parent.id}/activity-heatmap'
        calendar = authed_client.get(url).get_json()
        first = authed_client.get(url, query_string={'view': 'entries', 'metric': 'events', 'limit': 20}).get_json()
        assert first['pagination']['total'] == calendar['total_events']
        assert calendar['days'][0]['events'] == 1
        newest = datetime(2026, 7, 3, 12, tzinfo=UTC)
        db_session.add(ActivityInstance(id=str(uuid.uuid4()), root_id=root.id, session_id=instances[0].session_id,
            activity_definition_id=instances[0].activity_definition_id, completed=True,
            created_at=newest, time_start=newest, time_stop=newest, duration_seconds=60, data={}))
        db_session.commit()
        second = authed_client.get(url, query_string={'view': 'entries', 'metric': 'events', 'limit': 20,
            'cursor': first['pagination']['next_cursor']}).get_json()
        assert not {entry['id'] for entry in first['entries']} & {entry['id'] for entry in second['entries']}
        assert all(entry['timestamp'] < '2026-07-03' for entry in second['entries'])

    def test_cursor_pages_exhaust_history_without_duplicates_or_rich_overfetch(self, authed_client, heatmap_evidence, monkeypatch):
        from services import goal_timeline_service
        root, parent, _, _, _ = heatmap_evidence
        original = goal_timeline_service.serialize_activity_instance
        serialized = []
        def track(instance):
            serialized.append(instance.id)
            return original(instance)
        monkeypatch.setattr(goal_timeline_service, 'serialize_activity_instance', track)
        url = f'/api/{root.id}/goals/{parent.id}/activity-heatmap'
        cursor = None
        ids = []
        while True:
            response = authed_client.get(url, query_string={'view': 'entries', 'metric': 'activities', 'limit': 20, **({'cursor': cursor} if cursor else {})})
            assert response.status_code == 200
            page = response.get_json()
            assert page['pagination']['total'] == 206
            assert len(page['entries']) <= 20
            ids.extend(entry['id'] for entry in page['entries'])
            assert len(serialized) == len(ids)
            cursor = page['pagination']['next_cursor']
            if not cursor:
                break
        assert len(ids) == len(set(ids)) == 206

    def test_page_modes_days_and_descendant_scope_match_calendar(self, authed_client, heatmap_evidence):
        root, parent, _, _, _ = heatmap_evidence
        url = f'/api/{root.id}/goals/{parent.id}/activity-heatmap'
        calendar = authed_client.get(url).get_json()
        all_events = authed_client.get(url, query_string={'view': 'entries', 'metric': 'events'}).get_json()
        assert all_events['pagination']['total'] == calendar['total_events']
        timed = authed_client.get(url, query_string={'view': 'entries', 'metric': 'duration'}).get_json()
        assert timed['pagination']['total'] == 205
        assert all(entry['payload']['duration_seconds'] > 0 for entry in timed['entries'])
        day = authed_client.get(url, query_string={'view': 'entries', 'metric': 'activities', 'date': '2026-07-01', 'timezone': 'America/Toronto'}).get_json()
        assert day['pagination']['total'] == len(day['entries']) == 1
        own = authed_client.get(url, query_string={'view': 'entries', 'metric': 'events', 'include_children': 'false', 'limit': 100}).get_json()
        assert own['pagination']['total'] < all_events['pagination']['total']
        assert all(entry['relationship'] != 'descendant' for entry in own['entries'])

    @pytest.mark.parametrize('query', ['view=bad', 'view=entries&metric=bad', 'view=entries&limit=0', 'view=entries&limit=101', 'view=entries&limit=oops', 'view=entries&cursor=garbage'])
    def test_page_options_are_validated(self, authed_client, heatmap_evidence, query):
        root, parent, _, _, _ = heatmap_evidence
        assert authed_client.get(f'/api/{root.id}/goals/{parent.id}/activity-heatmap?{query}').status_code == 400

    def test_lifetime_is_complete_local_and_deduplicated(self, authed_client, db_session, heatmap_evidence, monkeypatch):
        from services import goal_timeline_service
        root, parent, child, instances, _ = heatmap_evidence
        # Daily summaries must not load/serialize rich activity cards or their sets.
        monkeypatch.setattr(goal_timeline_service, 'serialize_activity_instance', lambda _: pytest.fail('Summary serialized a full activity'))
        statements = []
        def capture(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)
        engine = db_session.get_bind()
        event.listen(engine, 'before_cursor_execute', capture)
        try:
            response = authed_client.get(f'/api/{root.id}/goals/{parent.id}/activity-heatmap?timezone=America/Toronto')
        finally:
            event.remove(engine, 'before_cursor_execute', capture)
        assert response.status_code == 200
        data = response.get_json()
        assert data['range_start'] == '2026-06-30'
        assert data['range_end'] == '2026-07-03'
        assert data['total_activities'] == 206
        assert data['total_duration_seconds'] == 205 * 60
        assert data['work_days'] == 2
        by_date = {day['date']: day for day in data['days']}
        assert by_date['2026-07-01']['activities'] == 1
        assert by_date['2026-07-02']['activities'] == 205
        assert by_date['2026-07-02']['milestones'] == 1
        assert by_date['2026-07-03']['milestones'] == 1
        assert len(statements) < 30  # Independent of the 206 evidence rows.
        assert not any('FROM activity_sets' in statement for statement in statements)

    def test_day_inspection_is_untruncated_and_uses_the_same_timezone(self, authed_client, heatmap_evidence):
        root, parent, _, instances, _ = heatmap_evidence
        endpoint = f'/api/{root.id}/goals/{parent.id}/activity-heatmap'
        response = authed_client.get(endpoint + '?timezone=America/Toronto&date=2026-07-02')
        assert response.status_code == 200
        entries = response.get_json()['entries']
        activities = [entry for entry in entries if entry['event_type'] == 'activity.completed']
        assert len(activities) == 205
        assert all(entry['entity_id'] != instances[0].id for entry in activities)
        assert activities[0]['payload']['activity_definition']
        assert {entry['event_type'] for entry in entries} == {'activity.completed', 'target.created', 'target.achieved'}

    def test_children_scope_pause_days_and_reopening(self, authed_client, db_session, heatmap_evidence):
        root, parent, child, _, _ = heatmap_evidence
        db_session.execute(activity_goal_associations.delete().where(activity_goal_associations.c.goal_id == parent.id))
        db_session.add(GoalPauseInterval(goal_id=parent.id, root_id=root.id,
            paused_at=datetime(2026, 7, 1, 12, tzinfo=UTC), resumed_at=datetime(2026, 7, 3, 12, tzinfo=UTC)))
        db_session.commit()
        endpoint = f'/api/{root.id}/goals/{parent.id}/activity-heatmap'
        own = authed_client.get(endpoint + '?include_children=false').get_json()
        assert own['total_activities'] == 0
        assert own['days'][0]['events'] == 2
        assert own['days'][1]['paused'] is True
        assert own['days'][2]['paused'] is False
        assert authed_client.get(endpoint).get_json()['total_activities'] == 206
        parent.completed = False
        parent.completed_at = None
        db_session.commit()
        reopened = authed_client.get(endpoint).get_json()
        assert reopened['range_end'] == datetime.now(UTC).date().isoformat()
        assert reopened['total_activities'] == 207

    def test_all_association_events_survive_timeline_limit(self, authed_client, db_session, heatmap_evidence):
        root, parent, _, _, _ = heatmap_evidence
        for index in range(220):
            db_session.add(EventLog(id=str(uuid.uuid4()), root_id=root.id,
                event_type='activity.associated', entity_type='activity_definition', entity_id=str(uuid.uuid4()),
                timestamp=datetime(2026, 7, 3, 12, tzinfo=UTC),
                payload={'goal_id': parent.id, 'activity_name': f'Planning {index}'}))
        db_session.commit()
        data = authed_client.get(f'/api/{root.id}/goals/{parent.id}/activity-heatmap').get_json()
        assert next(day for day in data['days'] if day['date'] == '2026-07-03')['events'] == 220

    @pytest.mark.parametrize('query', ['timezone=Invalid/Timezone', 'date=2026-7-02', 'date=2026-02-30', 'date=2026-06-01', 'date=2026-07-05'])
    def test_invalid_options(self, authed_client, heatmap_evidence, query):
        root, parent, _, _, _ = heatmap_evidence
        assert authed_client.get(f'/api/{root.id}/goals/{parent.id}/activity-heatmap?{query}').status_code == 400

    @pytest.mark.parametrize('day, first_hour, next_hour', [
        ('2026-03-08', 5, 4),  # Toronto spring transition: 23 hours.
        ('2025-11-02', 4, 5),  # Toronto fall transition: 25 hours.
    ])
    def test_day_queries_follow_dst_boundaries(self, authed_client, db_session, heatmap_evidence, day, first_hour, next_hour):
        from datetime import timedelta
        root, parent, child, instances, _ = heatmap_evidence
        day_start = datetime.strptime(day, '%Y-%m-%d').replace(hour=first_hour, tzinfo=UTC)
        next_day = (day_start + timedelta(days=1)).replace(hour=next_hour)
        parent.created_at = child.created_at = day_start - timedelta(days=2)
        parent.completed_at = next_day + timedelta(days=2)
        for occurred in [day_start, next_day - timedelta(seconds=1), next_day]:
            db_session.add(ActivityInstance(
                id=str(uuid.uuid4()), root_id=root.id, session_id=instances[0].session_id,
                activity_definition_id=instances[0].activity_definition_id,
                completed=True, created_at=occurred, time_start=occurred, time_stop=occurred,
                duration_seconds=60, data={},
            ))
        db_session.commit()
        response = authed_client.get(f'/api/{root.id}/goals/{parent.id}/activity-heatmap?timezone=America/Toronto&date={day}')
        assert response.status_code == 200
        assert len([entry for entry in response.get_json()['entries'] if entry['event_type'] == 'activity.completed']) == 2

    def test_owner_scope_and_deleted_goal(self, authed_client, db_session, heatmap_evidence, test_user):
        root, parent, _, _, _ = heatmap_evidence
        assert authed_client.get(f'/api/{root.id}/goals/missing/activity-heatmap').status_code == 404
        assert authed_client.get(f'/api/missing/goals/{parent.id}/activity-heatmap').status_code == 404
        other_user = User(id=str(uuid.uuid4()), username='other_heatmap_user', email='other_heatmap@example.com', password_hash='unused')
        db_session.add(other_user)
        db_session.flush()
        root.owner_id = other_user.id
        db_session.commit()
        assert authed_client.get(f'/api/{root.id}/goals/{parent.id}/activity-heatmap').status_code == 404
        root.owner_id = test_user.id
        parent.deleted_at = datetime.now(UTC)
        db_session.commit()
        assert authed_client.get(f'/api/{root.id}/goals/{parent.id}/activity-heatmap').status_code == 404
