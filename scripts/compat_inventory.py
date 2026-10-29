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

from sqlalchemy import exists  # noqa: E402

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

    # Mirrors SessionAnalyticsService: the legacy reader serves any session without a
    # *live* relational instance (soft-deleted instances do not count), evaluated in SQL
    # so memory does not grow with the activity-instance table.
    has_live_instance = exists().where(
        ActivityInstance.session_id == Session.id,
        ActivityInstance.deleted_at.is_(None),
    ).label("has_live_instance")
    sessions = db_session.query(Session, has_live_instance).filter(Session.deleted_at.is_(None))
    for session, session_has_live_instance in sessions.yield_per(BATCH):
        payload, sections = _sections(session.attributes)
        if isinstance(payload, dict) and payload and "session_data" not in payload:
            counts["sessions_with_unwrapped_attributes"] += 1
        if session_has_live_instance:
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
