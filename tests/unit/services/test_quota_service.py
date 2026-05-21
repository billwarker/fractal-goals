import uuid
from datetime import datetime, timezone

from models import ActivityDefinition, ActivityInstance, FractalMetricDefinition, Goal, Note, Session, SessionTemplate
from services.quota_service import FREE_LIMITS, QuotaService


def test_free_quota_usage_counts_owned_root_entities(db_session, test_user, sample_ultimate_goal):
    session = Session(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Practice",
        created_at=datetime.now(timezone.utc),
    )
    activity = ActivityDefinition(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Practice activity",
    )
    instance = ActivityInstance(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        session_id=session.id,
        activity_definition_id=activity.id,
    )
    metric = FractalMetricDefinition(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Reps",
        unit="count",
    )
    template = SessionTemplate(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Template",
        template_data={},
    )
    note = Note(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        context_type="root",
        context_id=sample_ultimate_goal.id,
        content="Remember this",
    )
    db_session.add_all([session, activity, instance, metric, template, note])
    db_session.commit()

    usage = QuotaService(db_session).get_usage(test_user.id)

    assert usage["fractals"] == 1
    assert usage["sessions"] == 1
    assert usage["activities"] == 1
    assert usage["activity_instances"] == 1
    assert usage["metrics"] == 1
    assert usage["session_templates"] == 1
    assert usage["notes"] == 1


def test_account_usage_can_scope_counts_to_selected_fractals(db_session, test_user, sample_ultimate_goal):
    other_root = Goal(
        id=str(uuid.uuid4()),
        name="Other fractal",
        owner_id=test_user.id,
        root_id=None,
        created_at=datetime.now(timezone.utc),
    )
    other_root.root_id = other_root.id
    db_session.add(other_root)
    db_session.commit()

    first_child = Goal(
        id=str(uuid.uuid4()),
        name="First child",
        parent_id=sample_ultimate_goal.id,
        root_id=sample_ultimate_goal.id,
        created_at=datetime.now(timezone.utc),
    )
    second_child = Goal(
        id=str(uuid.uuid4()),
        name="Second child",
        parent_id=other_root.id,
        root_id=other_root.id,
        created_at=datetime.now(timezone.utc),
    )
    first_session = Session(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="First session",
        created_at=datetime.now(timezone.utc),
    )
    second_session = Session(
        id=str(uuid.uuid4()),
        root_id=other_root.id,
        name="Second session",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add_all([first_child, second_child, first_session, second_session])
    db_session.commit()

    account_usage, usage_error, usage_status = QuotaService(db_session).get_account_usage(
        test_user.id,
        root_ids=[sample_ultimate_goal.id],
    )

    assert usage_error is None
    assert usage_status == 200
    assert account_usage["scope"] == "fractals"
    assert account_usage["root_ids"] == [sample_ultimate_goal.id]
    assert account_usage["usage"]["fractals"] == 1
    assert account_usage["usage"]["goals"] == 2
    assert account_usage["usage"]["sessions"] == 1


def test_account_usage_rejects_unowned_fractal_scope(db_session, test_user):
    payload, error, status = QuotaService(db_session).get_account_usage(
        test_user.id,
        root_ids=[str(uuid.uuid4())],
    )

    assert payload is None
    assert error == "Fractal not found"
    assert status == 404


def test_free_quota_rejects_when_limit_reached(db_session, test_user, sample_ultimate_goal):
    test_user.quota_overrides = {"notes": 1}
    note = Note(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        context_type="root",
        context_id=sample_ultimate_goal.id,
        content="Existing note",
    )
    db_session.add(note)
    db_session.commit()

    payload, error, status = QuotaService(db_session).check_available(test_user.id, "notes")

    assert payload is None
    assert status == 403
    assert error["resource"] == "notes"
    assert error["limit"] == 1


def test_legacy_quota_is_unlimited(db_session, test_user):
    test_user.membership_tier = "legacy"
    test_user.quota_overrides = {"fractals": 0}
    db_session.commit()

    payload, error, status = QuotaService(db_session).check_available(test_user.id, "fractals")
    account_usage, usage_error, usage_status = QuotaService(db_session).get_account_usage(test_user.id)

    assert error is None
    assert status == 200
    assert payload["unlimited"] is True
    assert usage_error is None
    assert usage_status == 200
    assert account_usage["unlimited"] is True
    assert account_usage["limits"] is None


def test_free_limits_include_new_quota_resources():
    assert FREE_LIMITS["metrics"] == 20
    assert FREE_LIMITS["session_templates"] == 10
    assert FREE_LIMITS["activity_instances"] == 500
