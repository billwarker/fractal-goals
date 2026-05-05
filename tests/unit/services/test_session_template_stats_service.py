import json
from datetime import datetime, timedelta, timezone

from models import ActivityInstance, Session, SessionTemplate
from services.session_template_stats_service import SessionTemplateStatsService


def _session(db_session, *, root_id, template_id, name, duration, completed=True, deleted=False, start=None, attrs=None):
    start = start or datetime.now(timezone.utc)
    session = Session(
        name=name,
        root_id=root_id,
        template_id=template_id,
        session_start=start,
        session_end=start + timedelta(seconds=duration),
        total_duration_seconds=duration,
        completed=completed,
        completed_at=start + timedelta(seconds=duration) if completed else None,
        deleted_at=start if deleted else None,
        attributes=attrs or {},
    )
    db_session.add(session)
    db_session.flush()
    return session


def _instance(db_session, *, root_id, session_id, activity_definition_id, duration, completed=True, deleted=False):
    instance = ActivityInstance(
        session_id=session_id,
        root_id=root_id,
        activity_definition_id=activity_definition_id,
        time_start=datetime.now(timezone.utc),
        time_stop=datetime.now(timezone.utc) + timedelta(seconds=duration),
        duration_seconds=duration,
        completed=completed,
        deleted_at=datetime.now(timezone.utc) if deleted else None,
    )
    db_session.add(instance)
    db_session.flush()
    return instance


def test_recompute_template_stats_ignores_deleted_and_incomplete_sessions(
    db_session,
    sample_ultimate_goal,
    sample_activity_definition,
):
    root_id = sample_ultimate_goal.id
    template = SessionTemplate(
        name="Practice Template",
        root_id=root_id,
        template_data=json.dumps({
            "session_type": "normal",
            "sections": [{"id": "warmup", "name": "Warmup", "activities": []}],
        }),
    )
    db_session.add(template)
    db_session.flush()

    first = _session(
        db_session,
        root_id=root_id,
        template_id=template.id,
        name="First",
        duration=1200,
        attrs={"sections": [{"id": "warmup", "activity_ids": []}]},
    )
    second = _session(
        db_session,
        root_id=root_id,
        template_id=template.id,
        name="Second",
        duration=2400,
        attrs={"sections": [{"id": "warmup", "activity_ids": []}]},
    )
    _session(db_session, root_id=root_id, template_id=template.id, name="Draft", duration=9999, completed=False)
    _session(db_session, root_id=root_id, template_id=template.id, name="Deleted", duration=9999, deleted=True)

    first_instance = _instance(
        db_session,
        root_id=root_id,
        session_id=first.id,
        activity_definition_id=sample_activity_definition.id,
        duration=300,
    )
    second_instance = _instance(
        db_session,
        root_id=root_id,
        session_id=second.id,
        activity_definition_id=sample_activity_definition.id,
        duration=900,
    )
    first.attributes = {"sections": [{"id": "warmup", "activity_ids": [first_instance.id]}]}
    second.attributes = {"sections": [{"template_section_id": "warmup", "activity_ids": [second_instance.id]}]}
    db_session.commit()

    stats = SessionTemplateStatsService(db_session).recompute_template_stats(root_id, template.id)
    db_session.commit()

    assert stats["usage_count"] == 3
    assert stats["session_count"] == 2
    assert stats["average_duration_seconds"] == 1800
    assert stats["median_duration_seconds"] == 1800
    assert stats["section_stats"]["warmup"]["sample_count"] == 2
    assert stats["section_stats"]["warmup"]["average_duration_seconds"] == 600

    persisted = SessionTemplateStatsService(db_session).persisted_stats_for_templates(root_id, [template.id])
    assert persisted[template.id]["average_duration_seconds"] == 1800


def test_recompute_activity_stats_uses_completed_non_deleted_instances(
    db_session,
    sample_ultimate_goal,
    sample_activity_definition,
    sample_session_template,
):
    root_id = sample_ultimate_goal.id
    session = _session(
        db_session,
        root_id=root_id,
        template_id=sample_session_template.id,
        name="Practice",
        duration=1800,
    )
    _instance(
        db_session,
        root_id=root_id,
        session_id=session.id,
        activity_definition_id=sample_activity_definition.id,
        duration=60,
    )
    _instance(
        db_session,
        root_id=root_id,
        session_id=session.id,
        activity_definition_id=sample_activity_definition.id,
        duration=180,
    )
    _instance(
        db_session,
        root_id=root_id,
        session_id=session.id,
        activity_definition_id=sample_activity_definition.id,
        duration=999,
        completed=False,
    )
    _instance(
        db_session,
        root_id=root_id,
        session_id=session.id,
        activity_definition_id=sample_activity_definition.id,
        duration=999,
        deleted=True,
    )
    db_session.commit()

    stats = SessionTemplateStatsService(db_session).recompute_activity_stats(
        root_id,
        [sample_activity_definition.id],
    )
    db_session.commit()

    activity_stats = stats[sample_activity_definition.id]
    assert activity_stats["sample_count"] == 2
    assert activity_stats["average_duration_seconds"] == 120
    assert activity_stats["median_duration_seconds"] == 120

    persisted = SessionTemplateStatsService(db_session).persisted_activity_duration_stats(
        root_id,
        [sample_activity_definition.id],
    )
    assert persisted[sample_activity_definition.id]["average_duration_seconds"] == 120
