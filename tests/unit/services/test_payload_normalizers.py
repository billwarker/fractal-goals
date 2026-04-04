from services.payload_normalizers import (
    normalize_activity_payload,
    normalize_goal_payload,
    normalize_note_payload,
    normalize_session_payload,
)


def test_normalize_activity_payload_dedupes_ids_and_cleans_rows():
    payload = normalize_activity_payload({
        'name': '  Bench Press  ',
        'description': '  Heavy  day  ',
        'group_id': '  ',
        'goal_ids': ['goal-1', ' goal-1 ', '', None, 'goal-2'],
        'metrics': [
            {'name': ' Weight ', 'unit': ' lbs '},
            {'name': ' ', 'unit': ' '},
        ],
        'splits': [
            {'name': ' Left '},
            {'name': '  '},
        ],
    })

    assert payload['name'] == 'Bench Press'
    assert payload['description'] == 'Heavy day'
    assert payload['group_id'] is None
    assert payload['goal_ids'] == ['goal-1', 'goal-2']
    assert payload['metrics'] == [{'name': 'Weight', 'unit': 'lbs'}]
    assert payload['splits'] == [{'name': 'Left'}]


def test_normalize_goal_payload_cleans_optional_ids_and_defaults():
    payload = normalize_goal_payload({
        'description': None,
        'relevance_statement': '   ',
        'parent_id': ' ',
        'session_id': ' session-1 ',
        'targets': None,
        'deadline': ' ',
    })

    assert payload['description'] == ''
    assert payload['relevance_statement'] is None
    assert payload['parent_id'] is None
    assert payload['session_id'] == 'session-1'
    assert payload['targets'] == []
    assert payload['deadline'] is None


def test_normalize_note_payload_preserves_markdown_newlines_and_cleans_ids():
    payload = normalize_note_payload({
        'content': '  Intro line\n## Heading\n- one  \n- two  ',
        'session_id': ' session-1 ',
        'context_id': ' ctx-1 ',
        'activity_instance_id': ' ',
    })

    assert payload['content'] == 'Intro line\n## Heading\n- one \n- two'
    assert payload['session_id'] == 'session-1'
    assert payload['context_id'] == 'ctx-1'
    assert payload['activity_instance_id'] is None


def test_normalize_session_payload_dedupes_goal_ids_and_parses_json():
    payload = normalize_session_payload({
        'name': '  ',
        'description': '  Focused  block ',
        'template_id': ' ',
        'parent_ids': ['goal-1', ' goal-1 ', 'goal-2'],
        'goal_ids': None,
        'immediate_goal_ids': ['imm-1', '', 'imm-1'],
        'session_data': '{"sections":[{"name":"Main"}]}',
    })

    assert payload['name'] == 'Untitled Session'
    assert payload['description'] == 'Focused block'
    assert payload['template_id'] is None
    assert payload['parent_ids'] == ['goal-1', 'goal-2']
    assert payload['goal_ids'] == []
    assert payload['immediate_goal_ids'] == ['imm-1']
    assert payload['session_data'] == {'sections': [{'name': 'Main'}]}
