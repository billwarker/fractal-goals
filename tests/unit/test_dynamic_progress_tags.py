import pytest

from services.progress_service import ProgressService


@pytest.mark.parametrize(
    ("present", "config", "expected"),
    [
        (set(), {}, True),
        ({"a", "b"}, {"all_tag_ids": ["a", "b"]}, True),
        ({"a"}, {"all_tag_ids": ["a", "b"]}, False),
        ({"b"}, {"any_tag_ids": ["a", "b"]}, True),
        ({"c"}, {"any_tag_ids": ["a", "b"]}, False),
        ({"a", "blocked"}, {"all_tag_ids": ["a"], "none_tag_ids": ["blocked"]}, False),
        ({"a"}, {"all_tag_ids": ["a"], "any_tag_ids": ["a", "b"], "none_tag_ids": ["c"]}, True),
    ],
)
def test_progress_tag_predicate_truth_table(present, config, expected):
    assert ProgressService._matches_tag_config(present, config) is expected
