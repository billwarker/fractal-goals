"""Shared tag identity helpers: names, serialization, and comparison signatures.

A tag is one ``ActivityTagDefinition`` per fractal. Names are unique per fractal
(archived tags included) under the database's ``normalized_name`` expression;
``normalize_tag_name`` and ``client/src/utils/tagNames.js`` mirror it and share
``tests/fixtures/tag_name_normalization_cases.json``.
"""

from __future__ import annotations

from typing import Iterable


def canonical_tag_name(value: str) -> str:
    """The display form stored for a tag or family name: trimmed, inner whitespace collapsed."""
    return " ".join((value or "").split())


def normalize_tag_name(value: str) -> str:
    """The uniqueness key for a name; matches the database's ``normalized_name`` column."""
    return canonical_tag_name(value).lower()


def tag_signature(tag_ids: Iterable[str]) -> str:
    """Sorted, comma-joined ids; matches the database signature trigger (``COLLATE "C"``)."""
    return ",".join(sorted({str(tag_id) for tag_id in tag_ids if tag_id}))


def serialize_tag(definition) -> dict:
    return {
        "id": definition.id,
        "name": definition.name,
        "color": definition.color,
        "family_id": definition.family_id,
        "sort_order": definition.sort_order,
        "archived": definition.deleted_at is not None,
    }


def serialize_tags(definitions) -> list[dict]:
    return [serialize_tag(definition) for definition in definitions or []]


COMPARE_MODES = ("same_tags", "tags", "all")


def session_scope(instance) -> dict:
    """The session template ({id, name, color}) and program day ({id, name}) an instance ran in, or None."""
    from services.session_runtime import get_session_template_color

    session = getattr(instance, "session", None)
    template = getattr(session, "template", None) if session is not None else None
    program_day = getattr(session, "program_day", None) if session is not None else None
    return {
        "template": {
            "id": template.id,
            "name": template.name,
            "color": get_session_template_color(session),
        } if template is not None else None,
        "program_day": {"id": program_day.id, "name": program_day.name} if program_day is not None else None,
    }


def serialize_compare_context(instance) -> dict:
    """What an instance compares against.

    Tags: its own tags (default), chosen tags, or all history; optionally narrowed to past
    sessions from the same session template and/or program day.
    """
    mode = instance.progress_compare_mode or "same_tags"
    tags = list(instance.compare_tags or []) if mode == "tags" else (
        list(instance.tags or []) if mode == "same_tags" else []
    )
    same_template = bool(getattr(instance, "progress_compare_same_template", False))
    same_program_day = bool(getattr(instance, "progress_compare_same_program_day", False))
    scope = session_scope(instance)
    customized = mode != "same_tags" or same_template or same_program_day
    remembered_in = scope["program_day"] or scope["template"]
    return {
        "mode": mode,
        "tag_ids": [tag.id for tag in tags],
        "tags": serialize_tags(tags),
        "same_template": same_template,
        "same_program_day": same_program_day,
        **scope,
        # A customized comparison is remembered for this activity in this template/program day.
        "remembered_for": remembered_in["name"] if customized and remembered_in else None,
        "version": instance.progress_compare_version,
    }


def name_taken_details(definition) -> dict:
    return {
        "code": "tag_name_taken",
        "existing": {
            "id": definition.id,
            "name": definition.name,
            "archived": definition.deleted_at is not None,
        },
    }
