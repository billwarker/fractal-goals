"""What in a new API document would break an app built against an older one."""


def _resolve(document, schema):
    while isinstance(schema, dict) and '$ref' in schema:
        schema = document['components']['schemas'].get(schema['$ref'].rsplit('/', 1)[-1], {})
    return schema if isinstance(schema, dict) else {}


def _kinds(document, schema):
    """The JSON types a schema allows; empty means any."""
    schema = _resolve(document, schema)
    options = schema.get('anyOf') or schema.get('oneOf')
    if options:
        kinds = [_kinds(document, option) for option in options]
        return set() if any(not kind for kind in kinds) else set().union(*kinds)
    kind = schema.get('type')
    return set(kind) if isinstance(kind, list) else {kind} if kind else set()


def _objects(document, schema):
    schema = _resolve(document, schema)
    options = schema.get('anyOf') or schema.get('oneOf') or [schema]
    return [found for option in options if (found := _resolve(document, option)).get('properties')]


def _response_breaks(old, new, before, after, where, seen):
    marker = (str(before.get('$ref')), str(after.get('$ref'))) if before.get('$ref') else None
    if marker in seen:
        return
    if marker:
        seen = seen | {marker}
    old_kinds, new_kinds = _kinds(old, before), _kinds(new, after)
    if old_kinds and not new_kinds:
        yield f'{where}: was {sorted(old_kinds)}, now anything'
    elif old_kinds and new_kinds - old_kinds:
        yield f'{where}: may now be {sorted(new_kinds - old_kinds)}'
    old_schema, new_schema = _resolve(old, before), _resolve(new, after)
    if 'items' in old_schema and 'items' in new_schema:
        yield from _response_breaks(old, new, old_schema['items'], new_schema['items'], f'{where}[]', seen)
    old_objects, new_objects = _objects(old, before), _objects(new, after)
    if len(old_objects) == 1 and len(new_objects) == 1:
        was, now = old_objects[0], new_objects[0]
        for name, schema in was['properties'].items():
            if name not in now['properties']:
                yield f'{where}.{name}: removed'
                continue
            if name in was.get('required', []) and name not in now.get('required', []):
                yield f'{where}.{name}: no longer always present'
            yield from _response_breaks(old, new, schema, now['properties'][name], f'{where}.{name}', seen)


def _request_breaks(old, new, before, after, where):
    was, now = _resolve(old, before), _resolve(new, after)
    for name in sorted(set(now.get('required', [])) - set(was.get('required', []))):
        yield f'{where}.{name}: now required'
    for name, schema in was.get('properties', {}).items():
        if name in now.get('properties', {}):
            lost = _kinds(old, schema) - _kinds(new, now['properties'][name])
            if lost and _kinds(new, now['properties'][name]):
                yield f'{where}.{name}: no longer accepts {sorted(lost)}'


def _body(operation, *path):
    node = operation
    for key in (*path, 'content', 'application/json', 'schema'):
        node = node.get(key, {})
    return node


def breaking_changes(old, new):
    found = []
    for path, methods in old['paths'].items():
        for method, before in methods.items():
            where = f'{method.upper()} {path}'
            after = new['paths'].get(path, {}).get(method)
            if after is None:
                found.append(f'{where}: removed')
                continue
            was, now = _body(before, 'responses', '2XX'), _body(after, 'responses', '2XX')
            if was and not now:
                found.append(f'{where}: response is no longer described')
            elif was:
                found.extend(_response_breaks(old, new, was, now, f'{where} response', frozenset()))
            asked, asks = _body(before, 'requestBody'), _body(after, 'requestBody')
            if asks:
                found.extend(_request_breaks(old, new, asked, asks, f'{where} request'))
    return found
