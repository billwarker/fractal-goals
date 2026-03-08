from typing import Any

type JsonDict = dict[str, Any]
type JsonList = list[JsonDict]
type ErrorPayload = str | JsonDict
type ServiceResult[T] = tuple[T | None, ErrorPayload | None, int]
