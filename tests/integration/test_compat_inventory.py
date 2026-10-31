"""The compatibility inventory counts each legacy shape exactly once, and nothing else."""
import importlib.util
import uuid
from pathlib import Path

import pytest

from models import ActivityInstance, Session, SessionTemplate, utc_now

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "compat_inventory.py"


def _inventory_module():
    spec = importlib.util.spec_from_file_location("compat_inventory", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_inventory_counts_only_legacy_shapes(db_session, sample_ultimate_goal, sample_activity_definition):
    root_id = sample_ultimate_goal.id
    owner_id = sample_ultimate_goal.owner_id
    db_session.add_all([
        SessionTemplate(id=str(uuid.uuid4()), root_id=root_id, name="Legacy",
                        template_data={"sections": [{"name": "Main", "activities": ["a1"]}]}),
        SessionTemplate(id=str(uuid.uuid4()), root_id=root_id, name="Typed",
                        template_data={"sections": [{"name": "Main", "items": []}]}),
        Session(id=str(uuid.uuid4()), root_id=root_id, owner_id=owner_id, name="Legacy evidence", completed=True,
                attributes={"session_data": {"sections": [{"exercises": [{"type": "activity", "activity_id": "a1"}]}]}}),
        Session(id=str(uuid.uuid4()), root_id=root_id, owner_id=owner_id, name="Unwrapped", completed=True,
                attributes={"sections": []}),
    ])
    relational = Session(id=str(uuid.uuid4()), root_id=root_id, owner_id=owner_id, name="Relational", completed=True,
                         attributes={"session_data": {"sections": [{"exercises": [{"type": "activity", "activity_id": "a1"}]}]}})
    db_session.add(relational)
    db_session.flush()
    db_session.add(ActivityInstance(id=str(uuid.uuid4()), root_id=root_id, session_id=relational.id,
                                    activity_definition_id=sample_activity_definition.id))
    db_session.commit()

    assert _inventory_module().inventory(db_session) == {
        "session_templates_with_legacy_item_lists": 1,
        "sessions_with_legacy_exercise_evidence": 1,
        "sessions_with_unwrapped_attributes": 1,
    }


LEGACY_ATTRIBUTES = {"session_data": {"sections": [{"exercises": [{"type": "activity", "activity_id": "a1"}]}]}}


@pytest.mark.parametrize("instances, counted", [
    ((), 1),               # no relational instances: legacy evidence is served
    (("live",), 0),        # one live instance: relational path wins
    (("live", "deleted"), 0),
    (("deleted",), 1),     # deleted-only: runtime still serves legacy evidence (R3)
])
def test_legacy_evidence_counts_mirror_the_live_instance_rule(
    db_session, sample_ultimate_goal, sample_activity_definition, instances, counted,
):
    root_id = sample_ultimate_goal.id
    session = Session(id=str(uuid.uuid4()), root_id=root_id, owner_id=sample_ultimate_goal.owner_id,
                      name="Evidence", completed=True, attributes=LEGACY_ATTRIBUTES)
    db_session.add(session)
    db_session.flush()
    for state in instances:
        db_session.add(ActivityInstance(
            id=str(uuid.uuid4()), root_id=root_id, session_id=session.id,
            activity_definition_id=sample_activity_definition.id,
            deleted_at=utc_now() if state == "deleted" else None,
        ))
    db_session.commit()

    assert _inventory_module().inventory(db_session)["sessions_with_legacy_exercise_evidence"] == counted


def test_inventory_agrees_with_the_runtime_legacy_reader_for_deleted_only_sessions(
    db_session, authed_client, sample_ultimate_goal, sample_activity_definition,
):
    root_id = sample_ultimate_goal.id
    activity_id = sample_activity_definition.id
    session = Session(id=str(uuid.uuid4()), root_id=root_id, owner_id=sample_ultimate_goal.owner_id,
                      name="Legacy evidence", completed=True,
                      attributes={"session_data": {"sections": [{"exercises": [{"type": "activity", "activity_id": activity_id}]}]}})
    db_session.add(session)
    db_session.flush()
    db_session.add(ActivityInstance(id=str(uuid.uuid4()), root_id=root_id, session_id=session.id,
                                    activity_definition_id=activity_id, deleted_at=utc_now()))
    db_session.commit()

    served = authed_client.get(f"/api/{root_id}/sessions/analytics-summary").get_json()["activity_instances"][activity_id]

    assert len(served) == 1 and served[0]["id"].startswith(f"{session.id}-legacy-")
    assert _inventory_module().inventory(db_session)["sessions_with_legacy_exercise_evidence"] == 1
