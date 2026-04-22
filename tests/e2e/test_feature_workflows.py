"""
End-to-end API workflow coverage for the activity-builder, countdown, and
delta-display features.
"""

from datetime import datetime, timedelta

import pytest

from models import ActivityInstance


@pytest.mark.e2e
class TestFeatureWorkflows:
    def test_inline_created_activity_preserves_builder_and_current_goal_associations(
        self,
        authed_client,
        sample_goal_hierarchy,
    ):
        root_id = sample_goal_hierarchy['ultimate'].id
        builder_selected_goal = sample_goal_hierarchy['mid_term']
        current_goal = sample_goal_hierarchy['short_term']

        create_response = authed_client.post(
            f'/api/{root_id}/activities',
            json={
                'name': 'Inline Full Builder Activity',
                'has_sets': True,
                'metrics': [
                    {'name': 'Weight', 'unit': 'lbs', 'is_best_set_metric': True},
                    {'name': 'Reps', 'unit': 'reps'},
                ],
                'goal_ids': [builder_selected_goal.id],
            },
        )

        assert create_response.status_code == 201
        created = create_response.get_json()
        assert created['metric_definitions'][0]['name'] == 'Weight'
        assert set(created['associated_goal_ids']) == {builder_selected_goal.id}

        attach_response = authed_client.post(
            f"/api/{root_id}/activities/{created['id']}/goals",
            json={'goal_ids': [builder_selected_goal.id, current_goal.id]},
        )

        assert attach_response.status_code == 200
        assert set(attach_response.get_json()['associated_goal_ids']) == {
            builder_selected_goal.id,
            current_goal.id,
        }

    def test_countdown_target_persists_through_start_and_completion(
        self,
        authed_client,
        db_session,
        sample_activity_instance,
    ):
        root_id = sample_activity_instance.root_id

        start_response = authed_client.post(
            f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/start',
            json={'target_duration_seconds': 3},
        )

        assert start_response.status_code == 200
        started = start_response.get_json()
        assert started['time_start'] is not None
        assert started['target_duration_seconds'] == 3

        db_session.expire_all()
        instance = db_session.query(ActivityInstance).get(sample_activity_instance.id)
        instance.time_start = datetime.utcnow() - timedelta(seconds=4)
        db_session.commit()

        complete_response = authed_client.post(
            f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/complete',
        )

        assert complete_response.status_code == 200
        completed = complete_response.get_json()
        assert completed['time_stop'] is not None
        assert completed['duration_seconds'] >= 3
        assert completed['target_duration_seconds'] == 3

    def test_delta_display_setting_round_trips_root_default_and_activity_override(
        self,
        authed_client,
        sample_ultimate_goal,
    ):
        root_id = sample_ultimate_goal.id

        root_response = authed_client.put(
            f'/api/{root_id}/goals/{root_id}',
            json={
                'progress_settings': {
                    'enabled': True,
                    'delta_display_mode': 'absolute',
                },
            },
        )

        assert root_response.status_code == 200
        assert root_response.get_json()['attributes']['progress_settings']['delta_display_mode'] == 'absolute'

        create_response = authed_client.post(
            f'/api/{root_id}/activities',
            json={
                'name': 'Delta Display Override',
                'delta_display_mode': 'percent',
                'metrics': [{'name': 'Weight', 'unit': 'lbs'}],
            },
        )

        assert create_response.status_code == 201
        activity = create_response.get_json()
        assert activity['delta_display_mode'] == 'percent'

        update_response = authed_client.put(
            f"/api/{root_id}/activities/{activity['id']}",
            json={'delta_display_mode': 'absolute'},
        )

        assert update_response.status_code == 200
        assert update_response.get_json()['delta_display_mode'] == 'absolute'
