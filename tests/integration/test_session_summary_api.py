import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from models import ActivityInstance, Program, ProgramBlock, ProgramDay, Session, activity_goal_associations, session_goals


@pytest.mark.integration
class TestSessionSummaryApi:
    def test_activity_instantiation_summary_returns_latest_timestamp(
        self,
        authed_client,
        db_session,
        sample_practice_session,
        sample_activity_instance,
    ):
        root_id = sample_practice_session.root_id
        latest_start = datetime(2026, 2, 10, 14, 0, tzinfo=timezone.utc)
        older_start = datetime(2026, 1, 10, 14, 0, tzinfo=timezone.utc)

        sample_practice_session.session_start = latest_start

        older_session = Session(
            id=str(uuid4()),
            name='Older Session',
            description='Previous work',
            root_id=root_id,
            session_start=older_start,
            created_at=older_start,
            attributes=json.dumps({}),
        )
        db_session.add(older_session)
        db_session.flush()

        db_session.add(
            ActivityInstance(
                id=str(uuid4()),
                session_id=older_session.id,
                activity_definition_id=sample_activity_instance.activity_definition_id,
                root_id=root_id,
                created_at=older_start,
                data=json.dumps({}),
            )
        )
        db_session.commit()

        response = authed_client.get(f'/api/{root_id}/sessions/activity-instantiation-summary')
        assert response.status_code == 200

        payload = json.loads(response.data)
        assert payload['latest_by_activity'][sample_activity_instance.activity_definition_id] == '2026-02-10T14:00:00Z'

    def test_evidence_goals_returns_recent_goal_ids(
        self,
        authed_client,
        db_session,
        sample_practice_session,
        sample_activity_definition,
        sample_goal_hierarchy,
        sample_activity_instance,
    ):
        root_id = sample_practice_session.root_id
        recent_stop = datetime.now(timezone.utc) - timedelta(days=1)

        db_session.execute(
            activity_goal_associations.insert().values(
                activity_id=sample_activity_definition.id,
                goal_id=sample_goal_hierarchy['short_term'].id,
            )
        )

        sample_practice_session.completed = True
        sample_practice_session.session_end = recent_stop
        sample_practice_session.completed_at = recent_stop
        sample_activity_instance.completed = True
        sample_activity_instance.time_stop = recent_stop
        sample_activity_instance.duration_seconds = 900
        db_session.commit()

        response = authed_client.get(f'/api/{root_id}/sessions/evidence-goals?days=7')
        assert response.status_code == 200

        payload = json.loads(response.data)
        assert sample_goal_hierarchy['short_term'].id in payload['goal_ids']
        assert payload['window_days'] == 7

    def test_flowtree_metrics_counts_activity_and_direct_goal_sessions(
        self,
        authed_client,
        db_session,
        sample_practice_session,
        sample_activity_definition,
        sample_goal_hierarchy,
        sample_activity_instance,
    ):
        root_id = sample_practice_session.root_id
        visible_goal_id = sample_goal_hierarchy['short_term'].id
        recent_end = datetime.now(timezone.utc) - timedelta(days=1)

        db_session.execute(
            activity_goal_associations.insert().values(
                activity_id=sample_activity_definition.id,
                goal_id=visible_goal_id,
            )
        )

        sample_practice_session.completed = True
        sample_practice_session.session_start = recent_end - timedelta(minutes=30)
        sample_practice_session.session_end = recent_end
        sample_practice_session.completed_at = recent_end
        sample_practice_session.total_duration_seconds = 1800
        sample_activity_instance.completed = True
        sample_activity_instance.time_stop = recent_end
        sample_activity_instance.duration_seconds = 600

        program = Program(
            id=str(uuid4()),
            root_id=root_id,
            name='Strength Cycle',
            description='Test program',
            start_date=recent_end,
            end_date=recent_end + timedelta(days=14),
            weekly_schedule={},
        )
        block = ProgramBlock(
            id=str(uuid4()),
            program_id=program.id,
            name='Block A',
        )
        day = ProgramDay(
            id=str(uuid4()),
            block_id=block.id,
            day_number=1,
            name='Day 1',
        )
        db_session.add_all([program, block, day])
        db_session.flush()
        sample_practice_session.program_day_id = day.id

        direct_goal_session = Session(
            id=str(uuid4()),
            name='Goal Linked Session',
            description='Direct goal evidence',
            root_id=root_id,
            session_start=recent_end,
            session_end=recent_end + timedelta(minutes=15),
            total_duration_seconds=900,
            created_at=recent_end,
            completed=True,
            completed_at=recent_end + timedelta(minutes=15),
            attributes=json.dumps({}),
        )
        db_session.add(direct_goal_session)
        db_session.flush()
        db_session.execute(
            session_goals.insert().values(
                session_id=direct_goal_session.id,
                goal_id=visible_goal_id,
                goal_type='Short Term Goal',
            )
        )
        db_session.commit()

        response = authed_client.get(
            f'/api/{root_id}/sessions/flowtree-metrics?goal_ids={visible_goal_id}&days=7'
        )
        assert response.status_code == 200

        payload = json.loads(response.data)
        assert payload['completed_sessions_count'] == 2
        assert payload['completed_instances_count'] == 1
        assert payload['total_session_duration_seconds'] == 2700
        assert payload['total_instance_duration_seconds'] == 600
        assert payload['recent_sessions_count'] == 2
        assert payload['recent_instances_count'] == 1
        assert payload['recent_session_duration_seconds'] == 2700
        assert payload['program_sessions_count'] == 1
        assert payload['recent_program_sessions_count'] == 1
