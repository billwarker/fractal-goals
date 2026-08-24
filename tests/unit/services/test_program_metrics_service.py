from datetime import datetime, timedelta, timezone

from models import ActivityInstance, Program, ProgramBlock, ProgramDay, Session, activity_goal_associations
from models.program import program_goals
from services.program_metrics_service import ProgramMetricsService
from services.program_scope import resolve_program_scope, resolve_program_scopes


def test_canonical_scope_expands_descendants_and_rejects_ancestors(
    db_session, sample_goal_hierarchy
):
    root = sample_goal_hierarchy["ultimate"]
    now = datetime.now(timezone.utc)
    program = Program(
        root_id=root.id,
        name="Scope",
        start_date=now,
        end_date=now + timedelta(days=10),
        weekly_schedule={},
    )
    db_session.add(program)
    db_session.flush()
    db_session.execute(program_goals.insert().values(
        program_id=program.id,
        goal_id=sample_goal_hierarchy["mid_term"].id,
    ))
    db_session.commit()

    scope = resolve_program_scope(db_session, root.id, program.id)
    assert scope.seed_goal_ids == frozenset({sample_goal_hierarchy["mid_term"].id})
    assert scope.goal_ids == frozenset({
        sample_goal_hierarchy["mid_term"].id,
        sample_goal_hierarchy["short_term"].id,
    })
    assert sample_goal_hierarchy["long_term"].id not in scope.goal_ids
    assert resolve_program_scopes(db_session, "wrong-root", [program.id]) == {}


def test_metrics_future_dates_are_upcoming_and_rates_are_nullable(
    db_session, sample_goal_hierarchy, test_user
):
    root = sample_goal_hierarchy["ultimate"]
    today = datetime.now(timezone.utc).date()
    start = today + timedelta(days=5)
    program = Program(
        root_id=root.id,
        name="Future program",
        start_date=datetime.combine(start, datetime.min.time()),
        end_date=datetime.combine(start + timedelta(days=6), datetime.min.time()),
        weekly_schedule={},
    )
    db_session.add(program)
    db_session.flush()
    block = ProgramBlock(
        program_id=program.id,
        name="Week",
        start_date=start,
        end_date=start + timedelta(days=6),
    )
    db_session.add(block)
    db_session.flush()
    db_session.add(ProgramDay(
        block_id=block.id,
        name="Opening day",
        date=start,
        day_number=1,
    ))
    db_session.execute(program_goals.insert().values(
        program_id=program.id,
        goal_id=sample_goal_hierarchy["mid_term"].id,
    ))
    db_session.commit()

    payload, error, status = ProgramMetricsService(db_session).get_program_metrics(
        root.id,
        program.id,
        test_user.id,
        timezone_name="UTC",
        as_of=today,
    )

    assert (error, status) == (None, 200)
    assert payload["program"]["status"] == "upcoming"
    assert payload["window"]["observed_days"] == 0
    assert {day["state"] for day in payload["days"]} == {"upcoming"}
    assert payload["adherence"]["rate"] is None
    assert payload["alignment"]["duration_seconds"]["rate"] is None
    assert payload["semantics"]["data_layer"] == "analytics_engine"


def test_metrics_rejects_oversized_and_partial_ranges(
    db_session, sample_goal_hierarchy, test_user
):
    root = sample_goal_hierarchy["ultimate"]
    program = Program(
        root_id=root.id,
        name="Long program",
        start_date=datetime(2024, 1, 1),
        end_date=datetime(2026, 1, 1),
        weekly_schedule={},
    )
    db_session.add(program)
    db_session.commit()
    service = ProgramMetricsService(db_session)

    _, error, status = service.get_program_metrics(
        root.id, program.id, test_user.id,
        timezone_name="UTC", range_start="2024-01-01",
    )
    assert (error, status) == ("Invalid date range", 400)

    _, error, status = service.get_program_metrics(
        root.id, program.id, test_user.id,
        timezone_name="UTC", range_start="2024-01-01", range_end="2025-01-01",
    )
    assert (error, status) == ("Invalid date range", 400)


def test_metrics_counts_completed_instances_in_unfinished_sessions_and_splits_effort(
    db_session, sample_goal_hierarchy, sample_activity_definition, test_user
):
    root = sample_goal_hierarchy["ultimate"]
    now = datetime.now(timezone.utc)
    program = Program(
        root_id=root.id,
        name="Evidence program",
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=1),
        weekly_schedule={},
    )
    db_session.add(program)
    db_session.flush()
    block = ProgramBlock(
        program_id=program.id,
        name="Block",
        start_date=(now - timedelta(days=1)).date(),
        end_date=(now + timedelta(days=1)).date(),
    )
    db_session.add(block)
    db_session.flush()
    db_session.add(ProgramDay(block_id=block.id, name="Today", date=now.date()))
    db_session.execute(program_goals.insert().values(
        program_id=program.id, goal_id=sample_goal_hierarchy["mid_term"].id,
    ))
    for goal_key in ("mid_term", "short_term"):
        db_session.execute(activity_goal_associations.insert().values(
            activity_id=sample_activity_definition.id,
            goal_id=sample_goal_hierarchy[goal_key].id,
        ))
    unfinished = Session(
        owner_id=test_user.id,
        root_id=root.id,
        name="Still open",
        completed=False,
        session_start=now - timedelta(hours=1),
    )
    db_session.add(unfinished)
    db_session.flush()
    db_session.add(ActivityInstance(
        session_id=unfinished.id,
        root_id=root.id,
        activity_definition_id=sample_activity_definition.id,
        completed=True,
        duration_seconds=1200,
        time_stop=now,
    ))
    db_session.commit()

    payload, error, status = ProgramMetricsService(db_session).get_program_metrics(
        root.id, program.id, test_user.id, timezone_name="UTC", as_of=now.date(),
    )

    assert (error, status) == (None, 200)
    assert payload["adherence"]["met_days"] == 1
    assert payload["alignment"]["instances"] == {"aligned": 1, "total": 1, "rate": 1.0}
    assert payload["execution"]["linked_sessions"] == 0
    assert payload["blocks"][0]["aligned_instances"] == 0
    shares = {row["goal_id"]: row["effort_share"] for row in payload["goal_coverage"]}
    assert shares[sample_goal_hierarchy["mid_term"].id] == 0.5
    assert shares[sample_goal_hierarchy["short_term"].id] == 0.5
    coverage_by_goal = {row["goal_id"]: row for row in payload["goal_coverage"]}
    mid_term_coverage = coverage_by_goal[sample_goal_hierarchy["mid_term"].id]
    assert mid_term_coverage["level_id"] == sample_goal_hierarchy["mid_term"].level_id
    assert mid_term_coverage["level_name"] == mid_term_coverage["level"]
    assert mid_term_coverage["type"] == "MidTermGoal"
    assert isinstance(mid_term_coverage["is_smart"], bool)
