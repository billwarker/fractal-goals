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


def serialize_compare_context(instance) -> dict:
    """What an instance compares against: its own tags (default), chosen tags, or all history."""
    mode = instance.progress_compare_mode or "same_tags"
    tags = list(instance.compare_tags or []) if mode == "tags" else (
        list(instance.tags or []) if mode == "same_tags" else []
    )
    return {
        "mode": mode,
        "tag_ids": [tag.id for tag in tags],
        "tags": serialize_tags(tags),
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
