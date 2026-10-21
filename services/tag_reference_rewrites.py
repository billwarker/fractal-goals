"""Keep planned-tag ids inside stored plans in step with catalog merges and deletions.

Planned tags live in prescription JSON (templates, dated program plans, the plan
snapshot on each activity instance, and session snapshots). Unlike relational links
they have no foreign key, so catalog operations rewrite them explicitly.
"""

from __future__ import annotations

import copy
import json

from sqlalchemy import Text, cast, or_

from models import ActivityInstance, ProgramSessionPlan, Session, SessionTemplate


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


def rewrite_prescription(prescription, mapping):
    """Return (prescription, changed) with tag ids mapped; a mapping to None removes the id."""
    if not isinstance(prescription, dict):
        return prescription, False
    result = prescription
    changed = False
    if "tags" in prescription:
        tags, tags_changed = _rewrite_ids(prescription["tags"], mapping)
        if tags_changed:
            result = dict(result)
            if tags:
                result["tags"] = tags
            else:
                result.pop("tags")
            changed = True
    sets = prescription.get("sets")
    if isinstance(sets, list):
        new_sets = []
        sets_changed = False
        for planned_set in sets:
            if isinstance(planned_set, dict) and "tags" in planned_set:
                tags, tags_changed = _rewrite_ids(planned_set["tags"], mapping)
                if tags_changed:
                    planned_set = dict(planned_set)
                    if tags:
                        planned_set["tags"] = tags
                    else:
                        planned_set.pop("tags")
                    sets_changed = True
            new_sets.append(planned_set)
        if sets_changed:
            result = dict(result) if result is prescription else result
            result["sets"] = new_sets
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
    for instance in db_session.query(ActivityInstance).filter(
        ActivityInstance.root_id == root_id,
        _mentions(ActivityInstance.prescription, tag_ids),
    ).all():
        rewritten, changed = rewrite_prescription(instance.prescription, mapping)
        if changed:
            instance.prescription = rewritten
            changed_rows += 1
    return changed_rows
