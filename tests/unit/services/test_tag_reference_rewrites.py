from services.tag_reference_rewrites import rewrite_plan_tree, rewrite_prescription


def test_rewrites_activity_plan_tags_and_drops_emptied_lists():
    prescription = {'schema': 1, 'tags': ['old', 'keep'], 'sets': [{'metrics': [], 'tags': ['old']}, {'metrics': []}]}
    rewritten, changed = rewrite_prescription(prescription, {'old': None})
    assert changed
    assert rewritten == {'schema': 1, 'tags': ['keep'], 'sets': [{'metrics': []}, {'metrics': []}]}
    assert prescription['tags'] == ['old', 'keep']


def test_rewrites_circuit_run_round_and_member_tags():
    prescription = {'schema': 1, 'tags': ['old'], 'rounds': [
        {'tags': ['old', 'new'], 'slots': [{'slot_id': 's', 'metrics': [], 'tags': ['old']}], 'notes': None},
        {'slots': [{'slot_id': 's', 'metrics': [{'metric_id': 'm', 'value': 1}]}], 'notes': None},
    ]}
    rewritten, changed = rewrite_prescription(prescription, {'old': 'new'})
    assert changed
    assert rewritten['tags'] == ['new']
    assert rewritten['rounds'][0]['tags'] == ['new']
    assert rewritten['rounds'][0]['slots'][0]['tags'] == ['new']
    assert rewritten['rounds'][1] is prescription['rounds'][1]

    unchanged, changed = rewrite_prescription(prescription, {'other': None})
    assert not changed and unchanged is prescription


def test_rewrites_circuit_plans_nested_in_plan_documents():
    document = {'sections': [{'items': [{'type': 'circuit', 'prescription': {'rounds': [
        {'slots': [{'slot_id': 's', 'metrics': [], 'tags': ['old']}]},
    ]}}]}]}
    rewritten, changed = rewrite_plan_tree(document, {'old': None})
    assert changed
    planned_round = rewritten['sections'][0]['items'][0]['prescription']['rounds'][0]
    assert planned_round['slots'][0] == {'slot_id': 's', 'metrics': []}
