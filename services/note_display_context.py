"""Batch program display context onto serialized notes without changing canonical note ownership."""
from sqlalchemy.orm import joinedload

from models import ActivityInstance, Goal, MetricValue, Program
from services._serialize_activities import serialize_metric_value


def attach_program_names(db_session, notes_payload):
    """Program and program-date notes get `program_name`."""
    notes = notes_payload if isinstance(notes_payload, list) else [notes_payload]
    program_ids = {
        note.get('program_id') or note.get('context_id')
        for note in notes
        if note.get('context_type') in ('program', 'program_date')
    } - {None}
    if not program_ids:
        return notes_payload

    names = dict(db_session.query(Program.id, Program.name).filter(Program.id.in_(program_ids)).all())
    for note in notes:
        if note.get('context_type') in ('program', 'program_date'):
            note['program_name'] = names.get(note.get('program_id') or note.get('context_id'))
    return notes_payload


GOAL_PATH_DEPTH = 2


def _metrics(values):
    return [serialize_metric_value(metric) for metric in values or []]


def attach_instance_context(db_session, notes):
    """Feed context in a fixed number of queries per page:
    - activity notes: `instance_completed`, the noted set's `set_metrics`, and when the instance has
      recorded values, `instance_sets` (each set's metrics) or `instance_metrics` (set-free activities)
      plus `instance_plan_note`, so cards show the activity without a request per note;
    - goal notes: `goal_path`, the names of up to two ancestors, nearest last."""
    instance_ids = {note['activity_instance_id'] for note in notes if note.get('activity_instance_id')}
    if instance_ids:
        instances = {
            row.id: row for row in db_session.query(
                ActivityInstance.id, ActivityInstance.completed, ActivityInstance.prescription,
            ).filter(ActivityInstance.id.in_(instance_ids))
        }
        values = db_session.query(MetricValue).options(
            joinedload(MetricValue.definition), joinedload(MetricValue.split), joinedload(MetricValue.activity_set),
        ).filter(MetricValue.activity_instance_id.in_(instance_ids)).all()
        sets_by_instance: dict[str, dict[str, list]] = {}
        loose_by_instance: dict[str, list] = {}
        set_order: dict[str, int] = {}
        for value in values:
            if value.activity_set_id:
                sets_by_instance.setdefault(value.activity_instance_id, {}).setdefault(value.activity_set_id, []).append(value)
                set_order[value.activity_set_id] = value.activity_set.sort_order if value.activity_set else 0
            else:
                loose_by_instance.setdefault(value.activity_instance_id, []).append(value)
        for note in notes:
            instance_id = note.get('activity_instance_id')
            instance = instances.get(instance_id)
            if instance is None:
                continue
            note['instance_completed'] = bool(instance.completed)
            sets = sets_by_instance.get(instance_id, {})
            if note.get('activity_set_id') in sets:
                note['set_metrics'] = _metrics(sets[note['activity_set_id']])
            if sets:
                note['instance_sets'] = [
                    {'id': set_id, 'metrics': _metrics(sets[set_id])}
                    for set_id in sorted(sets, key=lambda set_id: (set_order.get(set_id, 0), set_id))
                ]
            elif loose_by_instance.get(instance_id):
                note['instance_metrics'] = _metrics(loose_by_instance[instance_id])
            plan = instance.prescription if isinstance(instance.prescription, dict) else {}
            if plan.get('notes') and (sets or loose_by_instance.get(instance_id)):
                note['instance_plan_note'] = plan['notes']

    goal_notes = [note for note in notes if note.get('context_type') == 'goal' and note.get('goal_id')]
    if goal_notes:
        parents: dict[str, str | None] = {}
        names: dict[str, str] = {}
        frontier = {note['goal_id'] for note in goal_notes}
        for _ in range(GOAL_PATH_DEPTH + 1):
            frontier -= set(parents)
            if not frontier:
                break
            for goal_id, parent_id, name in db_session.query(Goal.id, Goal.parent_id, Goal.name).filter(
                Goal.id.in_(frontier),
            ):
                parents[goal_id], names[goal_id] = parent_id, name
            frontier = {parent for parent in parents.values() if parent}
        for note in goal_notes:
            path, current = [], parents.get(note['goal_id'])
            while current and current in names and len(path) < GOAL_PATH_DEPTH:
                path.insert(0, names[current])
                current = parents.get(current)
            note['goal_path'] = path
    return notes
