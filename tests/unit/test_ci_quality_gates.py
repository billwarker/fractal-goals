from pathlib import Path

from scripts.check_backend_coverage_gate import verify
from scripts.check_backend_maintainability import verify as verify_maintainability


def test_backend_coverage_gate_cannot_be_dropped_by_ci_override():
    verify(Path(__file__).resolve().parents[2])


def test_backend_large_files_and_exception_debt_cannot_grow():
    verify_maintainability(Path(__file__).resolve().parents[2])
