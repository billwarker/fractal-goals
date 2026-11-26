"""Builds the OpenAPI document from the URL map, the request validators and the response models."""
import re
from typing import Any

from pydantic.json_schema import models_json_schema

from contracts.requests import inline_request_models
from contracts.responses import response_models

VERSION = '1.0.0'
_REF = '#/components/schemas/{model}'
_PARAMETER = re.compile(r'<(?:(\w+):)?(\w+)>')
_ADMIN_OR_PAGES = ('admin', 'pages', 'static')


def _schema(node):
    """Clients must ignore fields they don't know, so nothing published forbids them."""
    if isinstance(node, dict):
        return {
            key: _schema(value) for key, value in node.items()
            if not (key == 'additionalProperties' and value is False)
        }
    return [_schema(item) for item in node] if isinstance(node, list) else node


def api_rules(app):
    for rule in sorted(app.url_map.iter_rules(), key=lambda item: (item.rule, item.endpoint)):
        if rule.rule.startswith('/api/') and rule.endpoint.split('.')[0] not in _ADMIN_OR_PAGES:
            yield rule


def build_openapi(app):
    responses, inline = response_models(), inline_request_models()
    requests = {}
    for rule in api_rules(app):
        model = getattr(app.view_functions[rule.endpoint], 'request_model', None) or inline.get(rule.endpoint)
        if model is not None:
            requests[rule.endpoint] = model
    wanted: list[Any] = list(dict.fromkeys([
        *((model, 'validation') for model in requests.values()),
        *((model, 'serialization') for model in responses.values()),
    ]))
    references, definitions = models_json_schema(wanted, ref_template=_REF)
    used = set()

    def operation_id(rule, method):
        name = rule.endpoint.replace('.', '_')
        if len(rule.methods - {'HEAD', 'OPTIONS'}) > 1:
            name += f'_{method.lower()}'
        if name in used:  # One view at two addresses.
            name += '_' + re.sub(r'\W+', '_', _PARAMETER.sub('', rule.rule).removeprefix('/api/')).strip('_')
        used.add(name)
        return name

    paths = {}
    for rule in api_rules(app):
        path = _PARAMETER.sub(r'{\2}', rule.rule)
        for method in sorted(rule.methods - {'HEAD', 'OPTIONS'}):
            operation = {
                'operationId': operation_id(rule, method),
                'tags': [rule.endpoint.split('.')[0]],
                'responses': {
                    '2XX': {'description': 'Success'},
                    'default': {'description': 'Error', 'content': {'application/json': {
                        'schema': {'$ref': _REF.format(model='Error')},
                    }}},
                },
            }
            parameters = [
                {'name': name, 'in': 'path', 'required': True,
                 'schema': {'type': 'integer' if kind == 'int' else 'string'}}
                for kind, name in _PARAMETER.findall(rule.rule)
            ]
            if parameters:
                operation['parameters'] = parameters
            view = app.view_functions[rule.endpoint]
            if getattr(view, 'requires_token', False):
                operation['security'] = [{'bearer': []}]
            if rule.endpoint in requests and method != 'GET':
                operation['requestBody'] = {'required': True, 'content': {'application/json': {
                    'schema': references[(requests[rule.endpoint], 'validation')],
                }}}
            if rule.endpoint in responses:
                operation['responses']['2XX']['content'] = {'application/json': {
                    'schema': references[(responses[rule.endpoint], 'serialization')],
                }}
            paths.setdefault(path, {})[method.lower()] = operation
    return _schema({
        'openapi': '3.1.0',
        'info': {
            'title': 'Fractal Goals API', 'version': VERSION,
            'description': 'Fields may be added at any time: ignore ones you don\'t know. Any write may also answer '
                           'with `goal_changes`, the goals it completed or reopened.',
        },
        'paths': paths,
        'components': {
            'securitySchemes': {'bearer': {'type': 'http', 'scheme': 'bearer'}},
            'schemas': {
                'Error': {'type': 'object', 'required': ['error'], 'properties': {
                    'error': {}, 'code': {'type': 'string'},
                }},
                **definitions['$defs'],
            },
        },
    })
