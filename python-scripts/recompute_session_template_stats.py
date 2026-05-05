#!/usr/bin/env python3
"""Recompute derived session/template/activity duration stats for a root."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from models import get_scoped_session, remove_session
from services.session_template_stats_service import SessionTemplateStatsService


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root-id", required=True, help="Root/fractal id to rebuild")
    args = parser.parse_args()

    db_session = get_scoped_session()
    try:
        result = SessionTemplateStatsService(db_session).rebuild_root(args.root_id)
        db_session.commit()
        print(json.dumps({
            "root_id": args.root_id,
            "template_count": len(result.get("templates") or {}),
            "activity_count": len(result.get("activities") or {}),
        }, indent=2))
        return 0
    except Exception:
        db_session.rollback()
        raise
    finally:
        db_session.close()
        remove_session()


if __name__ == "__main__":
    raise SystemExit(main())
