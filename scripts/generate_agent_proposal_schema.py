#!/usr/bin/env python3
"""Generate the pinned adapter's model-visible schema from canonical validators."""

import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
from services.agent_operation_registry import proposal_json_schema


OUTPUT = PROJECT_ROOT / "agent_adapter" / "agent_proposal_schema_v1.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = json.dumps(proposal_json_schema(), indent=2, sort_keys=True) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != expected:
            raise SystemExit("Agent proposal schema artifact is stale; run scripts/generate_agent_proposal_schema.py")
        return
    OUTPUT.write_text(expected)


if __name__ == "__main__":
    main()
