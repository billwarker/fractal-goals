#!/usr/bin/env python3
"""Count stored rows that still depend on each legacy read path.

Read-only. Prints counts per compatibility reader, never row content, so it is safe
to run against production (with a read-only connection) as the evidence for retiring
a fallback: a reader whose count is zero, and stays zero after the last writer of
that shape is gone, can be deleted along with its tests. Run:

    ENV=production python scripts/compat_inventory.py

Readers covered (see planning/code-quality-security-audit-2026-10-28.md, F12):
- services/plan_sections.py: templates whose sections hold legacy activity lists.
- services/session_analytics_service.py: sessions without relational activity
  instances whose JSON sections still carry legacy ``exercises`` evidence.
- services/_serialize_sessions.py: sessions whose attributes are not wrapped in
  ``session_data`` (the pre-relational top-level shape).
"""

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import models  # noqa: E402
from models import ActivityInstance, Session, SessionTemplate  # noqa: E402
from services.plan_sections import LEGACY_ITEM_KEYS  # noqa: E402

BATCH = 500


def _sections(payload):
    payload = models._safe_load_json(payload, {})
    if not isinstance(payload, dict):
        return payload, []
    data = payload.get("session_data") if isinstance(payload.get("session_data"), dict) else payload
    sections = data.get("sections") if isinstance(data, dict) else None
    return payload, sections if isinstance(sections, list) else []


def inventory(db_session):
    counts = {
        "session_templates_with_legacy_item_lists": 0,
        "sessions_with_legacy_exercise_evidence": 0,
        "sessions_with_unwrapped_attributes": 0,
    }
    for template in db_session.query(SessionTemplate).filter(SessionTemplate.deleted_at.is_(None)).yield_per(BATCH):
        _payload, sections = _sections(template.template_data)
        if any(isinstance(section, dict) and "items" not in section
               and any(key in section for key in LEGACY_ITEM_KEYS) for section in sections):
            counts["session_templates_with_legacy_item_lists"] += 1

    sessions_with_instances = {
        session_id for (session_id,) in db_session.query(ActivityInstance.session_id).distinct()
    }
    for session in db_session.query(Session).filter(Session.deleted_at.is_(None)).yield_per(BATCH):
        payload, sections = _sections(session.attributes)
        if isinstance(payload, dict) and payload and "session_data" not in payload:
            counts["sessions_with_unwrapped_attributes"] += 1
        if session.id in sessions_with_instances:
            continue
        if any(isinstance(section, dict) and isinstance(section.get("exercises"), list)
               and any(isinstance(item, dict) and item.get("type") == "activity" and item.get("activity_id")
                       for item in section["exercises"])
               for section in sections):
            counts["sessions_with_legacy_exercise_evidence"] += 1
    return counts


def main():
    db_session = models.get_session(models.get_engine())
    try:
        print(json.dumps(inventory(db_session), indent=2))
    finally:
        db_session.rollback()
        db_session.close()


if __name__ == "__main__":
    main()
