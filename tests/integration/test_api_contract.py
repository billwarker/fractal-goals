"""docs/api/openapi.json is current, complete, and catches changes that would break an installed app."""
import copy
import json
from pathlib import Path

import pytest

from contracts.checking import contract_errors
from contracts.compatibility import breaking_changes
from contracts.openapi import api_rules, build_openapi
from contracts.requests import inline_request_models
from contracts.responses import response_models

PUBLISHED = Path(__file__).resolve().parents[2] / 'docs' / 'api' / 'openapi.json'


@pytest.fixture(scope='module')
def real_app():
    from app import app
    return app


@pytest.fixture(scope='module')
def document(real_app):
    return build_openapi(real_app)


def test_the_published_document_is_current(document):
    assert json.loads(PUBLISHED.read_text()) == document, 'run python scripts/generate_openapi.py'


def test_every_api_route_is_published(real_app, document):
    operations = {operation['operationId'] for methods in document['paths'].values() for operation in methods.values()}
    for rule in api_rules(real_app):
        assert any(name.startswith(rule.endpoint.replace('.', '_')) for name in operations), rule.endpoint
    assert len(operations) == sum(len(methods) for methods in document['paths'].values())


def test_described_endpoints_exist(real_app):
    endpoints = {rule.endpoint for rule in api_rules(real_app)}
    assert set(response_models()) <= endpoints
    assert set(inline_request_models()) <= endpoints


def test_every_reference_resolves(document):
    text = json.dumps(document)
    for name in set(part.split('"')[0] for part in text.split('#/components/schemas/')[1:]):
        assert name in document['components']['schemas'], name


def test_undescribed_fields_are_refused_here_and_allowed_to_clients(document):
    body = {'message': 'Signed out', 'extra': 1}
    assert contract_errors('device_auth.sign_out', body) == ['extra: Extra inputs are not permitted']
    assert contract_errors('device_auth.sign_out', {'message': 5})
    assert 'additionalProperties' not in document['components']['schemas']['Message']


def _goal(document):
    return document['components']['schemas']['Goal']


def _drop_field(document):
    del _goal(document)['properties']['deadline']


def _retype(document):
    _goal(document)['properties']['name'] = {'type': 'integer'}


def _make_nullable(document):
    _goal(document)['properties']['name'] = {'anyOf': [{'type': 'string'}, {'type': 'null'}]}


def _make_optional(document):
    _goal(document)['required'].remove('name')


def _drop_route(document):
    del document['paths']['/api/sync/changes']


def _require_input(document):
    document['components']['schemas']['DeviceSignInSchema']['required'].append('locale')


@pytest.mark.parametrize('change', [_drop_field, _retype, _make_nullable, _make_optional, _drop_route, _require_input])
def test_breaking_changes_are_found(document, change):
    changed = copy.deepcopy(document)
    change(changed)
    assert breaking_changes(document, changed)


def test_additions_do_not_break(document):
    changed = copy.deepcopy(document)
    _goal(changed)['properties']['mood'] = {'type': 'string'}
    changed['paths']['/api/new'] = {'get': {'responses': {'2XX': {}}}}
    changed['components']['schemas']['DeviceSignInSchema']['properties']['locale'] = {'type': 'string'}
    assert breaking_changes(document, changed) == []
    assert breaking_changes(document, document) == []
