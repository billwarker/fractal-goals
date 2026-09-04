#!/usr/bin/env python3
"""Fail when backend CI can silently bypass the canonical coverage gate."""

from __future__ import annotations

import configparser
from pathlib import Path


MINIMUM_BASELINE = 80


def verify(root: Path) -> None:
    config = configparser.ConfigParser()
    config.read(root / "pytest.ini")
    addopts = config["pytest"]["addopts"]
    required = (
        "--cov=services",
        "--cov=blueprints",
        "--cov-fail-under=",
    )
    missing = [option for option in required if option not in addopts]
    if missing:
        raise SystemExit(f"pytest.ini is missing coverage gates: {', '.join(missing)}")

    threshold_text = addopts.split("--cov-fail-under=", 1)[1].split()[0]
    threshold = int(threshold_text)
    if threshold < MINIMUM_BASELINE:
        raise SystemExit(
            f"Coverage threshold regressed from {MINIMUM_BASELINE}% to {threshold}%"
        )

    workflow = (root / ".github/workflows/backend-ci.yml").read_text()
    coverage_job = workflow.split("  coverage:", 1)[1]
    command = next(
        line.strip()
        for line in coverage_job.splitlines()
        if "python -m pytest" in line
    )
    if "-o addopts" in command:
        raise SystemExit("Coverage CI must not override pytest.ini addopts")
    for test_scope in ("tests/unit", "tests/integration", "tests/performance"):
        if test_scope not in command:
            raise SystemExit(f"Coverage CI is missing {test_scope}")


if __name__ == "__main__":
    verify(Path(__file__).resolve().parents[1])
    print(f"Backend coverage gate is canonical and ratcheted at >= {MINIMUM_BASELINE}%")
