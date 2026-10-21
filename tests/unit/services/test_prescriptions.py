from datetime import datetime, timezone
import json
import uuid

import pytest

from models import ActivityDefinition, ActivityInstance, FractalMetricDefinition, MetricDefinition, SessionTemplate
from services.prescriptions import check_section_prescriptions
from services.session_service import SessionService
from services.template_service import TemplateService


def _metrics(activity):
    by_name = {metric.name: metric for metric in activity.metric_definitions}
    return by_name['Weight'], by_name['Reps']


def _sections(activity, prescription, *, item_key='bench-key'):
    return [{
        'name': 'Main',
        'items': [{
            'type': 'activity',
            'activity_definition_id': activity.id,
            'name': activity.name,
            'item_key': item_key,
            'prescription': prescription,
        }],
    }]


def _set_plan(weight, reps, *values):
    return {'schema': 1, 'sets': [
        {'metrics': [
            {'metric_id': weight.id, 'split_id': None, 'value': load},
            {'metric_id': reps.id, 'split_id': None, 'value': count},
        ], 'notes': None}
        for load, count in values
    ]}


def test_accepts_metrics_owned_by_the_activity(db_session, sample_ultimate_goal, sample_activity_definition):
    weight, reps = _metrics(sample_activity_definition)

    check_section_prescriptions(
        db_session,
        sample_ultimate_goal.id,
        _sections(sample_activity_definition, _set_plan(weight, reps, (100, 5))),
    )


def test_rejects_metric_from_another_activity(db_session, sample_ultimate_goal, sample_activity_definition):
    other = ActivityDefinition(id=str(uuid.uuid4()), root_id=sample_ultimate_goal.id, name='Row', has_sets=True)
    foreign = MetricDefinition(id=str(uuid.uuid4()), activity_id=other.id, root_id=sample_ultimate_goal.id,
                               name='Weight', unit='kg')
    db_session.add_all([other, foreign])
    db_session.commit()
    plan = {'schema': 1, 'sets': [{'metrics': [{'metric_id': foreign.id, 'split_id': None, 'value': 1}]}]}

    with pytest.raises(ValueError, match='does not belong'):
        check_section_prescriptions(db_session, sample_ultimate_goal.id, _sections(sample_activity_definition, plan))


def test_rejects_activity_from_another_fractal(db_session, sample_ultimate_goal, sample_activity_definition):
    weight, reps = _metrics(sample_activity_definition)

    with pytest.raises(ValueError, match='activity not found'):
        check_section_prescriptions(
            db_session,
            str(uuid.uuid4()),
            _sections(sample_activity_definition, _set_plan(weight, reps, (100, 5))),
        )


def test_rejects_flat_values_for_set_activity(db_session, sample_ultimate_goal, sample_activity_definition):
    weight, _ = _metrics(sample_activity_definition)
    plan = {'schema': 1, 'metrics': [{'metric_id': weight.id, 'split_id': None, 'value': 1}]}

    with pytest.raises(ValueError, match='planned per set'):
        check_section_prescriptions(db_session, sample_ultimate_goal.id, _sections(sample_activity_definition, plan))


def test_enforces_fractal_metric_bounds_and_integer_input(db_session, sample_ultimate_goal, sample_activity_definition):
    weight, reps = _metrics(sample_activity_definition)
    fractal_reps = FractalMetricDefinition(
        id=str(uuid.uuid4()), root_id=sample_ultimate_goal.id, name='Reps', unit='reps',
        input_type='integer', min_value=1, max_value=30,
    )
    db_session.add(fractal_reps)
    reps.fractal_metric_id = fractal_reps.id
    db_session.commit()

    for count in (1, 30):
        check_section_prescriptions(
            db_session, sample_ultimate_goal.id, _sections(sample_activity_definition, _set_plan(weight, reps, (100, count))),
        )
    for count, message in ((0, 'at least 1'), (31, 'at most 30'), (5.5, 'whole number')):
        with pytest.raises(ValueError, match=message):
            check_section_prescriptions(
                db_session, sample_ultimate_goal.id,
                _sections(sample_activity_definition, _set_plan(weight, reps, (100, count))),
            )


def test_template_revision_bumps_only_when_content_changes(
    db_session, sample_ultimate_goal, sample_activity_definition, test_user,
):
    weight, reps = _metrics(sample_activity_definition)
    service = TemplateService(db_session)
    template_data = {'session_type': 'normal', 'sections': _sections(sample_activity_definition, _set_plan(weight, reps, (100, 5)))}
    template, error, _ = service.create_template(
        sample_ultimate_goal.id, test_user.id, {'name': 'Bench day', 'template_data': template_data},
    )
    assert error is None
    stored = json.loads(template.template_data)
    assert template.revision == 1

    unchanged, error, _ = service.update_template(
        sample_ultimate_goal.id, template.id, test_user.id, {'template_data': stored},
    )
    assert error is None and unchanged.revision == 1

    stored['sections'][0]['items'][0]['prescription'] = _set_plan(weight, reps, (105, 5))
    changed, error, _ = service.update_template(
        sample_ultimate_goal.id, template.id, test_user.id, {'template_data': stored},
    )
    assert error is None and changed.revision == 2


def test_template_update_rejects_semantically_invalid_prescription(
    db_session, sample_ultimate_goal, sample_activity_definition, test_user,
):
    template = SessionTemplate(id=str(uuid.uuid4()), name='T', root_id=sample_ultimate_goal.id,
                               template_data=json.dumps({'session_type': 'normal', 'sections': [{'name': 'Main', 'items': []}]}))
    db_session.add(template)
    db_session.commit()
    plan = {'schema': 1, 'sets': [{'metrics': [{'metric_id': 'missing', 'split_id': None, 'value': 1}]}]}

    _, error, status = TemplateService(db_session).update_template(
        sample_ultimate_goal.id, template.id, test_user.id,
        {'template_data': {'session_type': 'normal', 'sections': _sections(sample_activity_definition, plan)}},
    )

    assert status == 400
    assert 'does not belong' in error
    db_session.refresh(template)
    assert template.revision == 1


def test_session_from_template_snapshots_prescription_and_planned_empty_sets(
    db_session, sample_goal_hierarchy, sample_activity_definition, test_user,
):
    root_id = sample_goal_hierarchy['ultimate'].id
    weight, reps = _metrics(sample_activity_definition)
    plan = _set_plan(weight, reps, (100, 5), (105, 3))
    plan['notes'] = 'Pause at chest'
    template = SessionTemplate(
        id=str(uuid.uuid4()), name='Bench day', root_id=root_id,
        template_data=json.dumps({'session_type': 'normal', 'sections': _sections(sample_activity_definition, plan)}),
    )
    db_session.add(template)
    db_session.commit()

    created, error, status = SessionService(db_session).create_session(
        root_id, test_user.id, {'name': 'Bench', 'template_id': template.id},
    )
    assert error is None, error
    assert status == 201

    instance = db_session.query(ActivityInstance).filter_by(session_id=created['id']).one()
    assert instance.prescription == plan
    assert [(row.sort_order, row.status, row.metric_values) for row in instance.sets] == [
        (0, 'planned', []),
        (1, 'planned', []),
    ]
    assert instance.metric_values == []

    # The snapshot is detached: later template edits never rewrite it.
    stored = json.loads(template.template_data)
    stored['sections'][0]['items'][0]['prescription'] = _set_plan(weight, reps, (200, 1))
    template.template_data = json.dumps(stored)
    db_session.commit()
    db_session.refresh(instance)
    assert instance.prescription == plan


def test_client_sent_prescriptions_are_ignored(db_session, sample_goal_hierarchy, sample_activity_definition, test_user):
    root_id = sample_goal_hierarchy['ultimate'].id
    weight, reps = _metrics(sample_activity_definition)
    template = SessionTemplate(
        id=str(uuid.uuid4()), name='Bench day', root_id=root_id,
        template_data=json.dumps({'session_type': 'normal', 'sections': _sections(sample_activity_definition, None)}),
    )
    db_session.add(template)
    db_session.commit()
    forged_sections = _sections(sample_activity_definition, _set_plan(weight, reps, (999, 1)))

    created, error, _ = SessionService(db_session).create_session(
        root_id, test_user.id,
        {'name': 'Bench', 'template_id': template.id, 'session_data': {'sections': forged_sections}},
    )
    assert error is None, error

    instance = db_session.query(ActivityInstance).filter_by(session_id=created['id']).one()
    assert instance.prescription is None
    assert instance.sets == []


def _tag(db_session, root_id, name, **fields):
    from models import ActivityTagDefinition

    definition = ActivityTagDefinition(root_id=root_id, name=name, **fields)
    db_session.add(definition)
    db_session.commit()
    return definition


def test_session_from_template_applies_planned_activity_and_set_tags(
    db_session, sample_goal_hierarchy, sample_activity_definition, test_user,
):
    root_id = sample_goal_hierarchy['ultimate'].id
    weight, reps = _metrics(sample_activity_definition)
    paused = _tag(db_session, root_id, 'Paused')
    top = _tag(db_session, root_id, 'Top set')
    plan = _set_plan(weight, reps, (100, 5), (105, 3))
    plan['tags'] = [paused.id]
    plan['sets'][1]['tags'] = [top.id]
    template = SessionTemplate(
        id=str(uuid.uuid4()), name='Bench day', root_id=root_id,
        template_data=json.dumps({'session_type': 'normal', 'sections': _sections(sample_activity_definition, plan)}),
    )
    db_session.add(template)
    db_session.commit()

    created, error, _ = SessionService(db_session).create_session(root_id, test_user.id, {'name': 'Bench', 'template_id': template.id})
    assert error is None, error

    instance = db_session.query(ActivityInstance).filter_by(session_id=created['id']).one()
    assert [tag.id for tag in instance.tags] == [paused.id]
    assert [[tag.id for tag in activity_set.tags] for activity_set in instance.sets] == [[], [top.id]]


def test_planned_tags_may_be_any_active_fractal_tag(db_session, sample_ultimate_goal, sample_activity_definition, test_user):
    from models import Goal

    weight, reps = _metrics(sample_activity_definition)
    shared = _tag(db_session, sample_ultimate_goal.id, 'Used elsewhere')
    plan = _set_plan(weight, reps, (100, 5))
    plan['sets'][0]['tags'] = [shared.id]
    check_section_prescriptions(db_session, sample_ultimate_goal.id, _sections(sample_activity_definition, plan))

    archived = _tag(db_session, sample_ultimate_goal.id, 'Archived', deleted_at=datetime.now(timezone.utc))
    other_root = Goal(id=str(uuid.uuid4()), name='Other', owner_id=test_user.id, level_id=sample_ultimate_goal.level_id)
    other_root.root_id = other_root.id
    db_session.add(other_root)
    db_session.commit()
    foreign = _tag(db_session, other_root.id, 'Foreign')
    for tag in (archived, foreign):
        plan['sets'][0]['tags'] = [tag.id]
        with pytest.raises(ValueError, match='tags are unavailable'):
            check_section_prescriptions(db_session, sample_ultimate_goal.id, _sections(sample_activity_definition, plan))


def test_merge_and_delete_rewrite_planned_tags_in_stored_plans(db_session, sample_ultimate_goal, sample_activity_definition):
    from services.tag_reference_rewrites import rewrite_planned_tags

    weight, reps = _metrics(sample_activity_definition)
    keep, merged, deleted = (_tag(db_session, sample_ultimate_goal.id, name) for name in ('Keep', 'Merged', 'Deleted'))
    plan = _set_plan(weight, reps, (100, 5))
    plan['tags'] = [merged.id, keep.id, deleted.id]
    plan['sets'][0]['tags'] = [deleted.id]
    # Templates store their document as a JSON string; the rewrite keeps that form.
    template = SessionTemplate(
        id=str(uuid.uuid4()), name='Bench day', root_id=sample_ultimate_goal.id,
        template_data=json.dumps({'sections': _sections(sample_activity_definition, plan)}),
    )
    db_session.add(template)
    db_session.commit()

    changed = rewrite_planned_tags(db_session, sample_ultimate_goal.id, {merged.id: keep.id, deleted.id: None})
    db_session.commit()

    assert changed == 1
    stored = json.loads(db_session.get(SessionTemplate, template.id).template_data)
    prescription = stored['sections'][0]['items'][0]['prescription']
    assert prescription['tags'] == [keep.id]
    assert 'tags' not in prescription['sets'][0]
