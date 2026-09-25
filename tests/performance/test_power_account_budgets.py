"""Query and payload budgets for read paths on a power-user-sized account.

Budgets are constant: they must not grow with the number of goals, sessions,
instances, or metric values, so an N+1 regression fails here first.
"""

import json
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    Goal,
    GoalLevel,
    MetricDefinition,
    MetricValue,
    Note,
    PracticeSession,
    Program,
    ProgramBlock,
    ProgramDay,
    SessionTemplate,
    Target,
    activity_goal_associations,
    program_goals,
    session_goals,
)
from tests.conftest import session_headers_for
from tests.performance.test_query_budgets import assert_response_budget, timed_get

GOAL_COUNT = 150
ACTIVITY_COUNT = 20
SESSION_COUNT = 150
LEVEL_NAMES = ["Ultimate Goal", "Long Term Goal", "Mid Term Goal", "Short Term Goal", "Immediate Goal"]


@pytest.fixture
def power_account_dataset(db_session, test_user):
    now = datetime.now(timezone.utc)
    levels = []
    for rank, name in enumerate(LEVEL_NAMES):
        level = GoalLevel(id=str(uuid.uuid4()), name=name, rank=rank, owner_id=test_user.id)
        db_session.add(level)
        levels.append(level)
    db_session.flush()

    root = Goal(id=str(uuid.uuid4()), name="Power Root", owner_id=test_user.id, level_id=levels[0].id, created_at=now)
    root.root_id = root.id
    db_session.add(root)
    db_session.flush()

    goals, parents_by_rank = [], {1: [root]}
    for index in range(GOAL_COUNT):
        rank = min(4, 1 + (index % 4))
        parents = parents_by_rank.get(rank, [root])
        goal = Goal(
            id=str(uuid.uuid4()),
            name=f"Power Goal {index}",
            parent_id=parents[index % len(parents)].id,
            root_id=root.id,
            level_id=levels[rank].id,
            created_at=now - timedelta(days=index % 120),
        )
        db_session.add(goal)
        goals.append(goal)
        parents_by_rank.setdefault(rank + 1, []).append(goal)
    db_session.flush()
    for goal in goals[::3]:
        db_session.add(Target(id=str(uuid.uuid4()), goal_id=goal.id, root_id=root.id, name=f"Target {goal.name}"))

    group = ActivityGroup(id=str(uuid.uuid4()), root_id=root.id, name="Power Group")
    db_session.add(group)
    db_session.flush()
    activities, metrics_by_activity = [], {}
    for index in range(ACTIVITY_COUNT):
        activity = ActivityDefinition(id=str(uuid.uuid4()), root_id=root.id, name=f"Power Activity {index}", group_id=group.id)
        db_session.add(activity)
        activities.append(activity)
    db_session.flush()
    for index, activity in enumerate(activities):
        metrics_by_activity[activity.id] = []
        for metric_index in range(2):
            metric = MetricDefinition(
                id=str(uuid.uuid4()), activity_id=activity.id, root_id=root.id, name=f"m{metric_index}", unit="u",
            )
            db_session.add(metric)
            metrics_by_activity[activity.id].append(metric)
        for offset in range(3):
            db_session.execute(activity_goal_associations.insert().values(
                activity_id=activity.id, goal_id=goals[(index * 7 + offset) % GOAL_COUNT].id,
            ))
    template = SessionTemplate(
        id=str(uuid.uuid4()), root_id=root.id, name="Power Template",
        template_data=json.dumps({"sections": [{"name": "Main", "activities": []}]}),
    )
    db_session.add(template)
    db_session.flush()

    sessions = []
    for index in range(SESSION_COUNT):
        started = now - timedelta(hours=index * 9)
        session = PracticeSession(
            id=str(uuid.uuid4()), root_id=root.id, owner_id=test_user.id, name=f"Power Session {index}",
            created_at=started, session_start=started, session_end=started + timedelta(hours=1),
            completed=True, completed_at=started + timedelta(hours=1), total_duration_seconds=3600,
            template_id=template.id,
        )
        db_session.add(session)
        sessions.append(session)
    db_session.flush()
    for index, session in enumerate(sessions):
        for offset in range(2):
            db_session.execute(session_goals.insert().values(
                session_id=session.id, goal_id=goals[(index + offset * 13) % GOAL_COUNT].id,
                goal_type="ShortTermGoal", association_source="manual",
            ))
        for offset in range(3):
            activity = activities[(index + offset) % ACTIVITY_COUNT]
            instance = ActivityInstance(
                id=str(uuid.uuid4()), session_id=session.id, activity_definition_id=activity.id, root_id=root.id,
                completed=True, time_start=session.session_start, time_stop=session.session_end,
                duration_seconds=900, created_at=session.created_at,
            )
            db_session.add(instance)
            for metric in metrics_by_activity[activity.id]:
                db_session.add(MetricValue(
                    activity_instance_id=instance.id, metric_definition_id=metric.id, value=float(index % 50),
                ))
        db_session.add(Note(
            id=str(uuid.uuid4()), root_id=root.id, context_type="session", context_id=session.id,
            session_id=session.id, content=f"Power note {index}", created_at=session.created_at,
        ))

    program = Program(
        id=str(uuid.uuid4()), root_id=root.id, name="Power Program",
        start_date=now - timedelta(days=84), end_date=now + timedelta(days=28), weekly_schedule=[],
    )
    db_session.add(program)
    db_session.flush()
    for goal in goals[:20]:
        db_session.execute(program_goals.insert().values(program_id=program.id, goal_id=goal.id))
    for block_index in range(4):
        block_start = (now - timedelta(days=84 - block_index * 28)).date()
        block = ProgramBlock(
            id=str(uuid.uuid4()), program_id=program.id, name=f"Block {block_index}",
            start_date=block_start, end_date=block_start + timedelta(days=27),
        )
        db_session.add(block)
        db_session.flush()
        day = ProgramDay(
            id=str(uuid.uuid4()), block_id=block.id, name="Practice",
            day_of_week=["Monday", "Wednesday", "Friday"],
        )
        day.templates.append(template)
        db_session.add(day)

    db_session.commit()
    return {
        "root": root,
        "goals": goals,
        "sessions": sessions,
        "program": program,
        "headers": session_headers_for(test_user),
    }


def _budget_get(client, url, headers, query_counter):
    query_counter["total"] = 0
    return timed_get(_HeaderClient(client, headers), url, query_counter=query_counter)


class _HeaderClient:
    def __init__(self, client, headers):
        self._client = client
        self._headers = headers

    def get(self, url):
        return self._client.get(url, headers=self._headers)


# Byte budgets track the slim goal payload (no duplicated attributes or per-goal level settings).
@pytest.mark.parametrize(("path", "max_queries", "max_bytes"), [
    ("/goals", 8, 360_000),
    ("/goals/selection", 12, 90_000),
    ("/sessions?limit=20", 20, 310_000),
    ("/sessions/analytics-summary", 14, 700_000),
    ("/goals/analytics", 14, 460_000),
])
def test_power_account_root_read_budgets(client, query_counter, power_account_dataset, path, max_queries, max_bytes):
    root_id = power_account_dataset["root"].id

    response, elapsed_ms = _budget_get(client, f"/api/{root_id}{path}", power_account_dataset["headers"], query_counter)

    assert_response_budget(response, max_bytes=max_bytes, max_ms=5000, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= max_queries


@pytest.mark.parametrize(("suffix", "max_queries"), [("metrics", 14), ("metrics/daily-durations", 10)])
def test_power_account_goal_metrics_budgets(client, query_counter, power_account_dataset, suffix, max_queries):
    goal_id = power_account_dataset["goals"][3].id

    response, elapsed_ms = _budget_get(client, f"/api/goals/{goal_id}/{suffix}", power_account_dataset["headers"], query_counter)

    assert_response_budget(response, max_bytes=50_000, max_ms=5000, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= max_queries


def test_power_account_session_goals_view_budget(client, query_counter, power_account_dataset):
    root_id = power_account_dataset["root"].id
    session_id = power_account_dataset["sessions"][0].id

    response, elapsed_ms = _budget_get(
        client, f"/api/fractal/{root_id}/sessions/{session_id}/goals-view", power_account_dataset["headers"], query_counter,
    )

    assert_response_budget(response, max_bytes=40_000, max_ms=5000, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 24


@pytest.mark.parametrize("with_detail", [False, True])
def test_power_account_program_day_read_model_budget(client, query_counter, power_account_dataset, with_detail):
    root_id = power_account_dataset["root"].id
    program_id = power_account_dataset["program"].id
    today = date.today()
    url = (
        f"/api/{root_id}/programs/{program_id}/day-read-model?timezone=UTC"
        f"&range_start={(today - timedelta(days=42)).isoformat()}&range_end={(today + timedelta(days=14)).isoformat()}"
    )
    if with_detail:
        url += f"&detail_date={today.isoformat()}"

    response, elapsed_ms = _budget_get(client, url, power_account_dataset["headers"], query_counter)

    assert_response_budget(response, max_bytes=200_000, max_ms=5000, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 36


def test_power_account_global_goal_list_budget(client, query_counter, power_account_dataset):
    response, elapsed_ms = _budget_get(client, "/api/goals", power_account_dataset["headers"], query_counter)

    assert_response_budget(response, max_bytes=380_000, max_ms=5000, elapsed_ms=elapsed_ms)
    assert query_counter["total"] <= 10


def test_power_account_goal_mutation_returns_subtree_in_constant_queries(client, query_counter, power_account_dataset):
    root_id = power_account_dataset["root"].id
    goal_id = power_account_dataset["goals"][0].id
    query_counter["total"] = 0

    response = client.patch(
        f"/api/{root_id}/goals/{goal_id}/pause",
        data=json.dumps({"paused": True}),
        content_type="application/json",
        headers=power_account_dataset["headers"],
    )

    assert response.status_code == 200
    assert response.get_json()["children"]
    assert query_counter["total"] <= 14
