import pytest
import json
import uuid
from models import ActivityGroup, ActivityMode, MetricDefinition, Goal, SplitDefinition


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

    def test_delete_activity_group(self, authed_client, db_session, sample_ultimate_goal, sample_activity_group):
        """Test deleting an activity group."""
        root_id = sample_ultimate_goal.id
        group_id = sample_activity_group.id
        
        response = authed_client.delete(f'/api/{root_id}/activity-groups/{group_id}')
        assert response.status_code == 200

        db_session.expire_all()
        deleted_group = db_session.query(ActivityGroup).filter_by(id=group_id).first()
        assert deleted_group is not None
        assert deleted_group.deleted_at is not None
        
        # Verify deletion
        response = authed_client.get(f'/api/{root_id}/activity-groups')
        data = json.loads(response.data)
        assert not any(g['id'] == group_id for g in data)

    def test_delete_activity_group_soft_deletes_descendants_and_detaches_activities(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
        sample_activity_group,
    ):
        """Deleting a parent group should soft-delete descendants and detach their activities."""
        root_id = sample_ultimate_goal.id
        parent_group_id = sample_activity_group.id

        child_group = authed_client.post(
            f'/api/{root_id}/activity-groups',
            json={'name': 'Child Group', 'parent_id': parent_group_id}
        ).get_json()

        activity = authed_client.post(
            f'/api/{root_id}/activities',
            json={'name': 'Nested Activity', 'group_id': child_group['id']}
        ).get_json()

        response = authed_client.delete(f'/api/{root_id}/activity-groups/{parent_group_id}')
        assert response.status_code == 200

        db_session.expire_all()
        deleted_child = db_session.query(ActivityGroup).filter_by(id=child_group['id']).first()
        assert deleted_child is not None
        assert deleted_child.deleted_at is not None

        response = authed_client.get(f'/api/{root_id}/activity-groups')
        groups = response.get_json()
        assert not any(group['id'] == child_group['id'] for group in groups)

        activities_response = authed_client.get(f'/api/{root_id}/activities')
        activities = activities_response.get_json()
        deleted_activity = next(item for item in activities if item['id'] == activity['id'])
        assert deleted_activity['group_id'] is None

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

    def test_create_activity_group_with_goal_ids_persists_associations(self, authed_client, sample_goal_hierarchy):
        """Create should persist provided group-goal associations."""
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_ids = [sample_goal_hierarchy['ultimate'].id, sample_goal_hierarchy['short_term'].id]

        response = authed_client.post(
            f'/api/{root_id}/activity-groups',
            json={'name': 'Linked Group', 'goal_ids': goal_ids}
        )

        assert response.status_code == 201
        data = response.get_json()
        assert set(data['associated_goal_ids']) == set(goal_ids)

    def test_set_activity_group_goals_replaces_associations(self, authed_client, sample_goal_hierarchy, sample_activity_group):
        """Setting group-goal associations should replace the previous set."""
        root_id = sample_goal_hierarchy['ultimate'].id
        group_id = sample_activity_group.id
        first_goal_id = sample_goal_hierarchy['ultimate'].id
        second_goal_id = sample_goal_hierarchy['short_term'].id

        first_response = authed_client.post(
            f'/api/{root_id}/activity-groups/{group_id}/goals',
            json={'goal_ids': [first_goal_id, second_goal_id]}
        )
        assert first_response.status_code == 200
        assert set(first_response.get_json()['associated_goal_ids']) == {first_goal_id, second_goal_id}

        replace_response = authed_client.post(
            f'/api/{root_id}/activity-groups/{group_id}/goals',
            json={'goal_ids': [second_goal_id]}
        )
        assert replace_response.status_code == 200
        assert set(replace_response.get_json()['associated_goal_ids']) == {second_goal_id}

    def test_set_activity_group_goals_rejects_non_array_goal_ids(
        self,
        authed_client,
        sample_ultimate_goal,
        sample_activity_group,
    ):
        root_id = sample_ultimate_goal.id
        response = authed_client.post(
            f'/api/{root_id}/activity-groups/{sample_activity_group.id}/goals',
            json={'goal_ids': {'bad': 'shape'}}
        )
        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'


@pytest.mark.integration
class TestActivityModes:
    def test_create_list_update_and_delete_activity_mode(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id

        create_response = authed_client.post(
            f'/api/{root_id}/activity-modes',
            json={
                'name': 'Strength',
                'description': 'Low-rep work',
                'color': '#3366FF',
            }
        )
        assert create_response.status_code == 201
        created = create_response.get_json()
        assert created['name'] == 'Strength'
        assert created['color'] == '#3366FF'

        list_response = authed_client.get(f'/api/{root_id}/activity-modes')
        assert list_response.status_code == 200
        listed = list_response.get_json()
        assert any(mode['id'] == created['id'] for mode in listed)

        update_response = authed_client.put(
            f"/api/{root_id}/activity-modes/{created['id']}",
            json={
                'name': 'Technique',
                'description': 'Tempo-focused practice',
                'color': '#22AA66',
            }
        )
        assert update_response.status_code == 200
        updated = update_response.get_json()
        assert updated['name'] == 'Technique'
        assert updated['color'] == '#22AA66'

        delete_response = authed_client.delete(f"/api/{root_id}/activity-modes/{created['id']}")
        assert delete_response.status_code == 200

        db_session.expire_all()
        deleted = db_session.query(ActivityMode).filter_by(id=created['id']).first()
        assert deleted is not None
        assert deleted.deleted_at is not None

        final_list = authed_client.get(f'/api/{root_id}/activity-modes').get_json()
        assert all(mode['id'] != created['id'] for mode in final_list)

    def test_create_activity_mode_rejects_duplicate_name(self, authed_client, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        first = authed_client.post(
            f'/api/{root_id}/activity-modes',
            json={'name': 'Standing'}
        )
        assert first.status_code == 201

        second = authed_client.post(
            f'/api/{root_id}/activity-modes',
            json={'name': 'Standing'}
        )
        assert second.status_code == 409


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

    def test_create_activity_rejects_blank_name(self, authed_client, sample_ultimate_goal):
        """Create requests should reject blank names explicitly."""
        root_id = sample_ultimate_goal.id
        response = authed_client.post(
            f'/api/{root_id}/activities',
            json={'name': '   '}
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Name is required'

    def test_create_activity_rejects_too_many_metrics(self, authed_client, sample_ultimate_goal):
        """Create requests should preserve the max-3-metrics contract."""
        root_id = sample_ultimate_goal.id
        response = authed_client.post(
            f'/api/{root_id}/activities',
            json={
                'name': 'Over-Instrumented Activity',
                'metrics': [
                    {'name': 'Weight', 'unit': 'lbs'},
                    {'name': 'Reps', 'unit': 'count'},
                    {'name': 'Duration', 'unit': 'sec'},
                    {'name': 'Tempo', 'unit': 'bpm'},
                ]
            }
        )

        assert response.status_code == 400
        assert 'maximum of 3 metrics' in response.get_json()['error'].lower()

    def test_create_activity_rejects_too_many_splits(self, authed_client, sample_ultimate_goal):
        """Create requests should preserve the max-5-splits contract."""
        root_id = sample_ultimate_goal.id
        response = authed_client.post(
            f'/api/{root_id}/activities',
            json={
                'name': 'Over-Split Activity',
                'splits': [
                    {'name': 'One'},
                    {'name': 'Two'},
                    {'name': 'Three'},
                    {'name': 'Four'},
                    {'name': 'Five'},
                    {'name': 'Six'},
                ]
            }
        )

        assert response.status_code == 400
        assert 'maximum of 5 splits' in response.get_json()['error'].lower()

    def test_create_activity_rejects_non_array_goal_ids(self, authed_client, sample_ultimate_goal):
        """Create requests should reject malformed goal association shapes."""
        root_id = sample_ultimate_goal.id
        response = authed_client.post(
            f'/api/{root_id}/activities',
            json={
                'name': 'Malformed Associations',
                'goal_ids': {'bad': 'shape'},
            }
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'

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

    def test_update_activity_rejects_blank_name(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Blank names should still fail validation on update."""
        root_id = sample_ultimate_goal.id
        response = authed_client.put(
            f'/api/{root_id}/activities/{sample_activity_definition.id}',
            json={'name': '   '}
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Name is required'

    def test_update_activity_rejects_non_array_metrics(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Update requests should reject malformed metric shapes."""
        root_id = sample_ultimate_goal.id
        response = authed_client.put(
            f'/api/{root_id}/activities/{sample_activity_definition.id}',
            json={'metrics': {'name': 'Weight', 'unit': 'lbs'}}
        )

        assert response.status_code == 400
        assert 'metrics must be an array' in response.get_json()['error'].lower()

    def test_update_activity_rejects_non_array_splits(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Update requests should reject malformed split shapes."""
        root_id = sample_ultimate_goal.id
        response = authed_client.put(
            f'/api/{root_id}/activities/{sample_activity_definition.id}',
            json={'splits': {'name': 'Left'}}
        )

        assert response.status_code == 400
        assert 'splits must be an array' in response.get_json()['error'].lower()

    def test_update_activity_rejects_too_many_metrics(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Updates should preserve the max-3-metrics contract."""
        root_id = sample_ultimate_goal.id
        response = authed_client.put(
            f'/api/{root_id}/activities/{sample_activity_definition.id}',
            json={
                'metrics': [
                    {'name': 'Weight', 'unit': 'lbs'},
                    {'name': 'Reps', 'unit': 'count'},
                    {'name': 'Duration', 'unit': 'sec'},
                    {'name': 'Tempo', 'unit': 'bpm'},
                ]
            }
        )

        assert response.status_code == 400
        assert 'maximum of 3 metrics' in response.get_json()['error'].lower()

    def test_update_activity_rejects_too_many_splits(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Updates should preserve the max-5-splits contract."""
        root_id = sample_ultimate_goal.id
        response = authed_client.put(
            f'/api/{root_id}/activities/{sample_activity_definition.id}',
            json={
                'splits': [
                    {'name': 'One'},
                    {'name': 'Two'},
                    {'name': 'Three'},
                    {'name': 'Four'},
                    {'name': 'Five'},
                    {'name': 'Six'},
                ]
            }
        )

        assert response.status_code == 400
        assert 'maximum of 5 splits' in response.get_json()['error'].lower()

    def test_update_activity_rejects_non_array_goal_ids(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Update requests should reject malformed goal association shapes."""
        root_id = sample_ultimate_goal.id
        response = authed_client.put(
            f'/api/{root_id}/activities/{sample_activity_definition.id}',
            json={'goal_ids': {'bad': 'shape'}}
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'

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

    def test_update_activity_splits(self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition):
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
        
        removed_split_id = activity['split_definitions'][1]['id']

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

        deleted_split = db_session.query(SplitDefinition).filter_by(id=removed_split_id).first()
        assert deleted_split is not None
        assert deleted_split.deleted_at is not None

    def test_update_activity_omits_metrics_to_preserve_existing(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        """Omitting metrics should patch scalars only and preserve the current metric set."""
        root_id = sample_ultimate_goal.id
        activity_id = sample_activity_definition.id
        original_metric_ids = {metric.id for metric in sample_activity_definition.metric_definitions}

        response = authed_client.put(
            f'/api/{root_id}/activities/{activity_id}',
            json={'description': 'Patched only'}
        )

        assert response.status_code == 200
        data = response.get_json()
        returned_metric_ids = {metric['id'] for metric in data['metric_definitions']}
        assert returned_metric_ids == original_metric_ids

    def test_update_activity_empty_metrics_clears_existing(self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition):
        """Providing metrics=[] should replace the metric set with an empty collection."""
        root_id = sample_ultimate_goal.id
        activity_id = sample_activity_definition.id

        response = authed_client.put(
            f'/api/{root_id}/activities/{activity_id}',
            json={'metrics': []}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['metric_definitions'] == []

        remaining = db_session.query(MetricDefinition).filter(
            MetricDefinition.activity_id == activity_id,
            MetricDefinition.deleted_at.is_(None),
        ).count()
        assert remaining == 0

    def test_update_activity_goal_ids_omit_preserves_and_empty_clears(self, authed_client, db_session, sample_goal_hierarchy, sample_activity_definition):
        """goal_ids follows omit-preserves, present-replaces semantics."""
        root_id = sample_goal_hierarchy['ultimate'].id
        activity_id = sample_activity_definition.id
        keep_goal_id = sample_goal_hierarchy['short_term'].id

        set_response = authed_client.post(
            f'/api/{root_id}/activities/{activity_id}/goals',
            json={'goal_ids': [keep_goal_id]}
        )
        assert set_response.status_code == 200

        preserve_response = authed_client.put(
            f'/api/{root_id}/activities/{activity_id}',
            json={'description': 'Preserve associations'}
        )
        assert preserve_response.status_code == 200
        preserved_goal_ids = {goal['id'] for goal in preserve_response.get_json()['associated_goals']}
        assert preserved_goal_ids == {keep_goal_id}

        clear_response = authed_client.put(
            f'/api/{root_id}/activities/{activity_id}',
            json={'goal_ids': []}
        )
        assert clear_response.status_code == 200
        assert clear_response.get_json()['associated_goals'] == []

        db_session.refresh(sample_activity_definition)
        assert sample_activity_definition.associated_goals == []

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


@pytest.mark.integration
class TestActivityGoalAssociations:
    """Test activity-goal association endpoints used by goal detail flows."""

    def test_set_activity_goals_replaces_associations(self, authed_client, sample_goal_hierarchy, sample_activity_definition):
        root_id = sample_goal_hierarchy['ultimate'].id
        activity_id = sample_activity_definition.id
        goal_ids = [sample_goal_hierarchy['ultimate'].id, sample_goal_hierarchy['short_term'].id]

        response = authed_client.post(
            f'/api/{root_id}/activities/{activity_id}/goals',
            json={'goal_ids': goal_ids}
        )

        assert response.status_code == 200
        data = response.get_json()
        associated_goal_ids = {goal['id'] for goal in data['associated_goals']}
        assert associated_goal_ids == set(goal_ids)

    def test_set_activity_goals_rejects_non_array_goal_ids(
        self,
        authed_client,
        sample_goal_hierarchy,
        sample_activity_definition,
    ):
        root_id = sample_goal_hierarchy['ultimate'].id
        response = authed_client.post(
            f'/api/{root_id}/activities/{sample_activity_definition.id}/goals',
            json={'goal_ids': {'bad': 'shape'}}
        )
        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'

    def test_remove_activity_goal_deletes_specific_association(self, authed_client, sample_goal_hierarchy, sample_activity_definition):
        root_id = sample_goal_hierarchy['ultimate'].id
        activity_id = sample_activity_definition.id
        keep_goal_id = sample_goal_hierarchy['ultimate'].id
        remove_goal_id = sample_goal_hierarchy['short_term'].id

        authed_client.post(
            f'/api/{root_id}/activities/{activity_id}/goals',
            json={'goal_ids': [keep_goal_id, remove_goal_id]}
        )

        response = authed_client.delete(
            f'/api/{root_id}/activities/{activity_id}/goals/{remove_goal_id}'
        )

        assert response.status_code == 200
        assert response.get_json()['message'] == 'Goal association removed'

        goals_response = authed_client.get(f'/api/{root_id}/activities/{activity_id}/goals')
        goal_ids = {goal['id'] for goal in goals_response.get_json()}
        assert goal_ids == {keep_goal_id}

    def test_set_goal_associations_batch_filters_invalid_ids(self, authed_client, sample_goal_hierarchy, sample_activity_definition, sample_activity_group):
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['ultimate'].id

        response = authed_client.put(
            f'/api/{root_id}/goals/{goal_id}/associations/batch',
            json={
                'activity_ids': [sample_activity_definition.id, str(uuid.uuid4())],
                'group_ids': [sample_activity_group.id, str(uuid.uuid4())],
            }
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['activity_ids'] == [sample_activity_definition.id]
        assert data['group_ids'] == [sample_activity_group.id]

        activities_response = authed_client.get(f'/api/{root_id}/goals/{goal_id}/activities')
        activity_ids = {activity['id'] for activity in activities_response.get_json()}
        assert sample_activity_definition.id in activity_ids

        groups_response = authed_client.get(f'/api/{root_id}/goals/{goal_id}/activity-groups')
        group_ids = {group['id'] for group in groups_response.get_json()}
        assert group_ids == {sample_activity_group.id}

    def test_set_goal_associations_batch_rejects_non_array_ids(
        self,
        authed_client,
        sample_goal_hierarchy,
    ):
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['ultimate'].id

        response = authed_client.put(
            f'/api/{root_id}/goals/{goal_id}/associations/batch',
            json={'activity_ids': {'bad': 'shape'}, 'group_ids': []}
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'

    def test_get_goal_activities_includes_inherited_child_associations(self, authed_client, sample_goal_hierarchy, sample_activity_definition):
        root_id = sample_goal_hierarchy['ultimate'].id
        parent_goal_id = sample_goal_hierarchy['ultimate'].id
        child_goal_id = sample_goal_hierarchy['short_term'].id

        set_response = authed_client.post(
            f'/api/{root_id}/activities/{sample_activity_definition.id}/goals',
            json={'goal_ids': [child_goal_id]}
        )
        assert set_response.status_code == 200

        response = authed_client.get(f'/api/{root_id}/goals/{parent_goal_id}/activities')
        assert response.status_code == 200

        activities = response.get_json()
        inherited = next(activity for activity in activities if activity['id'] == sample_activity_definition.id)
        assert inherited['is_inherited'] is True
        assert inherited['source_goal_id'] == child_goal_id

    def test_link_and_unlink_goal_activity_group(self, authed_client, sample_goal_hierarchy, sample_activity_group):
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['ultimate'].id
        group_id = sample_activity_group.id

        link_response = authed_client.post(
            f'/api/{root_id}/goals/{goal_id}/activity-groups/{group_id}'
        )
        assert link_response.status_code == 201

        groups_response = authed_client.get(f'/api/{root_id}/goals/{goal_id}/activity-groups')
        group_ids = {group['id'] for group in groups_response.get_json()}
        assert group_ids == {group_id}

        unlink_response = authed_client.delete(
            f'/api/{root_id}/goals/{goal_id}/activity-groups/{group_id}'
        )
        assert unlink_response.status_code == 200
        assert unlink_response.get_json()['message'] == 'Group unlinked successfully'

        groups_response = authed_client.get(f'/api/{root_id}/goals/{goal_id}/activity-groups')
        assert groups_response.get_json() == []
