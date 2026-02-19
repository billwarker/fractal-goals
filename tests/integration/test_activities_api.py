import pytest
import json
import uuid

@pytest.mark.integration
class TestActivityGroups:
    """Test Activity Group endpoints."""
    
    def test_create_activity_group(self, authed_client, sample_ultimate_goal):
        """Test creating an activity group."""
        root_id = sample_ultimate_goal.id
        payload = {
            'name': 'Cardio',
            'description': 'Endurance training'
        }
        
        response = authed_client.post(
            f'/api/{root_id}/activity-groups',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'Cardio'
        assert data['root_id'] == root_id
        assert data['sort_order'] is not None

    def test_get_activity_groups(self, authed_client, sample_ultimate_goal, sample_activity_group):
        """Test listing activity groups."""
        root_id = sample_ultimate_goal.id
        response = authed_client.get(f'/api/{root_id}/activity-groups')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(g['id'] == sample_activity_group.id for g in data)

    def test_update_activity_group(self, authed_client, sample_ultimate_goal, sample_activity_group):
        """Test updating an activity group."""
        root_id = sample_ultimate_goal.id
        group_id = sample_activity_group.id
        
        payload = {
            'name': 'Updated Strength',
            'description': 'Updated description'
        }
        
        response = authed_client.put(
            f'/api/{root_id}/activity-groups/{group_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Strength'
        assert data['description'] == 'Updated description'

    def test_delete_activity_group(self, authed_client, sample_ultimate_goal, sample_activity_group):
        """Test deleting an activity group."""
        root_id = sample_ultimate_goal.id
        group_id = sample_activity_group.id
        
        response = authed_client.delete(f'/api/{root_id}/activity-groups/{group_id}')
        assert response.status_code == 200
        
        # Verify deletion
        response = authed_client.get(f'/api/{root_id}/activity-groups')
        data = json.loads(response.data)
        assert not any(g['id'] == group_id for g in data)

    def test_reorder_activity_groups(self, authed_client, sample_ultimate_goal):
        """Test reordering activity groups."""
        root_id = sample_ultimate_goal.id
        
        # Create two groups
        id1 = authed_client.post(f'/api/{root_id}/activity-groups', json={'name': 'G1'}).get_json()['id']
        id2 = authed_client.post(f'/api/{root_id}/activity-groups', json={'name': 'G2'}).get_json()['id']
        
        # Reorder reversed
        payload = {'group_ids': [id2, id1]}
        response = authed_client.put(
            f'/api/{root_id}/activity-groups/reorder',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        
        # Verify order
        response = authed_client.get(f'/api/{root_id}/activity-groups')
        data = json.loads(response.data)
        # Filter only our test groups
        relevant = [g for g in data if g['id'] in [id1, id2]]
        # Because API sorts by sort_order, index 0 should be id2
        assert relevant[0]['id'] == id2
        assert relevant[1]['id'] == id1

    def test_activity_group_rejects_parent_cycle(self, authed_client, sample_ultimate_goal):
        """A group cannot be assigned under its own descendant."""
        root_id = sample_ultimate_goal.id
        group_a = authed_client.post(f'/api/{root_id}/activity-groups', json={'name': 'A'}).get_json()
        group_b = authed_client.post(
            f'/api/{root_id}/activity-groups',
            json={'name': 'B', 'parent_id': group_a['id']}
        ).get_json()

        response = authed_client.put(
            f"/api/{root_id}/activity-groups/{group_a['id']}",
            json={'parent_id': group_b['id']}
        )
        assert response.status_code == 400
        assert 'cycle' in response.get_json().get('error', '').lower()


@pytest.mark.integration
class TestActivities:
    """Test Activity Definition endpoints."""
    
    def test_create_activity_full(self, authed_client, sample_ultimate_goal, sample_activity_group):
        """Test creating an activity with metrics and splits."""
        root_id = sample_ultimate_goal.id
        payload = {
            'name': 'Squat',
            'description': 'Leg exercise',
            'group_id': sample_activity_group.id,
            'has_sets': True,
            'metrics': [
                {'name': 'Weight', 'unit': 'lbs', 'is_top_set_metric': True},
                {'name': 'Reps', 'unit': 'count'}
            ],
            'has_splits': True,
            'splits': [
                {'name': 'Split A'},
                {'name': 'Split B'}
            ]
        }
        
        response = authed_client.post(
            f'/api/{root_id}/activities',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'Squat'
        assert len(data['metric_definitions']) == 2
        assert len(data['split_definitions']) == 2
        assert data['has_splits'] is True

    def test_create_activity_allows_duplicate_names(self, authed_client, sample_ultimate_goal):
        """Activities with the same name should be allowed (different IDs)."""
        root_id = sample_ultimate_goal.id
        payload_one = {
            'name': 'Scale Practice',
            'description': 'Warmup scales',
        }
        payload_two = {
            'name': 'Scale Practice',
            'description': 'Arpeggio-focused variant',
        }

        response_one = authed_client.post(
            f'/api/{root_id}/activities',
            data=json.dumps(payload_one),
            content_type='application/json'
        )
        response_two = authed_client.post(
            f'/api/{root_id}/activities',
            data=json.dumps(payload_two),
            content_type='application/json'
        )

        assert response_one.status_code == 201
        assert response_two.status_code == 201

        data_one = json.loads(response_one.data)
        data_two = json.loads(response_two.data)
        assert data_one['name'] == 'Scale Practice'
        assert data_two['name'] == 'Scale Practice'
        assert data_one['id'] != data_two['id']

    def test_create_activity_rejects_invalid_group_id(self, authed_client, sample_ultimate_goal):
        """group_id must belong to the current fractal."""
        root_id = sample_ultimate_goal.id
        payload = {
            'name': 'Intervals',
            'group_id': str(uuid.uuid4())
        }
        response = authed_client.post(f'/api/{root_id}/activities', json=payload)
        assert response.status_code == 400
        assert 'group_id' in response.get_json().get('error', '').lower()

    def test_update_activity_rejects_invalid_group_id(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Updating group_id must validate group ownership."""
        root_id = sample_ultimate_goal.id
        response = authed_client.put(
            f'/api/{root_id}/activities/{sample_activity_definition.id}',
            json={'group_id': str(uuid.uuid4())}
        )
        assert response.status_code == 400
        assert 'group_id' in response.get_json().get('error', '').lower()

    def test_create_activity_rejects_partial_metric_rows(self, authed_client, sample_ultimate_goal):
        """Metric rows must include both name and unit."""
        root_id = sample_ultimate_goal.id
        payload = {
            'name': 'Technique',
            'metrics': [{'name': 'Speed'}]
        }
        response = authed_client.post(f'/api/{root_id}/activities', json=payload)
        assert response.status_code == 400
        assert 'both name and unit' in response.get_json().get('error', '').lower()

    def test_update_activity_rejects_partial_metric_rows(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Partial metric payloads should fail fast instead of deleting existing metrics."""
        root_id = sample_ultimate_goal.id
        activity_id = sample_activity_definition.id

        before_res = authed_client.get(f'/api/{root_id}/activities')
        before_data = before_res.get_json()
        before_activity = next(a for a in before_data if a['id'] == activity_id)
        before_metric_count = len(before_activity.get('metric_definitions') or [])

        response = authed_client.put(
            f'/api/{root_id}/activities/{activity_id}',
            json={'metrics': [{'name': 'Only Name'}]}
        )
        assert response.status_code == 400

        after_res = authed_client.get(f'/api/{root_id}/activities')
        after_data = after_res.get_json()
        after_activity = next(a for a in after_data if a['id'] == activity_id)
        assert len(after_activity.get('metric_definitions') or []) == before_metric_count

    def test_update_activity_metrics(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Test updating activity metrics (add, remove, update)."""
        root_id = sample_ultimate_goal.id
        activity_id = sample_activity_definition.id
        
        # Get current metrics
        current_metrics = sample_activity_definition.metric_definitions # DB object
        metric_id_to_keep = current_metrics[0].id
        metric_name_to_keep = current_metrics[0].name
        
        # Payload: Update existing, Add new, Remove others
        payload = {
            'metrics': [
                {
                    'id': metric_id_to_keep, 
                    'name': 'Updated Metric Name', 
                    'unit': 'kg'
                },
                {
                    'name': 'New Duration', 
                    'unit': 'sec'
                }
            ]
        }
        
        response = authed_client.put(
            f'/api/{root_id}/activities/{activity_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert len(data['metric_definitions']) == 2
        # Verify update
        updated = next(m for m in data['metric_definitions'] if m['id'] == metric_id_to_keep)
        assert updated['name'] == 'Updated Metric Name'
        assert updated['unit'] == 'kg'
        # Verify new
        new_m = next(m for m in data['metric_definitions'] if m['id'] != metric_id_to_keep)
        assert new_m['name'] == 'New Duration'

    def test_update_activity_splits(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Test updating activity splits."""
        root_id = sample_ultimate_goal.id
        activity_id = sample_activity_definition.id

        # Add splits initially via update because fixture has none
        payload = {
            'has_splits': True,
            'splits': [
                {'name': 'Left'},
                {'name': 'Right'}
            ]
        }
        authed_client.put(f'/api/{root_id}/activities/{activity_id}', json=payload)
        
        # Now update them
        # Get IDs? API returns them.
        response = authed_client.get(f'/api/{root_id}/activities')
        data = json.loads(response.data)
        activity = next(a for a in data if a['id'] == activity_id)
        split_id = activity['split_definitions'][0]['id']
        
        payload_update = {
            'splits': [
                {'id': split_id, 'name': 'Left Updated'},
                {'name': 'Center'} # Add new, implicitly deletes 'Right'
            ]
        }
        
        response = authed_client.put(
            f'/api/{root_id}/activities/{activity_id}',
            json=payload_update
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert len(data['split_definitions']) == 2
        updated = next(s for s in data['split_definitions'] if s['id'] == split_id)
        assert updated['name'] == 'Left Updated'
        other = next(s for s in data['split_definitions'] if s['id'] != split_id)
        assert other['name'] == 'Center'

    def test_delete_activity(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Test deleting an activity."""
        root_id = sample_ultimate_goal.id
        activity_id = sample_activity_definition.id
        
        response = authed_client.delete(f'/api/{root_id}/activities/{activity_id}')
        assert response.status_code == 200
        
        # Verify deletion
        response = authed_client.get(f'/api/{root_id}/activities')
        data = json.loads(response.data)
        assert not any(a['id'] == activity_id for a in data)

    def test_delete_activity_with_instances(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """
        Test deleting an activity that has instances (Soft Delete).
        This ensures we don't hit foreign key violations.
        """
        root_id = sample_ultimate_goal.id
        activity_id = sample_activity_definition.id
        
        # 1. Create a session and an activity instance using this activity
        session_payload = {
            'name': 'Test Session for Deletion',
            'root_id': root_id,
            'goal_ids': [root_id], # Link to a goal
            'goal_type': 'immediate'
        }
        res = authed_client.post(f'/api/{root_id}/sessions', json=session_payload)
        assert res.status_code == 201
        session_id = res.get_json()['id']
        
        # Create instance
        instance_payload = {
            'session_id': session_id,
            'activity_definition_id': activity_id
        }
        res = authed_client.post(f'/api/{root_id}/activity-instances', json=instance_payload)
        assert res.status_code == 201
        
        # 2. Try to delete the activity
        response = authed_client.delete(f'/api/{root_id}/activities/{activity_id}')
        assert response.status_code == 200
        
        # 3. Verify it is hidden from list
        res = authed_client.get(f'/api/{root_id}/activities')
        data = res.get_json()
        assert not any(a['id'] == activity_id for a in data)
