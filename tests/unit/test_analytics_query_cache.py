from concurrent.futures import ThreadPoolExecutor

import pytest

from services import analytics_query_cache as cache


@pytest.fixture(autouse=True)
def isolated_cache(monkeypatch):
    cache.clear_cache()
    monkeypatch.setattr(cache.config, 'ENV', 'testing')
    yield
    cache.clear_cache()


@pytest.mark.parametrize('environment', ['production', 'staging'])
def test_production_workers_always_read_live_data(monkeypatch, environment):
    cache.set_cached_result('query', {'rows': [{'value': 'old'}]})
    monkeypatch.setattr(cache.config, 'ENV', environment)
    assert cache.get_cached_result('query') is None
    cache.set_cached_result('new', {'rows': []})
    assert 'new' not in cache._CACHE


def test_write_sweeps_expired_unique_keys_at_exact_boundary(monkeypatch):
    monkeypatch.setattr(cache.time, 'monotonic', lambda: 0)
    for index in range(100):
        cache.set_cached_result(str(index), {'rows': []}, ttl_seconds=1)
    monkeypatch.setattr(cache.time, 'monotonic', lambda: 1)
    cache.set_cached_result('new', {'rows': []})
    assert list(cache._CACHE) == ['new']


def test_lru_count_and_byte_limits(monkeypatch):
    monkeypatch.setattr(cache, 'MAX_CACHE_ENTRIES', 2)
    for key in ['a', 'b']:
        cache.set_cached_result(key, {'rows': []})
    cache.get_cached_result('a')
    cache.set_cached_result('c', {'rows': []})
    assert list(cache._CACHE) == ['a', 'c']
    monkeypatch.setattr(cache, 'MAX_CACHE_BYTES', 30)
    cache.set_cached_result('d', {'rows': ['1234567890']})
    assert cache._CACHE_BYTES <= 30
    assert list(cache._CACHE) == ['d']


def test_oversized_replacement_removes_previous_value(monkeypatch):
    cache.set_cached_result('a', {'rows': []})
    monkeypatch.setattr(cache, 'MAX_ENTRY_BYTES', 20)
    cache.set_cached_result('a', {'rows': ['x' * 21]})
    assert cache.get_cached_result('a') is None
    assert cache._CACHE_BYTES == 0


def test_payloads_and_users_are_isolated():
    key = cache.build_cache_key('user-a', {'limit': 5})
    payload = {'rows': [{'value': 1}]}
    cache.set_cached_result(key, payload)
    payload['rows'][0]['value'] = 2
    cached = cache.get_cached_result(key)
    cached['rows'][0]['value'] = 3
    assert cache.get_cached_result(key)['rows'][0]['value'] == 1
    assert cache.get_cached_result(cache.build_cache_key('user-b', {'limit': 5})) is None


def test_concurrent_writes_preserve_accounting_and_capacity():
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda index: cache.set_cached_result(str(index), {'rows': [index]}), range(300)))
    assert len(cache._CACHE) == cache.MAX_CACHE_ENTRIES
    assert cache._CACHE_BYTES == sum(entry['size'] for entry in cache._CACHE.values())
    cache.clear_cache()
    assert cache._CACHE_BYTES == 0
