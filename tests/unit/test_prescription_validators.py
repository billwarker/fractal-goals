import math

import pytest

from validators import validate_session_template_data
from validators.prescriptions import (
    MAX_PRESCRIPTION_NOTE_LENGTH,
    MAX_PRESCRIPTION_SETS,
    validate_prescription,
)


def _template(*items):
    return {'session_type': 'normal', 'sections': [{'name': 'Main', 'items': list(items)}]}


def _activity(**extra):
    return {'type': 'activity', 'activity_definition_id': 'act-1', 'name': 'Bench', **extra}


def test_empty_prescription_normalizes_to_none():
    assert validate_prescription(None) is None
    assert validate_prescription({}) is None
    assert validate_prescription({'notes': '  ', 'sets': [], 'metrics': []}) is None


def test_set_prescription_keeps_values_notes_and_drops_empty_cells():
    result = validate_prescription({
        'notes': 'Pause at chest',
        'sets': [
            {'metrics': [{'metric_id': 'w', 'value': 100}, {'metric_id': 'r', 'value': ''}], 'notes': 'top'},
            {'metrics': []},
        ],
    })

    assert result == {
        'schema': 1,
        'notes': 'Pause at chest',
        'sets': [
            {'metrics': [{'metric_id': 'w', 'split_id': None, 'value': 100}], 'notes': 'top'},
            {'metrics': [], 'notes': None},
        ],
    }


@pytest.mark.parametrize('bad_value', [math.inf, -math.inf, math.nan, 'heavy', True])
def test_rejects_non_finite_or_non_numeric_values(bad_value):
    with pytest.raises(ValueError, match='finite number'):
        validate_prescription({'metrics': [{'metric_id': 'w', 'value': bad_value}]})


def test_rejects_metrics_and_sets_together():
    with pytest.raises(ValueError, match='both metrics and sets'):
        validate_prescription({
            'metrics': [{'metric_id': 'w', 'value': 1}],
            'sets': [{'metrics': [{'metric_id': 'w', 'value': 1}]}],
        })


def test_rejects_duplicate_metric_split_pairs_but_allows_distinct_splits():
    assert validate_prescription({'metrics': [
        {'metric_id': 'w', 'split_id': 'left', 'value': 1},
        {'metric_id': 'w', 'split_id': 'right', 'value': 2},
    ]})
    with pytest.raises(ValueError, match='duplicates'):
        validate_prescription({'metrics': [
            {'metric_id': 'w', 'value': 1},
            {'metric_id': 'w', 'split_id': None, 'value': 2},
        ]})


def test_set_count_boundary():
    assert len(validate_prescription({'sets': [{'metrics': []}] * MAX_PRESCRIPTION_SETS})['sets']) == MAX_PRESCRIPTION_SETS
    with pytest.raises(ValueError, match='at most'):
        validate_prescription({'sets': [{'metrics': []}] * (MAX_PRESCRIPTION_SETS + 1)})


def test_note_length_boundary():
    assert validate_prescription({'notes': 'x' * MAX_PRESCRIPTION_NOTE_LENGTH})
    with pytest.raises(ValueError, match='characters'):
        validate_prescription({'notes': 'x' * (MAX_PRESCRIPTION_NOTE_LENGTH + 1)})


def test_rejects_unknown_schema_version():
    with pytest.raises(ValueError, match='schema'):
        validate_prescription({'schema': 2, 'notes': 'x'})


def test_template_items_get_unique_item_keys_and_keep_existing_ones():
    data = validate_session_template_data(_template(
        _activity(item_key='kept'),
        _activity(),
        {'type': 'circuit', 'circuit_definition_id': 'c-1'},
    ))
    keys = [item['item_key'] for item in data['sections'][0]['items']]

    assert keys[0] == 'kept'
    assert all(keys) and len(set(keys)) == 3


def test_duplicate_item_keys_are_reassigned():
    data = validate_session_template_data(_template(_activity(item_key='same'), _activity(item_key='same')))
    keys = [item['item_key'] for item in data['sections'][0]['items']]

    assert keys[0] == 'same'
    assert keys[1] != 'same'


def test_template_validation_normalizes_activity_and_circuit_prescriptions():
    data = validate_session_template_data(_template(
        _activity(prescription={'notes': ''}),
        _activity(prescription={'metrics': [{'metric_id': 'w', 'value': 5}]}),
        {'type': 'circuit', 'circuit_definition_id': 'c-1', 'prescription': {'rounds': [
            {'slots': [{'slot_id': 's1', 'metrics': [{'metric_id': 'r', 'value': 10}]}], 'notes': 'fast'},
            {'slots': []},
        ]}},
        {'type': 'circuit', 'circuit_definition_id': 'c-2', 'prescription': {}},
    ))
    items = data['sections'][0]['items']

    assert 'prescription' not in items[0]
    assert items[1]['prescription']['metrics'][0]['value'] == 5
    assert items[2]['prescription'] == {'schema': 1, 'rounds': [
        {'slots': [{'slot_id': 's1', 'metrics': [{'metric_id': 'r', 'split_id': None, 'value': 10}]}], 'notes': 'fast'},
        {'slots': [], 'notes': None},
    ]}
    assert 'prescription' not in items[3]


def test_circuit_prescription_rejects_bad_shapes_and_bounds():
    from services.circuit_rules import MAX_CIRCUIT_ROUNDS
    from validators.prescriptions import validate_circuit_prescription

    assert len(validate_circuit_prescription({'rounds': [{}] * MAX_CIRCUIT_ROUNDS})['rounds']) == MAX_CIRCUIT_ROUNDS
    with pytest.raises(ValueError, match='at most'):
        validate_circuit_prescription({'rounds': [{}] * (MAX_CIRCUIT_ROUNDS + 1)})
    with pytest.raises(ValueError, match='slot_id is required'):
        validate_circuit_prescription({'rounds': [{'slots': [{'metrics': []}]}]})
    with pytest.raises(ValueError, match='repeats a slot'):
        validate_circuit_prescription({'rounds': [{'slots': [{'slot_id': 's'}, {'slot_id': 's'}]}]})
    with pytest.raises(ValueError, match='finite number'):
        validate_circuit_prescription({'rounds': [{'slots': [{'slot_id': 's', 'metrics': [{'metric_id': 'm', 'value': 'x'}]}]}]})


def test_template_validation_reports_item_path_for_bad_prescription():
    with pytest.raises(ValueError, match=r'items\[0\]\.prescription'):
        validate_session_template_data(_template(_activity(prescription='heavy')))


def test_planned_tags_are_deduplicated_and_count_as_a_plan():
    assert validate_prescription({'tags': ['a', 'a', 'b']}) == {'schema': 1, 'tags': ['a', 'b']}
    result = validate_prescription({'sets': [{'metrics': [], 'tags': ['t']}, {'metrics': []}]})
    assert result['sets'] == [{'metrics': [], 'notes': None, 'tags': ['t']}, {'metrics': [], 'notes': None}]
    with pytest.raises(ValueError, match='tag id'):
        validate_prescription({'tags': ['']})
