import pytest
import json
import uuid

@pytest.mark.integration
class TestActivityGroups:
    """Test Activity Group endpoints."""
    
    def test_create_activity_group(self, client, sample_ultimate_goal):
        """Test creating an activity group."""
        root_id = sample_ultimate_goal.id
        payload = {
            'name': 'Cardio',
            'description': 'Endurance training'
        }
        
        response = client.post(
            f'/api/{root_id}/activity-groups',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'Cardio'
        assert data['root_id'] == root_id
        assert data['sort_order'] is not None

    def test_get_activity_groups(self, client, sample_ultimate_goal, sample_activity_group):
        """Test listing activity groups."""
        root_id = sample_ultimate_goal.id
        response = client.get(f'/api/{root_id}/activity-groups')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(g['id'] == sample_activity_group.id for g in data)

    def test_update_activity_group(self, client, sample_ultimate_goal, sample_activity_group):
        """Test updating an activity group."""
        root_id = sample_ultimate_goal.id
        group_id = sample_activity_group.id
        
        payload = {
            'name': 'Updated Strength',
            'description': 'Updated description'
        }
        
        response = client.put(
            f'/api/{root_id}/activity-groups/{group_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Strength'
        assert data['description'] == 'Updated description'

    def test_delete_activity_group(self, client, sample_ultimate_goal, sample_activity_group):
        """Test deleting an activity group."""
        root_id = sample_ultimate_goal.id
        group_id = sample_activity_group.id
        
        response = client.delete(f'/api/{root_id}/activity-groups/{group_id}')
        assert response.status_code == 200
        
        # Verify deletion
        response = client.get(f'/api/{root_id}/activity-groups')
        data = json.loads(response.data)
        assert not any(g['id'] == group_id for g in data)

    def test_reorder_activity_groups(self, client, sample_ultimate_goal):
        """Test reordering activity groups."""
        root_id = sample_ultimate_goal.id
        
        # Create two groups
        id1 = client.post(f'/api/{root_id}/activity-groups', json={'name': 'G1'}).get_json()['id']
        id2 = client.post(f'/api/{root_id}/activity-groups', json={'name': 'G2'}).get_json()['id']
        
        # Reorder reversed
        payload = {'group_ids': [id2, id1]}
        response = client.put(
            f'/api/{root_id}/activity-groups/reorder',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        
        # Verify order
        response = client.get(f'/api/{root_id}/activity-groups')
        data = json.loads(response.data)
        # Filter only our test groups
        relevant = [g for g in data if g['id'] in [id1, id2]]
        # Because API sorts by sort_order, index 0 should be id2
        assert relevant[0]['id'] == id2
        assert relevant[1]['id'] == id1


@pytest.mark.integration
class TestActivities:
    """Test Activity Definition endpoints."""
    
    def test_create_activity_full(self, client, sample_ultimate_goal, sample_activity_group):
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
        
        response = client.post(
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

    def test_update_activity_metrics(self, client, sample_ultimate_goal, sample_activity_definition):
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
        
        response = client.put(
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

    def test_update_activity_splits(self, client, sample_ultimate_goal, sample_activity_definition):
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
        client.put(f'/api/{root_id}/activities/{activity_id}', json=payload)
        
        # Now update them
        # Get IDs? API returns them.
        response = client.get(f'/api/{root_id}/activities')
        data = json.loads(response.data)
        activity = next(a for a in data if a['id'] == activity_id)
        split_id = activity['split_definitions'][0]['id']
        
        payload_update = {
            'splits': [
                {'id': split_id, 'name': 'Left Updated'},
                {'name': 'Center'} # Add new, implicitly deletes 'Right'
            ]
        }
        
        response = client.put(
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

    def test_delete_activity(self, client, sample_ultimate_goal, sample_activity_definition):
        """Test deleting an activity."""
        root_id = sample_ultimate_goal.id
        activity_id = sample_activity_definition.id
        
        response = client.delete(f'/api/{root_id}/activities/{activity_id}')
        assert response.status_code == 200
        
        # Verify deletion
        response = client.get(f'/api/{root_id}/activities')
        data = json.loads(response.data)
        assert not any(a['id'] == activity_id for a in data)
