"""Ids a device chooses for what it creates offline, so later offline writes can refer to them.

``blueprints.client_ids.accepts_client_id`` checks the id and sets it for one create of one model;
the service that builds that row takes it.
"""
import uuid
from contextvars import ContextVar

_client_id: ContextVar[tuple[type, str] | None] = ContextVar('client_id', default=None)


def set_client_id(model, entity_id: str) -> None:
    _client_id.set((model, entity_id))


def clear_client_id() -> None:
    _client_id.set(None)


def new_id(model) -> str:
    """The request's id for its one new ``model``, else a fresh one."""
    chosen = _client_id.get()
    if chosen is not None and chosen[0] is model:
        _client_id.set(None)
        return chosen[1]
    return str(uuid.uuid4())


def is_uuid(value) -> bool:
    try:
        return isinstance(value, str) and str(uuid.UUID(value)) == value.lower()
    except ValueError:
        return False


def keep_device_ids(sections, device_sections):
    """The plan's items, under the ids the device that started the session already shows them by."""
    ids = {
        item['item_key']: {key: item[key] for key in ('instance_id', 'circuit_run_id') if item.get(key)}
        for section in device_sections or [] if isinstance(section, dict)
        for item in section.get('items') or [] if isinstance(item, dict) and item.get('item_key')
    }
    for section in sections or []:
        for item in section.get('items') or []:
            if isinstance(item, dict) and item.get('item_key') in ids:
                item.update(ids[item['item_key']])
    return sections
