from typing import Any, TypeAlias, TypeVar

T = TypeVar("T")

JsonDict: TypeAlias = dict[str, Any]
JsonList: TypeAlias = list[JsonDict]
ErrorPayload: TypeAlias = str | JsonDict
ServiceResult: TypeAlias = tuple[T | None, ErrorPayload | None, int]
