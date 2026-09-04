#!/usr/bin/env python3
"""No-growth guardrails for known backend decomposition and error debt."""

from __future__ import annotations

from pathlib import Path


MAX_SOURCE_LINES = 800
SIZE_BACKLOG = {
    "services/landing_publish_service.py": 1634,
    "services/progress_service.py": 1391,
    "services/analytics_engine.py": 1344,
    "services/serializers.py": 1285,
    "services/session_lifecycle_service.py": 1111,
    "services/completion_handlers.py": 1075,
    "blueprints/activities_api.py": 936,
    "services/admin_service.py": 877,
    "blueprints/goals_api.py": 838,
    "services/note_service.py": 835,
}
MAX_ROUTE_SQLALCHEMY_CATCHES = 184
MAX_BROAD_CATCHES = 36


def _line_count(path: Path) -> int:
    return len(path.read_text().splitlines())


def verify(root: Path) -> None:
    failures = []
    source_files = sorted((root / "services").glob("*.py"))
    source_files += sorted((root / "blueprints").glob("*.py"))
    for path in source_files:
        relative = path.relative_to(root).as_posix()
        limit = SIZE_BACKLOG.get(relative, MAX_SOURCE_LINES)
        lines = _line_count(path)
        if lines > limit:
            failures.append(f"{relative}: {lines} lines exceeds cap {limit}")

    blueprint_text = "\n".join(
        path.read_text() for path in sorted((root / "blueprints").glob("*.py"))
    )
    route_catches = blueprint_text.count("except SQLAlchemyError")
    if route_catches > MAX_ROUTE_SQLALCHEMY_CATCHES:
        failures.append(
            "Blueprint rollback/error boilerplate grew: "
            f"{route_catches} > {MAX_ROUTE_SQLALCHEMY_CATCHES}"
        )

    all_text = blueprint_text + "\n" + "\n".join(
        path.read_text() for path in sorted((root / "services").glob("*.py"))
    )
    broad_catches = all_text.count("except Exception")
    bare_catches = sum(
        1 for line in all_text.splitlines() if line.strip().startswith("except:")
    )
    if broad_catches > MAX_BROAD_CATCHES:
        failures.append(f"Broad exception catches grew: {broad_catches} > {MAX_BROAD_CATCHES}")
    if bare_catches:
        failures.append(f"Bare exception catches are forbidden; found {bare_catches}")

    if failures:
        raise SystemExit("Backend maintainability gate failed:\n- " + "\n- ".join(failures))


if __name__ == "__main__":
    verify(Path(__file__).resolve().parents[1])
    print("Backend maintainability guardrails passed")
