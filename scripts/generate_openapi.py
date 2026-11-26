#!/usr/bin/env python3
"""Write docs/api/openapi.json, or with --check-against <file> list what would break apps built on it."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from contracts.compatibility import breaking_changes
from contracts.openapi import build_openapi

OPENAPI_PATH = ROOT / 'docs' / 'api' / 'openapi.json'


def render(document):
    return json.dumps(document, indent=1, sort_keys=True) + '\n'


def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--check-against':
        problems = breaking_changes(json.loads(Path(sys.argv[2]).read_text()), json.loads(OPENAPI_PATH.read_text()))
        print('\n'.join(problems) or 'No breaking changes')
        raise SystemExit(1 if problems else 0)
    from app import app
    OPENAPI_PATH.write_text(render(build_openapi(app)))
    print(f'Wrote {OPENAPI_PATH.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
