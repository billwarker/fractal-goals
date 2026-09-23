"""Load the versioned canonical proposal schema into MCP-visible Pydantic types."""

import json
from pathlib import Path
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, create_model


SCHEMA_PATH = Path(__file__).with_name("agent_proposal_schema_v1.json")
CANONICAL_SCHEMA = json.loads(SCHEMA_PATH.read_text())
SCHEMA_VERSION = CANONICAL_SCHEMA["schema_version"]
_DEFINITIONS = CANONICAL_SCHEMA.get("$defs", {})
_MODEL_CACHE: dict[str, type[BaseModel]] = {}


def _field_metadata(schema):
    metadata = {"description": schema.get("description"), "title": schema.get("title")}
    if "minLength" in schema:
        metadata["min_length"] = schema["minLength"]
    if "maxLength" in schema:
        metadata["max_length"] = schema["maxLength"]
    if "minItems" in schema:
        metadata["min_length"] = schema["minItems"]
    if "maxItems" in schema:
        metadata["max_length"] = schema["maxItems"]
    if "minimum" in schema:
        metadata["ge"] = schema["minimum"]
    if "maximum" in schema:
        metadata["le"] = schema["maximum"]
    if "pattern" in schema:
        metadata["pattern"] = schema["pattern"]
    return {key: value for key, value in metadata.items() if value is not None}


def _schema_type(schema, name):
    if "$ref" in schema:
        definition_name = schema["$ref"].rsplit("/", 1)[-1]
        return _definition_model(definition_name)
    if "const" in schema:
        return Literal[schema["const"]]
    if "enum" in schema:
        return Literal[tuple(schema["enum"])]
    if "oneOf" in schema or "anyOf" in schema:
        variants = schema.get("oneOf", schema.get("anyOf"))
        nullable = any(item.get("type") == "null" for item in variants)
        types = tuple(
            _schema_type(item, f"{name}Variant{index}")
            for index, item in enumerate(variants)
            if item.get("type") != "null"
        )
        if nullable:
            types += (type(None),)
        if not types:
            return Any
        combined = Union[types]
        discriminator = (schema.get("discriminator") or {}).get("propertyName")
        return Annotated[combined, Field(discriminator=discriminator)] if discriminator else combined
    schema_type = schema.get("type")
    if isinstance(schema_type, list):
        non_null = [item for item in schema_type if item != "null"]
        if not non_null:
            return Any
        resolved = _schema_type({**schema, "type": non_null[0]}, name)
        return resolved | None if "null" in schema_type else resolved
    if schema_type == "array":
        return list[_schema_type(schema.get("items", {}), f"{name}Item")]
    if schema_type == "object":
        if "properties" in schema or schema.get("additionalProperties") is False:
            return _object_model(name, schema)
        additional = schema.get("additionalProperties")
        return dict[str, _schema_type(additional, f"{name}Value")] if isinstance(additional, dict) else dict[str, Any]
    return {
        "string": str,
        "integer": int,
        "number": float,
        "boolean": bool,
        "null": type(None),
    }.get(schema_type, Any)


def _object_model(name, schema):
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))
    fields = {}
    for field_name, field_schema in properties.items():
        field_type = _schema_type(field_schema, f"{name}{field_name.title().replace('_', '')}")
        default = ... if field_name in required else field_schema.get("default", None)
        fields[field_name] = (field_type, Field(default, **_field_metadata(field_schema)))
    model_config = ConfigDict(extra="forbid") if schema.get("additionalProperties") is False else ConfigDict()
    return create_model(name, __config__=model_config, **fields)


def _definition_model(name):
    if name not in _MODEL_CACHE:
        _MODEL_CACHE[name] = _object_model(name, _DEFINITIONS[name])
    return _MODEL_CACHE[name]


AgentProposalSchema = _object_model("AgentProposalSchema", {
    key: value for key, value in CANONICAL_SCHEMA.items()
    if key in {"type", "properties", "required", "additionalProperties"}
})
