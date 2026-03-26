from models import ActivityInstanceMode, ActivityMode
from services.payload_normalizers import normalize_mode_ids


def load_valid_modes_for_root(db_session, root_id: str, mode_ids) -> tuple[list[ActivityMode], list[str]]:
    normalized_ids = normalize_mode_ids(mode_ids)
    if not normalized_ids:
        return [], []

    valid_modes = db_session.query(ActivityMode).filter(
        ActivityMode.id.in_(normalized_ids),
        ActivityMode.root_id == root_id,
        ActivityMode.deleted_at.is_(None),
    ).all()
    valid_mode_ids = {mode.id for mode in valid_modes}
    invalid_ids = [mode_id for mode_id in normalized_ids if mode_id not in valid_mode_ids]
    return valid_modes, invalid_ids


def attach_instance_modes(db_session, instance_id: str, modes: list[ActivityMode]) -> None:
    for mode in modes:
        db_session.add(ActivityInstanceMode(
            activity_instance_id=instance_id,
            activity_mode_id=mode.id,
        ))


def replace_instance_modes(db_session, root_id: str, instance_id: str, mode_ids) -> tuple[list[ActivityMode], list[str]]:
    db_session.query(ActivityInstanceMode).filter(
        ActivityInstanceMode.activity_instance_id == instance_id,
    ).delete()

    valid_modes, invalid_ids = load_valid_modes_for_root(db_session, root_id, mode_ids)
    attach_instance_modes(db_session, instance_id, valid_modes)
    return valid_modes, invalid_ids


def attach_template_modes(db_session, root_id: str, instance_id: str, raw_item) -> list[ActivityMode]:
    if not isinstance(raw_item, dict):
        return []

    valid_modes, _ = load_valid_modes_for_root(db_session, root_id, raw_item.get('mode_ids'))
    attach_instance_modes(db_session, instance_id, valid_modes)
    return valid_modes
