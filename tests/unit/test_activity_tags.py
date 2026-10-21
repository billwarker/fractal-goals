import json
from pathlib import Path

import pytest

from services.activity_tags import canonical_tag_name, normalize_tag_name, tag_signature

CASES = json.loads((Path(__file__).resolve().parents[1] / 'fixtures' / 'tag_name_normalization_cases.json').read_text())


@pytest.mark.parametrize('case', CASES, ids=[case['input'] for case in CASES])
def test_tag_names_normalize_like_the_client_and_database(case):
    assert canonical_tag_name(case['input']) == case['display']
    assert normalize_tag_name(case['input']) == case['normalized']


def test_signatures_sort_by_code_point_and_ignore_duplicates():
    # Matches the trigger's string_agg(... ORDER BY id COLLATE "C").
    assert tag_signature(['b-2', 'B-1', 'a', 'a', None]) == 'B-1,a,b-2'
    assert tag_signature([]) == ''
