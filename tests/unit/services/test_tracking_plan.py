"""The tracking plan is the one list of what analytics may hold; these keep everything else honest about it."""
import json
import re
from pathlib import Path

import pytest

from services.tracking_plan import PLAN_PATH, load_plan

REPO = Path(__file__).resolve().parents[3]
PRIVACY = REPO / 'client' / 'src' / 'content' / 'legal' / 'privacy.md'
EVENT_LINE = re.compile(r'^`[a-z_]+`(?: · `[a-z_]+`)*(?: ·)?$')


def _policy_usage_section():
    text = PRIVACY.read_text(encoding='utf-8')
    start = text.index('### 2.3 ')
    return text[start:text.index('\n### 2.4 ', start)]


def _policy_events():
    """Every event the policy lists: lines made only of backticked names."""
    names = []
    for line in _policy_usage_section().splitlines():
        if EVENT_LINE.match(line.strip()):
            names.extend(re.findall(r'`([a-z_]+)`', line))
    return names


@pytest.mark.unit
class TestTrackingPlan:
    def test_privacy_policy_lists_exactly_the_plan(self):
        listed = _policy_events()

        assert len(listed) == len(set(listed)), 'An event is listed twice in privacy.md §2.3'
        assert set(listed) == set(load_plan()), (
            'privacy.md §2.3 and services/tracking_plan.json disagree. Update the policy (and bump its '
            'version) before collecting an event, or remove it from the plan.'
        )

    def test_policy_groups_match_categories(self):
        section = _policy_usage_section()
        public_part = section[section.index('**When you visit our public website'):]
        public_listed = {name for line in public_part.splitlines() if EVENT_LINE.match(line.strip())
                         for name in re.findall(r'`([a-z_]+)`', line)}

        assert public_listed == {name for name, event in load_plan().items() if event.surface == 'public'}

    def test_props_can_never_hold_free_text(self):
        raw = json.loads(PLAN_PATH.read_text(encoding='utf-8'))
        allowed_types = set(raw['prop_types'])
        for event in raw['events']:
            for prop, spec in event['props'].items():
                assert spec['type'] in allowed_types, f'{event["name"]}.{prop}'
                if spec['type'] == 'enum':
                    assert spec['values'] and all(re.fullmatch(r'[a-z0-9_]+', value) for value in spec['values'])
                if spec['type'] == 'int':
                    assert {'min', 'max'} <= set(spec), f'{event["name"]}.{prop} needs bounds'

    def test_every_event_is_well_formed(self):
        for name, event in load_plan().items():
            assert re.fullmatch(r'[a-z][a-z_]{2,79}', name)
            assert event.schema_version >= 1
            assert event.surface in {'app', 'public'}
            assert event.category in {'usage', 'reliability', 'public'}
            assert (event.surface == 'public') == (event.category == 'public')


@pytest.mark.unit
def test_sentry_is_disclosed_before_it_is_switched_on():
    """Sentry (client/src/utils/monitoring.js) is dormant until a build sets its DSN.

    Session replay and tracing send behavioural data to a third party, so the Privacy Policy
    must name Sentry as a service provider before any build passes `VITE_SENTRY_DSN`.
    """
    build_files = [REPO / 'cloudbuild.yaml', REPO / 'client' / 'Dockerfile', REPO / 'docker-compose.yml']
    enables_sentry = any(
        'VITE_SENTRY_DSN' in path.read_text(encoding='utf-8') for path in build_files if path.exists()
    )

    if enables_sentry:
        assert re.search(r'^\| \*\*Sentry\*\* \|', PRIVACY.read_text(encoding='utf-8'), re.MULTILINE), (
            'A build sets VITE_SENTRY_DSN but privacy.md §5 does not list Sentry as a service provider.'
        )
