"""Unit tests for the Instagram oEmbed proxy service."""

import logging

import pytest

from services import oembed_service

logging_formatter = logging.Formatter()


@pytest.mark.unit
class TestInstagramPermalinkValidation:
    def test_accepts_post_reel_tv_permalinks(self):
        assert oembed_service.is_valid_instagram_permalink('https://www.instagram.com/p/ABC123/')
        assert oembed_service.is_valid_instagram_permalink('https://www.instagram.com/reel/ABC123/')
        assert oembed_service.is_valid_instagram_permalink('https://instagram.com/tv/ABC123')

    def test_rejects_other_hosts_and_paths(self):
        assert not oembed_service.is_valid_instagram_permalink('https://evil.com/p/ABC123/')
        assert not oembed_service.is_valid_instagram_permalink('https://www.instagram.com/someuser/')
        assert not oembed_service.is_valid_instagram_permalink('')
        assert not oembed_service.is_valid_instagram_permalink(None)


@pytest.mark.unit
class TestGetInstagramOembed:
    def _clear_cache(self):
        oembed_service._instagram_cache._store.clear()

    def test_reports_unconfigured_when_no_token(self, monkeypatch):
        self._clear_cache()
        monkeypatch.setattr(oembed_service.config, 'INSTAGRAM_OEMBED_TOKEN', None)
        result = oembed_service.get_instagram_oembed('https://www.instagram.com/reel/ABC123/')
        assert result == {"configured": False}

    def test_rejects_invalid_url_before_calling_upstream(self, monkeypatch):
        self._clear_cache()
        monkeypatch.setattr(oembed_service.config, 'INSTAGRAM_OEMBED_TOKEN', 'tok')
        called = {'n': 0}
        monkeypatch.setattr(oembed_service.requests, 'get', lambda *a, **k: called.__setitem__('n', 1))
        result = oembed_service.get_instagram_oembed('https://evil.com/p/ABC/')
        assert result == {"configured": True, "error": "invalid_instagram_url"}
        assert called['n'] == 0

    def test_returns_html_on_success_and_caches(self, monkeypatch):
        self._clear_cache()
        monkeypatch.setattr(oembed_service.config, 'INSTAGRAM_OEMBED_TOKEN', 'tok')

        class FakeResp:
            def raise_for_status(self):
                return None

            def json(self):
                return {"html": "<blockquote>ig</blockquote>", "width": 640, "height": 800,
                        "author_name": "someone", "thumbnail_url": "https://x/y.jpg"}

        calls = {'n': 0}

        def fake_get(*args, **kwargs):
            calls['n'] += 1
            return FakeResp()

        monkeypatch.setattr(oembed_service.requests, 'get', fake_get)
        url = 'https://www.instagram.com/reel/ABC123/'
        result = oembed_service.get_instagram_oembed(url)
        assert result['configured'] is True
        assert result['html'] == "<blockquote>ig</blockquote>"
        assert result['width'] == 640

        # Second call is served from cache (no extra upstream request).
        oembed_service.get_instagram_oembed(url)
        assert calls['n'] == 1

    def test_upstream_failure_returns_error_and_is_not_cached(self, monkeypatch):
        self._clear_cache()
        monkeypatch.setattr(oembed_service.config, 'INSTAGRAM_OEMBED_TOKEN', 'tok')

        def boom(*args, **kwargs):
            raise oembed_service.requests.RequestException("down")

        monkeypatch.setattr(oembed_service.requests, 'get', boom)
        url = 'https://www.instagram.com/reel/ABC123/'
        result = oembed_service.get_instagram_oembed(url)
        assert result == {"configured": True, "error": "upstream_error"}
        assert oembed_service._instagram_cache.get(url) is None


@pytest.mark.unit
def test_upstream_http_failure_never_logs_the_access_token(monkeypatch, caplog):
    """requests embeds the token-bearing request URL in HTTPError; logs must not."""
    import requests

    oembed_service._instagram_cache._store.clear()
    token = 'IGQVJ-synthetic-secret-token'
    monkeypatch.setattr(oembed_service.config, 'INSTAGRAM_OEMBED_TOKEN', token)

    def failing_get(url, params=None, timeout=None):
        prepared = requests.Request('GET', url, params=params).prepare()
        response = requests.Response()
        response.status_code = 400
        response.url = prepared.url
        response.request = prepared
        response.raise_for_status()

    monkeypatch.setattr(oembed_service.requests, 'get', failing_get)

    with caplog.at_level('DEBUG', logger=oembed_service.logger.name):
        result = oembed_service.get_instagram_oembed('https://www.instagram.com/reel/ABC123/')

    assert result == {"configured": True, "error": "upstream_error"}
    assert caplog.records, "the failure should still be logged"
    for record in caplog.records:
        rendered = record.getMessage() + (logging_formatter.formatException(record.exc_info) if record.exc_info else '')
        assert token not in rendered
    assert 'status=400' in caplog.text
