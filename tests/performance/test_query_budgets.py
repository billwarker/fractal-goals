import pytest
import time
import json
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from config import config
from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    AnalyticsDashboard,
    Goal,
    GoalLevel,
    Note,
    PracticeSession,
    Program,
    ProgramBlock,
    ProgramDay,
    User,
    activity_goal_associations,
)


def assert_response_budget(response, *, max_bytes: int, max_ms: float, elapsed_ms: float):
    assert response.status_code == 200
    assert len(response.data) <= max_bytes
    assert elapsed_ms <= max_ms


def timed_get(client, url):
    started_at = time.perf_counter()
    response = client.get(url)
    elapsed_ms = (time.perf_counter() - started_at) * 1000
    return response, elapsed_ms


@pytest.fixture
def sample_program_tree(db_session, sample_ultimate_goal, sample_session_template):
    program = Program(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Performance Program",
        description="Program performance fixture",
        start_date=datetime.now(timezone.utc),
        end_date=datetime.now(timezone.utc) + timedelta(days=14),
        weekly_schedule=[],
    )
    db_session.add(program)
    db_session.flush()

    block = ProgramBlock(
        id=str(uuid.uuid4()),
        program_id=program.id,
        name="Block 1",
        start_date=datetime.now(timezone.utc).date(),
        end_date=(datetime.now(timezone.utc) + timedelta(days=6)).date(),
    )
    db_session.add(block)
    db_session.flush()

    for index in range(5):
        day = ProgramDay(
            id=str(uuid.uuid4()),
            block_id=block.id,
            day_number=index + 1,
            name=f"Day {index + 1}",
            date=(datetime.now(timezone.utc) + timedelta(days=index)).date(),
            day_of_week=[],
        )
        day.templates.append(sample_session_template)
        db_session.add(day)

    db_session.commit()
    return program


@pytest.fixture
def large_account_dataset(db_session, test_user):
    levels = []
    for rank, name in enumerate([
        "Ultimate Goal",
        "Long Term Goal",
        "Mid Term Goal",
        "Short Term Goal",
        "Immediate Goal",
    ]):
        level = GoalLevel(
            id=str(uuid.uuid4()),
            name=name,
            rank=rank,
            owner_id=test_user.id,
        )
        db_session.add(level)
        levels.append(level)
    db_session.flush()

    root = Goal(
        id=str(uuid.uuid4()),
        name="Large Account Root",
        description="Large performance fixture",
        owner_id=test_user.id,
        level_id=levels[0].id,
        created_at=datetime.now(timezone.utc),
    )
    root.root_id = root.id
    db_session.add(root)
    db_session.flush()

    goals = []
    parents_by_rank = {1: [root]}
    for index in range(80):
        rank = min(4, 1 + (index % 4))
        parent_candidates = parents_by_rank.get(rank, [root])
        parent = parent_candidates[index % len(parent_candidates)]
        goal = Goal(
            id=str(uuid.uuid4()),
            name=f"Large Goal {index}",
            description="fixture goal",
            parent_id=parent.id,
            root_id=root.id,
            owner_id=test_user.id if rank == 0 else None,
            level_id=levels[rank].id,
            created_at=datetime.now(timezone.utc) - timedelta(days=index),
        )
        db_session.add(goal)
        goals.append(goal)
        parents_by_rank.setdefault(rank + 1, []).append(goal)

    group = ActivityGroup(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name="Large Activity Group",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(group)
    db_session.flush()

    activities = []
    for index in range(12):
        activity = ActivityDefinition(
            id=str(uuid.uuid4()),
            root_id=root.id,
            group_id=group.id,
            name=f"Large Activity {index}",
            has_sets=False,
            has_metrics=False,
            has_splits=False,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(activity)
        activities.append(activity)

    sessions = []
    notes = []
    for index in range(120):
        session = PracticeSession(
            id=str(uuid.uuid4()),
            root_id=root.id,
            name=f"Large Session {index}",
            description="fixture session",
            session_start=datetime.now(timezone.utc) - timedelta(days=index),
            session_end=datetime.now(timezone.utc) - timedelta(days=index, hours=-1),
            total_duration_seconds=1800 + index,
            completed=index % 3 != 0,
            completed_at=datetime.now(timezone.utc) - timedelta(days=index) if index % 3 != 0 else None,
            created_at=datetime.now(timezone.utc) - timedelta(days=index),
            attributes=json.dumps({
                "session_data": {
                    "sections": [
                        {"name": "Main", "activity_ids": []},
                    ],
                },
            }),
        )
        db_session.add(session)
        sessions.append(session)

    db_session.flush()

    for index, session in enumerate(sessions):
        instance = ActivityInstance(
            id=str(uuid.uuid4()),
            root_id=root.id,
            session_id=session.id,
            activity_definition_id=activities[index % len(activities)].id,
            duration_seconds=900 + index,
            created_at=session.created_at,
            data=json.dumps({"sets": []}),
        )
        note = Note(
            id=str(uuid.uuid4()),
            root_id=root.id,
            context_type="session",
            context_id=session.id,
            session_id=session.id,
            content=f"Large account note {index}",
            created_at=session.created_at,
        )
        db_session.add(instance)
        db_session.add(note)
        notes.append(note)

    for index in range(5):
        db_session.add(AnalyticsDashboard(
            id=str(uuid.uuid4()),
            root_id=root.id,
            user_id=test_user.id,
            name=f"Large Dashboard {index}",
            layout={"windows": [], "version": 1},
            created_at=datetime.now(timezone.utc),
        ))

    db_session.commit()
    return {"root": root, "goals": goals, "sessions": sessions, "notes": notes}


def auth_headers_for(user):
    token = jwt.encode({
        'user_id': user.id,
        'exp': datetime.now(timezone.utc) + timedelta(hours=24),
    }, config.JWT_SECRET_KEY, algorithm="HS256")
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


@pytest.mark.integration
def test_get_session_activities_query_budget(authed_client, query_counter, sample_practice_session, sample_activity_instance):
    """
    Guard against accidental N+1 regressions in session activities endpoint.
    Budget is intentionally loose to avoid flakes while still catching blowups.
    """
    root_id = sample_practice_session.root_id
    session_id = sample_practice_session.id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/sessions/{session_id}/activities")

    assert_response_budget(response, max_bytes=80_000, max_ms=500, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 15


@pytest.mark.integration
def test_get_session_details_query_budget(authed_client, query_counter, sample_practice_session, sample_activity_instance):
    """Session detail should stay within a bounded eager-loading query budget."""
    root_id = sample_practice_session.root_id
    session_id = sample_practice_session.id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/sessions/{session_id}")

    assert_response_budget(response, max_bytes=160_000, max_ms=700, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 20


@pytest.mark.integration
def test_get_goal_tree_query_budget(authed_client, query_counter, sample_goal_hierarchy):
    """Goal tree fetches should remain bounded as hierarchy depth grows."""
    root_id = sample_goal_hierarchy["ultimate"].id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/goals")

    assert_response_budget(response, max_bytes=180_000, max_ms=700, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 24


@pytest.mark.integration
def test_get_root_goal_header_query_budget(authed_client, query_counter, sample_goal_hierarchy):
    """Header root-goal lookup should not serialize the whole tree."""
    root_id = sample_goal_hierarchy["ultimate"].id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/goals/{root_id}?include_children=false")

    assert_response_budget(response, max_bytes=30_000, max_ms=400, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 10


@pytest.mark.integration
def test_get_activities_query_budget(authed_client, query_counter, sample_activity_definition):
    """Activity definition serialization should batch metrics, splits, and goal associations."""
    root_id = sample_activity_definition.root_id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/activities")

    assert_response_budget(response, max_bytes=120_000, max_ms=500, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 8


@pytest.mark.integration
def test_get_activity_groups_query_budget(authed_client, query_counter, sample_activity_group):
    root_id = sample_activity_group.root_id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/activity-groups")

    assert_response_budget(response, max_bytes=80_000, max_ms=400, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 6


@pytest.mark.integration
def test_get_programs_query_budget(authed_client, query_counter, sample_program_tree):
    root_id = sample_program_tree.root_id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/programs")

    assert_response_budget(response, max_bytes=200_000, max_ms=700, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 22


@pytest.mark.integration
def test_get_fractals_query_budget(authed_client, query_counter, sample_goal_hierarchy):
    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, "/api/fractals")

    assert_response_budget(response, max_bytes=80_000, max_ms=500, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 12


@pytest.mark.integration
def test_get_session_goals_view_query_budget(
    authed_client,
    query_counter,
    sample_practice_session,
    sample_activity_instance,
):
    """Session goals view should stay under a bounded query budget."""
    root_id = sample_practice_session.root_id
    session_id = sample_practice_session.id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/fractal/{root_id}/sessions/{session_id}/goals-view")

    assert_response_budget(response, max_bytes=220_000, max_ms=900, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 36


@pytest.mark.integration
def test_get_session_detail_goal_activities_query_budget(
    authed_client,
    db_session,
    query_counter,
    sample_goal_hierarchy,
    sample_activity_definition,
):
    """Goal activity references should stay bounded across child inheritance."""
    root_id = sample_goal_hierarchy["ultimate"].id
    parent_goal = sample_goal_hierarchy["mid_term"]
    child_goal = sample_goal_hierarchy["short_term"]
    db_session.execute(
        activity_goal_associations.insert().values(
            activity_id=sample_activity_definition.id,
            goal_id=child_goal.id,
        )
    )
    db_session.commit()

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/goals/{parent_goal.id}/activities")

    assert_response_budget(response, max_bytes=80_000, max_ms=500, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 16


@pytest.mark.integration
def test_get_goal_timeline_query_budget(
    authed_client,
    db_session,
    query_counter,
    sample_goal_hierarchy,
    sample_activity_definition,
    sample_activity_instance,
):
    """Goal timeline should remain lazy in the UI and bounded once requested."""
    root_id = sample_goal_hierarchy["ultimate"].id
    parent_goal = sample_goal_hierarchy["mid_term"]
    child_goal = sample_goal_hierarchy["short_term"]
    db_session.execute(
        activity_goal_associations.insert().values(
            activity_id=sample_activity_definition.id,
            goal_id=child_goal.id,
        )
    )
    db_session.commit()

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(
        authed_client,
        f"/api/{root_id}/goals/{parent_goal.id}/timeline?types=activity,target,child_goal",
    )

    assert_response_budget(response, max_bytes=160_000, max_ms=800, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 28


@pytest.mark.integration
def test_get_session_analytics_summary_query_budget(
    authed_client,
    query_counter,
    sample_practice_session,
    sample_activity_instance,
):
    """Analytics summary should stay bounded despite combining session and instance data."""
    root_id = sample_practice_session.root_id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/sessions/analytics-summary?limit=50")

    assert_response_budget(response, max_bytes=200_000, max_ms=700, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 12


@pytest.mark.integration
def test_large_account_goal_tree_budget(authed_client, query_counter, large_account_dataset):
    root_id = large_account_dataset["root"].id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/goals")

    assert_response_budget(response, max_bytes=650_000, max_ms=1_200, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 32


@pytest.mark.integration
def test_large_account_sessions_search_budget(authed_client, query_counter, large_account_dataset):
    root_id = large_account_dataset["root"].id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/sessions?limit=50&sort_by=session_start&sort_order=desc")

    assert_response_budget(response, max_bytes=500_000, max_ms=1_000, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 18


@pytest.mark.integration
def test_large_account_notes_page_budget(authed_client, query_counter, large_account_dataset):
    root_id = large_account_dataset["root"].id

    query_counter["total"] = 0
    response, elapsed_ms = timed_get(authed_client, f"/api/{root_id}/notes?page=0&page_size=50")

    assert_response_budget(response, max_bytes=350_000, max_ms=1_000, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 20


@pytest.mark.integration
def test_large_account_admin_users_budget(client, db_session, test_user, query_counter, large_account_dataset):
    admin = User(
        id=str(uuid.uuid4()),
        username="largeadmin",
        email="largeadmin@example.com",
        role="admin",
    )
    admin.set_password("Password123")
    db_session.add(admin)
    db_session.commit()

    query_counter["total"] = 0
    started_at = time.perf_counter()
    response = client.get('/api/admin/users?limit=50', headers=auth_headers_for(admin))
    elapsed_ms = (time.perf_counter() - started_at) * 1000

    assert_response_budget(response, max_bytes=250_000, max_ms=1_200, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 45
