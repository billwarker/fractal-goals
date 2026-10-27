"""Notes page feed: categories, keyword/regex search, saved filters (AND), day filter and heatmap."""
from datetime import datetime, timedelta
import uuid

import pytest
from sqlalchemy import event

from models import Note, NoteFilter
from services.note_filter_service import NoteFilterService
from services.note_filter_spec import NoteFilterError, keyword_terms, normalize_spec
from services.note_service import NoteService


@pytest.fixture
def feed(db_session, sample_goal_hierarchy, sample_activity_instance, sample_activity_definition, test_user):
    root = sample_goal_hierarchy['ultimate']
    now = datetime(2026, 10, 23, 12, 0)

    def note(content, context_type, **fields):
        row = Note(id=str(uuid.uuid4()), root_id=root.id, context_type=context_type,
                   context_id=fields.pop('context_id', root.id), content=content,
                   created_at=fields.pop('created_at', now), **fields)
        db_session.add(row)
        return row

    rows = {
        'general': note('Morning: elbow pain 100% gone', 'root'),
        'definition': note('Handstand cue: stack scapula', 'activity_definition',
                           context_id=sample_activity_definition.id, activity_definition_id=sample_activity_definition.id),
        'goal': note('Review: scapula control improving', 'goal', goal_id=root.id, note_kind='goal_review'),
        'session': note('Late workout, abort', 'session', session_id=sample_activity_instance.session_id,
                        context_id=sample_activity_instance.session_id,
                        created_at=datetime(2026, 10, 24, 3, 30)),  # 23:30 on Oct 23 in New York.
        'activity': note('Elbow lockout felt strong', 'activity_instance', context_id=sample_activity_instance.id,
                         session_id=sample_activity_instance.session_id, activity_instance_id=sample_activity_instance.id,
                         activity_definition_id=sample_activity_definition.id, created_at=now - timedelta(days=2)),
        'deleted': note('elbow deleted', 'root', deleted_at=now),
    }
    db_session.commit()
    return type('Feed', (), {'db': db_session, 'root': root, 'user': test_user, 'rows': rows,
                             'service': NoteService(db_session), 'filters': NoteFilterService(db_session)})


def contents(feed, **filters):
    payload, error, status = feed.service.get_all_notes(feed.root.id, feed.user.id, filters=filters, page_size=50)
    assert error is None, error
    return sorted(note['content'] for note in payload['notes'])


def test_spec_normalization_and_limits():
    assert normalize_spec({'text': '  scapula ', 'categories': ['goals', 'goals']}) == {
        'text': 'scapula', 'categories': ['goals']}
    assert normalize_spec({'text': 'youtube', 'text_mode': 'keyword'}) == {'text': 'youtube'}  # Earlier saved filters.
    assert normalize_spec({'goal_id': 'g1', 'goal_ids': ['g2']}) == {'goal_ids': ['g1', 'g2']}
    assert normalize_spec({'conditions': [{'op': 'equals', 'value': ' elbow '}], 'match': 'any'}) == {
        'conditions': [{'op': 'equals', 'value': 'elbow'}]}  # "match" only matters with two or more conditions.
    for bad in ({'unknown': 1}, {'text': 'x' * 201}, {'text_mode': 'regex'}, {'categories': ['activities']},
                {'pinned_only': 'yes'}, {'activity_definition_ids': ['a'] * 51}, {'match': 'some'},
                {'conditions': [{'op': 'regex', 'value': 'x'}]}, {'conditions': [{'op': 'contains', 'value': '  '}]},
                {'conditions': [{'op': 'contains', 'value': 'x'}] * 11}):
        with pytest.raises(NoteFilterError):
            normalize_spec(bad)
    assert keyword_terms('elbow "stack scapula" 100%') == ['elbow', 'stack scapula', '100%']


def test_categories_map_where_notes_were_written(feed):
    assert contents(feed, categories=['general']) == ['Handstand cue: stack scapula', 'Morning: elbow pain 100% gone']
    assert contents(feed, categories=['goals']) == ['Review: scapula control improving']
    assert contents(feed, categories=['sessions']) == ['Elbow lockout felt strong', 'Late workout, abort']
    assert contents(feed, categories=['programs']) == []
    payload, _, _ = feed.service.get_all_notes(feed.root.id, feed.user.id, filters={})
    assert {note['note_category'] for note in payload['notes']} == {'general', 'goals', 'sessions'}


def test_keyword_search_escapes_wildcards_and_ands_terms(feed):
    assert contents(feed, text='100%') == ['Morning: elbow pain 100% gone']
    assert contents(feed, text='_') == []  # An underscore is literal, not a wildcard.
    assert contents(feed, text='ELBOW strong') == ['Elbow lockout felt strong']
    assert contents(feed, text='"stack scapula"') == ['Handstand cue: stack scapula']


def test_several_goals_match_any_of_them(feed):
    assert contents(feed, goal_ids=[feed.root.id, 'other-goal']) == ['Review: scapula control improving']
    assert contents(feed, goal_ids=['other-goal']) == []


def test_conditions_contain_or_equal_and_combine_with_all_or_any(feed):
    def matching(*conditions, match='all'):
        return contents(feed, conditions=[{'op': op, 'value': value} for op, value in conditions], match=match)
    assert matching(('contains', 'scap')) == ['Handstand cue: stack scapula', 'Review: scapula control improving']
    assert matching(('equals', 'scap')) == []  # Equals needs the whole word.
    assert matching(('equals', 'SCAPULA')) == ['Handstand cue: stack scapula', 'Review: scapula control improving']
    assert matching(('equals', 'stack scapula')) == ['Handstand cue: stack scapula']
    assert matching(('equals', '100%')) == []  # Regex characters are literal, never a pattern.
    assert matching(('contains', 'elbow'), ('equals', 'strong')) == ['Elbow lockout felt strong']
    assert matching(('equals', 'abort'), ('equals', 'lockout'), match='any') == ['Elbow lockout felt strong', 'Late workout, abort']


def test_saved_filters_combine_with_and(feed):
    elbow = feed.filters.create(feed.root.id, feed.user.id, {'name': 'Elbow', 'spec': {'text': 'elbow'}})
    sessions = feed.filters.create(feed.root.id, feed.user.id, {'name': 'Sessions', 'spec': {'categories': ['sessions']}})
    assert contents(feed, saved_filter_ids=[elbow['id']]) == ['Elbow lockout felt strong', 'Morning: elbow pain 100% gone']
    assert contents(feed, saved_filter_ids=[elbow['id'], sessions['id']]) == ['Elbow lockout felt strong']
    assert contents(feed, saved_filter_ids=[elbow['id'], sessions['id']], text='abort') == []
    _, error, status = feed.service.get_all_notes(feed.root.id, feed.user.id, filters={'saved_filter_ids': ['missing']})
    assert status == 404


def test_day_filter_and_heatmap_use_the_local_day(feed):
    oct23 = contents(feed, day='2026-10-23', timezone='America/New_York')
    assert 'Late workout, abort' in oct23
    heatmap, error, _ = feed.service.get_notes_heatmap(feed.root.id, feed.user.id, filters={'timezone': 'America/New_York'})
    assert error is None
    days = {day['date']: day['count'] for day in heatmap['days']}
    assert days['2026-10-23'] == len(oct23) and days['2026-10-21'] == 1
    assert heatmap['total'] == 5 and heatmap['range_start'] == '2026-10-21'
    sessions, _, _ = feed.service.get_notes_heatmap(feed.root.id, feed.user.id, filters={'categories': ['sessions'], 'timezone': 'UTC'})
    assert sessions['total'] == 2


def test_category_filter_pages_in_sql(feed):
    statements = []
    listener = lambda *args: statements.append(args[2])
    event.listen(feed.db.get_bind(), 'before_cursor_execute', listener)
    try:
        payload, _, _ = feed.service.get_all_notes(feed.root.id, feed.user.id, filters={'categories': ['general', 'sessions']}, page_size=2)
    finally:
        event.remove(feed.db.get_bind(), 'before_cursor_execute', listener)
    assert payload['total'] == 4 and len(payload['notes']) == 2 and payload['has_more']
    assert any('LIMIT' in statement.upper() for statement in statements if 'FROM notes' in statement)


def test_saved_filter_crud_ownership_and_limits(feed, authed_client):
    base = f'/api/{feed.root.id}/note-filters'
    created = authed_client.post(base, json={'name': 'Form cues', 'spec': {
        'conditions': [{'op': 'equals', 'value': 'scapula'}, {'op': 'contains', 'value': 'elbow'}], 'match': 'any'}})
    assert created.status_code == 201
    filter_id = created.get_json()['id']
    assert authed_client.post(base, json={'name': 'Form cues', 'spec': {'text': 'x'}}).get_json()['code'] == 'duplicate_name'
    assert authed_client.post(base, json={'name': 'Empty', 'spec': {}}).status_code == 400
    assert authed_client.post(base, json={'name': 'Bad', 'spec': {'conditions': [{'op': 'like', 'value': 'x'}]}}).status_code == 400
    assert authed_client.put(f'{base}/{filter_id}', json={'name': 'Cues'}).get_json()['name'] == 'Cues'
    assert [row['name'] for row in authed_client.get(base).get_json()] == ['Cues']
    assert authed_client.get(f'/api/{feed.root.id}/notes?filters={filter_id}').get_json()['total'] == 4  # elbow ×2, scapula ×2
    assert authed_client.get(f'/api/{feed.root.id}/notes/heatmap?filters={filter_id}&timezone=UTC').status_code == 200
    with pytest.raises(NoteFilterError):
        feed.filters.update(feed.root.id, 'someone-else', filter_id, {'name': 'Mine'})
    assert authed_client.delete(f'{base}/{filter_id}').status_code == 200
    assert authed_client.delete(f'{base}/{filter_id}').status_code == 404
    for index in range(30):
        feed.db.add(NoteFilter(root_id=feed.root.id, name=f'F{index}', spec={'text': 'x'}, position=index))
    feed.db.commit()
    assert authed_client.post(base, json={'name': 'One more', 'spec': {'text': 'x'}}).status_code == 400


def test_feed_and_heatmap_stay_fast_with_thousands_of_notes(feed):
    import time
    start = datetime(2024, 1, 1)
    feed.db.bulk_insert_mappings(Note, [
        {'id': str(uuid.uuid4()), 'root_id': feed.root.id, 'context_type': 'root' if index % 3 else 'goal',
         'context_id': feed.root.id, 'content': f'Practice log {index} elbow' if index % 7 == 0 else f'Practice log {index}',
         'created_at': start + timedelta(hours=index * 5)}
        for index in range(5000)
    ])
    feed.db.commit()
    began = time.perf_counter()
    payload, _, _ = feed.service.get_all_notes(feed.root.id, feed.user.id, filters={'categories': ['goals'], 'text': 'elbow'})
    heatmap, _, _ = feed.service.get_notes_heatmap(feed.root.id, feed.user.id, filters={
        'conditions': [{'op': 'equals', 'value': 'elbow'}, {'op': 'contains', 'value': 'Practice log'}], 'timezone': 'UTC'})
    elapsed = time.perf_counter() - began
    assert payload['total'] == len(range(0, 5000, 21)) and len(payload['notes']) == 25
    assert heatmap['total'] == len(range(0, 5000, 7))
    assert elapsed < 2.0, f'feed + heatmap took {elapsed:.2f}s'


def test_categories_match_the_shared_client_fixture():
    import json
    from pathlib import Path
    from services.note_filter_spec import CATEGORY_CONTEXT_TYPES
    fixture = json.loads((Path(__file__).resolve().parents[2] / 'fixtures/note_categories.json').read_text())
    assert {row['value']: tuple(row['context_types']) for row in fixture} == CATEGORY_CONTEXT_TYPES
    assert [row['value'] for row in fixture] == list(CATEGORY_CONTEXT_TYPES)
