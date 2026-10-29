"""The compatibility inventory counts each legacy shape exactly once, and nothing else."""
import importlib.util
import uuid
from pathlib import Path

from models import ActivityInstance, Session, SessionTemplate

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
