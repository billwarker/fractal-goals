import re
from pathlib import Path

from config import config


def _version(filename):
    source = (Path(__file__).parents[2] / 'client' / 'src' / 'content' / 'legal' / filename).read_text()
    match = re.search(r'^version:\s*(\S+)\s*$', source, re.MULTILINE)
    assert match, f'Missing version metadata in {filename}'
    return match.group(1)


def test_backend_legal_versions_match_published_documents():
    assert config.TERMS_VERSION == _version('terms.md')
    assert config.PRIVACY_VERSION == _version('privacy.md')
