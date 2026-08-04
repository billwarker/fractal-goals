import importlib
import uuid
import json
from datetime import datetime, timezone

from sqlalchemy import event, text

from models import (
    ActivityDefinition,
    ActivityInstance,
    AppSetting,
    CircuitDefinition,
    CircuitSlot,
    FractalMetricDefinition,
    Goal,
    Note,
    Session,
    SessionTemplate,
)
from services.quota_service import (
    FREE_LIMITS,
    TIER_DEFAULT_LIMITS_SETTING_KEY,
    QuotaService,
)


compact_jsonb_migration = importlib.import_module(
    "migrations.versions.e8a1c4f7b2d9_add_compact_jsonb_octet_length"
)


def test_free_quota_usage_counts_owned_root_entities(db_session, test_user, sample_ultimate_goal):
    session = Session(
        id=str(uuid.uuid4()),
        owner_id=test_user.id,
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
        owner_id=test_user.id,
        root_id=sample_ultimate_goal.id,
        name="First session",
        created_at=datetime.now(timezone.utc),
    )
    second_session = Session(
        id=str(uuid.uuid4()),
        owner_id=test_user.id,
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
    assert FREE_LIMITS["circuits"] == 10


def test_configured_tier_defaults_drive_effective_limits(db_session, test_user):
    configured_free = dict(FREE_LIMITS)
    configured_free["goals"] = 123
    db_session.add(AppSetting(
        key=TIER_DEFAULT_LIMITS_SETTING_KEY,
        value={"free": configured_free},
    ))
    db_session.commit()

    limits = QuotaService(db_session).get_effective_limits(test_user)

    assert limits["goals"] == 123


def test_configured_tier_storage_defaults_are_available(db_session):
    db_session.add(AppSetting(
        key=TIER_DEFAULT_LIMITS_SETTING_KEY,
        value={"storage_limit_bytes": {"free": 123456789}},
    ))
    db_session.commit()

    storage_limits = QuotaService(db_session).get_tier_storage_limits()

    assert storage_limits["free"] == 123456789
    assert storage_limits["paid"] == 104857600


def test_older_tier_defaults_inherit_new_circuit_limit_without_losing_custom_values(db_session, test_user):
    configured_free = dict(FREE_LIMITS)
    configured_free.pop("circuits")
    configured_free["goals"] = 123
    db_session.add(AppSetting(
        key=TIER_DEFAULT_LIMITS_SETTING_KEY,
        value={"free": configured_free},
    ))
    db_session.commit()

    limits = QuotaService(db_session).get_effective_limits(test_user)

    assert limits["goals"] == 123
    assert limits["circuits"] == FREE_LIMITS["circuits"]


def test_invalid_configured_tier_defaults_fall_back_to_builtins(db_session, test_user):
    invalid_free = dict(FREE_LIMITS)
    invalid_free.pop("goals")
    db_session.add(AppSetting(
        key=TIER_DEFAULT_LIMITS_SETTING_KEY,
        value={"free": invalid_free},
    ))
    db_session.commit()

    limits = QuotaService(db_session).get_effective_limits(test_user)

    assert limits["goals"] == FREE_LIMITS["goals"]


def test_compact_jsonb_byte_function_matches_representative_python_estimates(db_session):
    payloads = [
        {},
        [],
        {"nested": [1, True, None, "commas, colons: and spaces", {"é": "雪"}]},
        ["line\nbreak", "quote\"slash\\", 1.25],
    ]

    for payload in payloads:
        database_size = db_session.execute(
            text("SELECT compact_jsonb_octet_length(CAST(:payload AS jsonb))"),
            {"payload": json.dumps(payload, ensure_ascii=False)},
        ).scalar_one()
        assert database_size == QuotaService._payload_size(payload)


def test_compact_jsonb_migration_and_fresh_database_ddl_stay_identical():
    from models.base import COMPACT_JSONB_OCTET_LENGTH_SQL

    migration_sql = compact_jsonb_migration.COMPACT_JSONB_OCTET_LENGTH_SQL
    assert migration_sql == COMPACT_JSONB_OCTET_LENGTH_SQL
    assert "SET search_path = pg_catalog, public" in migration_sql


def test_storage_usage_is_exact_and_executes_as_one_scalar_statement(
    db_session,
    test_user,
    sample_ultimate_goal,
):
    sample_ultimate_goal.description = "Unicode snow: 雪"
    sample_ultimate_goal.relevance_statement = "Meaningful"
    sample_ultimate_goal.progress_settings = {"mode": "weighted", "labels": ["é", "steady"]}
    session = Session(
        id=str(uuid.uuid4()),
        owner_id=test_user.id,
        root_id=sample_ultimate_goal.id,
        name="Practice",
        description="Structured work",
        attributes={"session_data": {"sections": [{"name": "Warm-up"}]}},
    )
    activity = ActivityDefinition(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Lift",
        description="Heavy",
    )
    instance = ActivityInstance(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        session_id=session.id,
        activity_definition_id=activity.id,
        notes="Controlled",
        data={"sets": [5, 5, 3]},
    )
    note = Note(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        context_type="root",
        context_id=sample_ultimate_goal.id,
        content="Remember 雪 and preserve every byte",
    )
    circuit = CircuitDefinition(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Main circuit",
        description="Two movements",
    )
    slots = [
        CircuitSlot(
            id=str(uuid.uuid4()),
            definition=circuit,
            activity_definition_id=activity.id,
            sort_order=index,
        )
        for index in range(2)
    ]
    db_session.add_all([session, activity, instance, note, circuit, *slots])
    db_session.commit()

    expected = sum([
        QuotaService._payload_size(
            sample_ultimate_goal.name,
            sample_ultimate_goal.description,
            sample_ultimate_goal.relevance_statement,
            sample_ultimate_goal.targets,
            sample_ultimate_goal.progress_settings,
            sample_ultimate_goal.completion_reason,
        ),
        QuotaService._payload_size(session.name, session.description, session.attributes),
        QuotaService._payload_size(activity.name, activity.description),
        QuotaService._payload_size(instance.notes, instance.data),
        QuotaService._payload_size(note.content),
        QuotaService._payload_size(
            circuit.name,
            circuit.description,
            [{"activity_definition_id": slot.activity_definition_id} for slot in slots],
        ),
    ])

    statements = []
    engine = db_session.get_bind()
    user_id = test_user.id

    def capture_statement(_conn, _cursor, statement, _params, _context, _many):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture_statement)
    try:
        actual = QuotaService(db_session).get_storage_usage_bytes(user_id)
    finally:
        event.remove(engine, "before_cursor_execute", capture_statement)

    assert actual == expected
    assert len(statements) == 1
    assert "compact_jsonb_octet_length" in statements[0]
    assert "notes.content" in statements[0]
    assert "notes_content" not in statements[0]
