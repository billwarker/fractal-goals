import uuid
from datetime import datetime, timezone

import pytest

from models import ActivityInstance, Session, Target, activity_goal_associations


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
            data={},
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

    def test_timeline_can_exclude_children(self, authed_client, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy['ultimate'].id
        response = authed_client.get(
            f'/api/{root_id}/goals/{sample_goal_hierarchy["mid_term"].id}/timeline?types=child_goal&include_children=false'
        )

        assert response.status_code == 200
        assert response.get_json()['entries'] == []
