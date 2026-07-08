import uuid
from datetime import datetime, timezone

import pytest

from models import ActivityInstance, GoalLevel, GoalPauseInterval, Session, Target, activity_goal_associations


@pytest.mark.integration
class TestGoalTimelineApi:
    def test_timeline_includes_child_activity_completion_and_target(self, authed_client, db_session, sample_goal_hierarchy, sample_activity_definition):
        root_id = sample_goal_hierarchy['ultimate'].id
        parent_goal = sample_goal_hierarchy['mid_term']
        child_goal = sample_goal_hierarchy['short_term']

        db_session.execute(
            activity_goal_associations.insert().values(
                activity_id=sample_activity_definition.id,
                goal_id=child_goal.id,
            )
        )
        session = Session(
            id=str(uuid.uuid4()),
            root_id=root_id,
            name='Timeline Session',
            completed=True,
            completed_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
        )
        instance = ActivityInstance(
            id=str(uuid.uuid4()),
            root_id=root_id,
            session_id=session.id,
            activity_definition_id=sample_activity_definition.id,
            completed=True,
            created_at=datetime.now(timezone.utc),
            time_start=datetime.now(timezone.utc),
            time_stop=datetime.now(timezone.utc),
            duration_seconds=300,
            data={
                'sets': [
                    {
                        'metrics': [
                            {
                                'metric_id': sample_activity_definition.metric_definitions[0].id,
                                'value': 135,
                            },
                        ],
                    },
                ],
            },
        )
        target = Target(
            id=str(uuid.uuid4()),
            root_id=root_id,
            goal_id=child_goal.id,
            activity_id=sample_activity_definition.id,
            name='First clean rep',
            completed=True,
            completed_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
        )
        db_session.add_all([session, instance, target])
        db_session.commit()

        response = authed_client.get(
            f'/api/{root_id}/goals/{parent_goal.id}/timeline?types=activity,target'
        )

        assert response.status_code == 200
        entries = response.get_json()['entries']
        assert any(entry['event_type'] == 'activity.completed' and entry['entity_id'] == instance.id for entry in entries)
        assert any(entry['event_type'] == 'activity.associated' and entry['entity_id'] == sample_activity_definition.id for entry in entries)
        assert any(entry['event_type'] == 'target.created' and entry['entity_id'] == target.id for entry in entries)
        assert any(entry['event_type'] == 'target.achieved' and entry['entity_id'] == target.id for entry in entries)
        activity_entry = next(entry for entry in entries if entry['entity_id'] == instance.id)
        assert activity_entry['type'] == 'activity'
        assert activity_entry['relationship'] == 'descendant'
        assert activity_entry['source_goal_id'] == child_goal.id
        assert activity_entry['payload']['activity_definition']['id'] == sample_activity_definition.id
        assert any(
            metric['name'] == 'Weight'
            for metric in activity_entry['payload']['activity_definition']['metric_definitions']
        )
        assert activity_entry['payload']['sets'][0]['metrics'][0]['metric_id'] == sample_activity_definition.metric_definitions[0].id

    def test_timeline_includes_parent_inherited_activity_when_enabled(self, authed_client, db_session, sample_goal_hierarchy, sample_activity_definition):
        root_id = sample_goal_hierarchy['ultimate'].id
        parent_goal = sample_goal_hierarchy['mid_term']
        child_goal = sample_goal_hierarchy['short_term']
        child_goal.inherit_parent_activities = True

        db_session.execute(
            activity_goal_associations.insert().values(
                activity_id=sample_activity_definition.id,
                goal_id=parent_goal.id,
            )
        )
        session = Session(
            id=str(uuid.uuid4()),
            root_id=root_id,
            name='Parent Inherited Session',
            completed=True,
            completed_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
        )
        instance = ActivityInstance(
            id=str(uuid.uuid4()),
            root_id=root_id,
            session_id=session.id,
            activity_definition_id=sample_activity_definition.id,
            completed=True,
            created_at=datetime.now(timezone.utc),
            time_start=datetime.now(timezone.utc),
            time_stop=datetime.now(timezone.utc),
            duration_seconds=180,
            data={},
        )
        db_session.add_all([session, instance])
        db_session.commit()

        response = authed_client.get(
            f'/api/{root_id}/goals/{child_goal.id}/timeline?types=activity'
        )

        assert response.status_code == 200
        entries = response.get_json()['entries']
        activity_entry = next(entry for entry in entries if entry['entity_id'] == instance.id)
        assert activity_entry['relationship'] == 'parent_inherited'
        assert activity_entry['source_goal_id'] == parent_goal.id

    def test_timeline_respects_type_filter(self, authed_client, db_session, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy['ultimate'].id
        child_goal = sample_goal_hierarchy['short_term']
        child_goal.completed = True
        child_goal.completed_at = datetime.now(timezone.utc)
        db_session.commit()

        response = authed_client.get(
            f'/api/{root_id}/goals/{sample_goal_hierarchy["mid_term"].id}/timeline?types=child_goal'
        )

        assert response.status_code == 200
        entries = response.get_json()['entries']
        assert entries
        assert {entry['type'] for entry in entries} == {'child_goal'}
        assert {'goal.created', 'goal.completed'} <= {entry['event_type'] for entry in entries}

    def test_timeline_includes_self_goal_lifecycle_events(self, authed_client, db_session, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy['ultimate'].id
        goal = sample_goal_hierarchy['short_term']
        goal.created_at = datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc)
        goal.completed = True
        goal.completed_at = datetime(2026, 5, 7, 18, 30, tzinfo=timezone.utc)
        db_session.commit()

        response = authed_client.get(
            f'/api/{root_id}/goals/{goal.id}/timeline?types=goal_lifecycle&include_children=false'
        )

        assert response.status_code == 200
        entries = response.get_json()['entries']
        assert {entry['type'] for entry in entries} == {'goal_lifecycle'}
        self_events = {entry['event_type']: entry for entry in entries}
        assert self_events['goal.created']['entity_id'] == goal.id
        assert self_events['goal.created']['relationship'] == 'self'
        assert self_events['goal.completed']['entity_id'] == goal.id
        assert self_events['goal.completed']['relationship'] == 'self'

    def test_timeline_includes_goal_pause_and_resume_events(self, authed_client, db_session, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy['ultimate'].id
        parent_goal = sample_goal_hierarchy['mid_term']
        child_goal = sample_goal_hierarchy['short_term']
        interval = GoalPauseInterval(
            goal_id=child_goal.id,
            root_id=root_id,
            paused_at=datetime(2026, 5, 4, 9, 0, tzinfo=timezone.utc),
            resumed_at=datetime(2026, 5, 5, 10, 15, tzinfo=timezone.utc),
        )
        db_session.add(interval)
        db_session.commit()

        response = authed_client.get(
            f'/api/{root_id}/goals/{parent_goal.id}/timeline?types=goal_lifecycle'
        )

        assert response.status_code == 200
        entries = response.get_json()['entries']
        paused = next(entry for entry in entries if entry['event_type'] == 'goal.paused')
        resumed = next(entry for entry in entries if entry['event_type'] == 'goal.resumed')
        assert paused['type'] == 'goal_lifecycle'
        assert paused['entity_id'] == child_goal.id
        assert paused['relationship'] == 'descendant'
        assert paused['payload']['pause_interval_id'] == interval.id
        assert resumed['entity_id'] == child_goal.id
        assert resumed['payload']['pause_interval_id'] == interval.id

    def test_descendant_lifecycle_uses_effective_child_goal_level_style(
        self,
        authed_client,
        db_session,
        sample_goal_hierarchy,
        test_user,
    ):
        root_id = sample_goal_hierarchy['ultimate'].id
        parent_goal = sample_goal_hierarchy['mid_term']
        child_goal = sample_goal_hierarchy['short_term']
        system_short_level = GoalLevel(
            id=str(uuid.uuid4()),
            name='Short Term Goal',
            rank=3,
            color='#111111',
            secondary_color='#222222',
            icon='circle',
        )
        root_short_level = GoalLevel(
            id=str(uuid.uuid4()),
            name='Short Term Goal',
            rank=3,
            color='#00a8c8',
            secondary_color='#003947',
            icon='hexagon',
            owner_id=test_user.id,
            root_id=root_id,
        )
        child_goal.level_id = system_short_level.id
        child_goal.description = 'Specific child goal'
        child_goal.relevance_statement = 'Relevant child goal'
        child_goal.track_activities = False
        child_goal.completed = False
        child_goal.manually_uncompleted_at = datetime(2026, 7, 7, 13, 1, tzinfo=timezone.utc)
        db_session.add_all([system_short_level, root_short_level])
        db_session.commit()

        response = authed_client.get(
            f'/api/{root_id}/goals/{parent_goal.id}/timeline?types=goal_lifecycle'
        )

        assert response.status_code == 200
        entries = response.get_json()['entries']
        uncompleted = next(entry for entry in entries if entry['event_type'] == 'goal.uncompleted')
        assert uncompleted['entity_id'] == child_goal.id
        assert uncompleted['relationship'] == 'descendant'
        assert uncompleted['payload']['level_name'] == 'Short Term Goal'
        assert uncompleted['payload']['level_style_source'] == 'effective'
        assert uncompleted['payload']['level']['icon'] == 'hexagon'
        assert uncompleted['payload']['level']['color'] == '#00a8c8'
        assert uncompleted['payload']['level']['secondary_color'] == '#003947'
        assert uncompleted['payload']['level_characteristics']['icon'] == 'hexagon'
        assert uncompleted['payload']['is_smart'] is True

    def test_timeline_includes_latest_manual_uncompletion(self, authed_client, db_session, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy['ultimate'].id
        goal = sample_goal_hierarchy['short_term']
        goal.completed = False
        goal.completed_at = None
        goal.manually_uncompleted_at = datetime(2026, 5, 8, 14, 45, tzinfo=timezone.utc)
        db_session.commit()

        response = authed_client.get(
            f'/api/{root_id}/goals/{goal.id}/timeline?types=goal_lifecycle&include_children=false'
        )

        assert response.status_code == 200
        entries = response.get_json()['entries']
        assert any(
            entry['event_type'] == 'goal.uncompleted'
            and entry['entity_id'] == goal.id
            and entry['relationship'] == 'self'
            for entry in entries
        )

    def test_timeline_can_exclude_children(self, authed_client, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy['ultimate'].id
        response = authed_client.get(
            f'/api/{root_id}/goals/{sample_goal_hierarchy["mid_term"].id}/timeline?types=child_goal&include_children=false'
        )

        assert response.status_code == 200
        assert response.get_json()['entries'] == []

    def test_goal_lifecycle_can_exclude_children(self, authed_client, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['mid_term'].id
        response = authed_client.get(
            f'/api/{root_id}/goals/{goal_id}/timeline?types=goal_lifecycle&include_children=false'
        )

        assert response.status_code == 200
        entries = response.get_json()['entries']
        assert entries
        assert {entry['entity_id'] for entry in entries} == {goal_id}
