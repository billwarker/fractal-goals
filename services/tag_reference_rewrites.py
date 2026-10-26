"""Keep planned-tag ids inside stored plans in step with catalog merges and deletions.

Planned tags live in prescription JSON (templates, dated program plans, the plan
snapshot on each activity instance and circuit run, and session snapshots). Unlike relational links
they have no foreign key, so catalog operations rewrite them explicitly.
"""

from __future__ import annotations

import copy
import json

from sqlalchemy import Text, cast, or_

from models import ActivityInstance, CircuitRun, ProgramSessionPlan, Session, SessionTemplate


def _rewrite_ids(tag_ids, mapping):
    if not isinstance(tag_ids, list):
        return tag_ids, False
    rewritten = []
    changed = False
    for tag_id in tag_ids:
        replacement = mapping.get(tag_id, tag_id)
        if replacement != tag_id:
            changed = True
        if replacement is not None and replacement not in rewritten:
            rewritten.append(replacement)
        elif replacement is not None:
            changed = True
    return rewritten, changed


def _rewrite_tags_field(entry, mapping):
    """Return (entry, changed) with an object's ``tags`` list mapped; an emptied list is dropped."""
    if not isinstance(entry, dict) or "tags" not in entry:
        return entry, False
    tags, changed = _rewrite_ids(entry["tags"], mapping)
    if not changed:
        return entry, False
    entry = dict(entry)
    if tags:
        entry["tags"] = tags
    else:
        entry.pop("tags")
    return entry, True


def _rewrite_tagged_list(entries, mapping, rewrite_entry):
    """Return (list, changed) with ``rewrite_entry`` applied to each object of a list."""
    if not isinstance(entries, list):
        return entries, False
    rewritten = []
    changed = False
    for entry in entries:
        entry, entry_changed = rewrite_entry(entry, mapping)
        rewritten.append(entry)
        changed = changed or entry_changed
    return (rewritten, True) if changed else (entries, False)


def _rewrite_round(planned_round, mapping):
    """A circuit plan round: its own tags and each member slot's."""
    result, changed = _rewrite_tags_field(planned_round, mapping)
    if not isinstance(result, dict):
        return result, changed
    slots, slots_changed = _rewrite_tagged_list(result.get("slots"), mapping, _rewrite_tags_field)
    if slots_changed:
        result = dict(result) if result is planned_round else result
        result["slots"] = slots
    return result, changed or slots_changed


def rewrite_prescription(prescription, mapping):
    """Return (prescription, changed) with tag ids mapped; a mapping to None removes the id.

    Covers activity plans (``tags``, ``sets[].tags``) and circuit plans (``tags``,
    ``rounds[].tags``, ``rounds[].slots[].tags``).
    """
    if not isinstance(prescription, dict):
        return prescription, False
    result, changed = _rewrite_tags_field(prescription, mapping)
    for key, rewrite_entry in (("sets", _rewrite_tags_field), ("rounds", _rewrite_round)):
        entries, entries_changed = _rewrite_tagged_list(result.get(key), mapping, rewrite_entry)
        if entries_changed:
            result = dict(result) if result is prescription else result
            result[key] = entries
            changed = True
    return result, changed


def rewrite_plan_tree(value, mapping):
    """Rewrite every ``prescription`` object nested anywhere in a plan document."""
    if isinstance(value, list):
        changed = False
        items = []
        for item in value:
            rewritten, item_changed = rewrite_plan_tree(item, mapping)
            items.append(rewritten)
            changed = changed or item_changed
        return (items, True) if changed else (value, False)
    if not isinstance(value, dict):
        return value, False
    changed = False
    result = {}
    for key, item in value.items():
        if key == "prescription":
            rewritten, item_changed = rewrite_prescription(item, mapping)
        else:
            rewritten, item_changed = rewrite_plan_tree(item, mapping)
        result[key] = rewritten
        changed = changed or item_changed
    return (result, True) if changed else (value, False)


def _rewrite_document(raw, mapping):
    """Rewrite a JSON column value that may be stored as an object or a JSON string."""
    stored_as_string = isinstance(raw, str)
    document = json.loads(raw) if stored_as_string else copy.deepcopy(raw)
    rewritten, changed = rewrite_plan_tree(document, mapping)
    if not changed:
        return raw, False
    return (json.dumps(rewritten) if stored_as_string else rewritten), True


def _mentions(column, tag_ids):
    return or_(*[cast(column, Text).contains(tag_id) for tag_id in tag_ids])


def rewrite_planned_tags(db_session, root_id, mapping) -> int:
    """Apply ``mapping`` (old tag id -> new id, or None to drop) to every stored plan in a fractal."""
    mapping = {old: new for old, new in mapping.items() if old != new}
    if not mapping:
        return 0
    tag_ids = list(mapping)
    changed_rows = 0
    for model, column_name in (
        (SessionTemplate, "template_data"),
        (ProgramSessionPlan, "plan_data"),
        (Session, "attributes"),
    ):
        column = getattr(model, column_name)
        for row in db_session.query(model).filter(model.root_id == root_id, _mentions(column, tag_ids)).all():
            rewritten, changed = _rewrite_document(getattr(row, column_name), mapping)
            if changed:
                setattr(row, column_name, rewritten)
                changed_rows += 1
    # Plan snapshots taken at session start: activity instances' and circuit runs'.
    for model in (ActivityInstance, CircuitRun):
        for row in db_session.query(model).filter(
            model.root_id == root_id,
            _mentions(model.prescription, tag_ids),
        ).all():
            rewritten, changed = rewrite_prescription(row.prescription, mapping)
            if changed:
                row.prescription = rewritten
                changed_rows += 1
    return changed_rows
