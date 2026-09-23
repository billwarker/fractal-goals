import copy

from sqlalchemy.orm.attributes import flag_modified

import models


def _session_data(session):
    attrs = models._safe_load_json(session.attributes, {})
    if not isinstance(attrs, dict):
        attrs = {}
    data = attrs.get("session_data")
    if isinstance(data, dict):
        return attrs, data
    return attrs, attrs


def append_circuit_run_item(session, run_id, section_index, item_index=None):
    attrs, data = _session_data(session)
    sections = copy.deepcopy(data.get("sections")) if isinstance(data.get("sections"), list) else []
    index = 0 if section_index is None else section_index
    if not isinstance(index, int) or index < 0:
        return "section_index must be a non-negative integer"
    if not sections:
        if index != 0:
            return "section_index out of range"
        sections = [{"name": "Main", "items": []}]
    if index >= len(sections):
        return "section_index out of range"
    section = sections[index] if isinstance(sections[index], dict) else {"name": "Section"}
    items = section.get("items") if isinstance(section.get("items"), list) else [
        {"type": "activity", "activity_instance_id": instance_id}
        for instance_id in (section.get("activity_ids") or [])
    ]
    circuit_item = {"type": "circuit", "circuit_run_id": run_id}
    if isinstance(item_index, int) and 0 <= item_index <= len(items):
        items.insert(item_index, circuit_item)
    else:
        items.append(circuit_item)
    section["items"] = items
    section.pop("activity_ids", None)
    section.pop("activities", None)
    section.pop("exercises", None)
    sections[index] = section
    data["sections"] = sections
    session.attributes = attrs
    flag_modified(session, "attributes")
    return None


def remove_circuit_run_item(session, run_id):
    attrs, data = _session_data(session)
    sections = copy.deepcopy(data.get("sections")) if isinstance(data.get("sections"), list) else []
    for section in sections:
        if not isinstance(section, dict) or not isinstance(section.get("items"), list):
            continue
        section["items"] = [
            item
            for item in section["items"]
            if not (
                isinstance(item, dict)
                and item.get("type") == "circuit"
                and item.get("circuit_run_id") == run_id
            )
        ]
    data["sections"] = sections
    session.attributes = attrs
    flag_modified(session, "attributes")


def circuit_owned_instance_ids(db_session, session_id):
    """IDs of activity instances owned by a session's circuits (slots and round members).

    Circuit timing belongs to the parent circuit clock, so session-level
    lifecycle work (e.g. completion) must skip these instances.
    """
    run_join = models.CircuitRun.id == models.CircuitRunSlot.circuit_run_id
    ids = {instance_id for (instance_id,) in db_session.query(models.CircuitRunSlot.activity_instance_id).join(
        models.CircuitRun, run_join,
    ).filter(
        models.CircuitRun.session_id == session_id,
        models.CircuitRunSlot.activity_instance_id.is_not(None),
    ).all()}
    ids.update(instance_id for (instance_id,) in db_session.query(models.CircuitRoundMember.activity_instance_id).join(
        models.CircuitRound, models.CircuitRound.id == models.CircuitRoundMember.circuit_round_id,
    ).join(
        models.CircuitRun, models.CircuitRun.id == models.CircuitRound.circuit_run_id,
    ).filter(
        models.CircuitRun.session_id == session_id,
        models.CircuitRoundMember.activity_instance_id.is_not(None),
    ).all())
    return ids
