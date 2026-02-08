
import pytest
import json
import uuid
from models import MetricValue, ActivityInstance
from services.serializers import serialize_metric_value

def test_metric_value_to_dict_includes_metric_id(db_session, sample_activity_instance):
    """
    Unit test for MetricValue model to ensure to_dict() includes metric_id alias.
    """
    # Setup
    act_def = sample_activity_instance.definition
    metric_def = act_def.metric_definitions[0]
    
    mv = MetricValue(
        activity_instance_id=sample_activity_instance.id,
        metric_definition_id=metric_def.id,
        root_id=sample_activity_instance.root_id,
        value=100.0
    )
    db_session.add(mv)
    db_session.commit()
    
    # Test
    data = serialize_metric_value(mv)
    
    # Verify
    assert 'metric_id' in data, "to_dict() must include 'metric_id' key"
    assert data['metric_id'] == metric_def.id
    assert 'metric_definition_id' in data
    assert data['metric_definition_id'] == metric_def.id

def test_session_hydration_includes_metric_id(authed_client, db_session, sample_activity_instance):
    """
    Integration test to verify that fetched session data includes metric_id 
    in the hydrated exercises list.
    """
    # 1. Setup Metric Value
    act_def = sample_activity_instance.definition
    metric_def = act_def.metric_definitions[0]
    
    mv = MetricValue(
        activity_instance_id=sample_activity_instance.id,
        metric_definition_id=metric_def.id,
        root_id=sample_activity_instance.root_id,
        value=50.0
    )
    db_session.add(mv)
    
    # 2. Setup Session Data structure to trigger hydration
    # The backend looks for "activity_ids" in sections to hydrate ActivityInstances
    # Note: sections should be at top level of attributes for hydration to work in serialize_session
    session = sample_activity_instance.session
    session.attributes = json.dumps({
        "sections": [
            {
                "name": "Integration Test Section",
                "activity_ids": [sample_activity_instance.id]
            }
        ]
    })
    db_session.commit()
    
    # Verify persistence in DB
    from models import ActivityInstance
    instances = db_session.query(ActivityInstance).filter_by(session_id=session.id).all()
    print(f"DEBUG Test DB Instances: {[i.id for i in instances]}")
    assert len(instances) > 0
    assert instances[0].id == sample_activity_instance.id
    
    # 3. Fetch Session via API
    root_id = sample_activity_instance.root_id
    session_id = session.id
    resp = authed_client.get(f'/api/{root_id}/sessions/{session_id}')
    
    assert resp.status_code == 200
    data = resp.json
    
    # 4. Drill down to hydrated exercises
    # Structure: attributes -> session_data -> sections -> [0] -> exercises
    # Note: 'session_data' might be at top level depending on API version, 
    # but models.py puts it in attributes mostly. 
    # The API response usually puts attributes at top level or merged.
    # Let's check the response structure handling in sessions_api.py or rely on standard serialization.
    # Usually it's in data['attributes']['session_data']
    
    session_data = data.get('attributes', {}).get('session_data', {})
    sections = session_data.get('sections', [])
    
    if len(sections) == 0:
        print(f"DEBUG Response Data: {json.dumps(data, indent=2)}")
        
    assert len(sections) > 0
    
    exercises = sections[0].get('exercises', [])
    
    if len(exercises) == 0:
        print(f"DEBUG Section 0: {json.dumps(sections[0], indent=2)}")
        print(f"DEBUG Expected Instance ID: {sample_activity_instance.id}")
    
    assert len(exercises) > 0
    
    target_ex = next((ex for ex in exercises if ex['instance_id'] == sample_activity_instance.id), None)
    assert target_ex is not None, "Activity instance was not hydrated"
    
    # 5. Verify Metrics
    # The backend maps instance.metric_values -> ex['metrics']
    assert 'metrics' in target_ex
    metrics_list = target_ex['metrics']
    assert len(metrics_list) > 0
    
    metric_entry = metrics_list[0]
    assert 'metric_id' in metric_entry, "Hydrated metric entry missing 'metric_id'"
    assert metric_entry['metric_id'] == metric_def.id
    assert metric_entry['value'] == 50.0
