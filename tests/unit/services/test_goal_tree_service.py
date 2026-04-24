from datetime import datetime, timezone
from uuid import uuid4

from models import ActivityGroup, ActivityInstance, Goal, session_goals
from models.goal import activity_goal_associations, goal_activity_group_associations
from services.goal_tree_service import GoalTreeService
from services.session_service import SessionService


def _collect_tree_ids(node):
    if not node:
        return []

    ids = [node["id"]]
    for child in node.get("children", []) or []:
        ids.extend(_collect_tree_ids(child))
    return ids


def test_prune_tree_keeps_ancestors_of_allowed_descendants(db_session):
    tree = {
        "id": "root",
        "children": [
            {
                "id": "parent",
                "children": [
                    {"id": "leaf", "children": []},
                ],
            },
            {"id": "sibling", "children": []},
        ],
    }

    pruned = GoalTreeService._prune_tree_to_goal_ids(tree, {"leaf"})

    assert _collect_tree_ids(pruned) == ["root", "parent", "leaf"]


def test_session_goal_payload_keeps_structural_ancestors_for_activity_derived_goals(
    db_session,
    test_user,
    sample_goal_hierarchy,
    sample_practice_session,
    sample_activity_definition,
):
    db_session.execute(
        activity_goal_associations.insert().values(
            activity_id=sample_activity_definition.id,
            goal_id=sample_goal_hierarchy["short_term"].id,
        )
    )

    db_session.add(
        ActivityInstance(
            id=str(uuid4()),
            session_id=sample_practice_session.id,
            activity_definition_id=sample_activity_definition.id,
            root_id=sample_practice_session.root_id,
            created_at=datetime.now(timezone.utc),
        )
    )
    db_session.commit()

    service = GoalTreeService(db_session)
    payload, error, status = service.get_session_goals_view_payload(
        test_user,
        sample_goal_hierarchy["ultimate"].id,
        sample_practice_session.id,
    )

    assert error is None
    assert status == 200
    assert payload["session_goal_ids"] == [sample_goal_hierarchy["short_term"].id]
    assert payload["activity_goal_ids_by_activity"][sample_activity_definition.id] == [
        sample_goal_hierarchy["short_term"].id
    ]

    tree_ids = _collect_tree_ids(payload["goal_tree"])
    assert sample_goal_hierarchy["ultimate"].id in tree_ids
    assert sample_goal_hierarchy["long_term"].id in tree_ids
    assert sample_goal_hierarchy["mid_term"].id in tree_ids
    assert sample_goal_hierarchy["short_term"].id in tree_ids


def test_session_goal_payload_keeps_session_goals_in_structural_tree(
    db_session,
    test_user,
    sample_goal_hierarchy,
    sample_practice_session,
):
    immediate_goal = Goal(
        id=str(uuid4()),
        name="Immediate Practice Step",
        parent_id=sample_goal_hierarchy["short_term"].id,
        root_id=sample_goal_hierarchy["ultimate"].id,
        created_at=datetime.now(timezone.utc),
    )
    immediate_child = Goal(
        id=str(uuid4()),
        name="Second Practice Step",
        parent_id=immediate_goal.id,
        root_id=sample_goal_hierarchy["ultimate"].id,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add_all([immediate_goal, immediate_child])
    db_session.flush()

    link_values = SessionService(db_session)._session_goal_insert_values(
        sample_practice_session.id,
        immediate_child.id,
        "ImmediateGoal",
        "manual",
    )
    db_session.execute(session_goals.insert().values(**link_values))
    db_session.commit()

    service = GoalTreeService(db_session)
    payload, error, status = service.get_session_goals_view_payload(
        test_user,
        sample_goal_hierarchy["ultimate"].id,
        sample_practice_session.id,
    )

    assert error is None
    assert status == 200
    assert "micro_goals" not in payload

    tree_ids = _collect_tree_ids(payload["goal_tree"])
    assert immediate_goal.id in tree_ids
    assert immediate_child.id in tree_ids


def test_session_goal_payload_includes_group_inherited_activity_associations(
    db_session,
    test_user,
    sample_goal_hierarchy,
    sample_practice_session,
    sample_activity_definition,
):
    parent_group = ActivityGroup(
        id=str(uuid4()),
        root_id=sample_practice_session.root_id,
        name="Parent Group",
        created_at=datetime.now(timezone.utc),
    )
    child_group = ActivityGroup(
        id=str(uuid4()),
        root_id=sample_practice_session.root_id,
        name="Child Group",
        parent_id=parent_group.id,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add_all([parent_group, child_group])
    db_session.flush()

    sample_activity_definition.group_id = child_group.id
    db_session.execute(
        goal_activity_group_associations.insert().values(
            goal_id=sample_goal_hierarchy["long_term"].id,
            activity_group_id=parent_group.id,
        )
    )
    db_session.add(
        ActivityInstance(
            id=str(uuid4()),
            session_id=sample_practice_session.id,
            activity_definition_id=sample_activity_definition.id,
            root_id=sample_practice_session.root_id,
            created_at=datetime.now(timezone.utc),
        )
    )
    db_session.commit()

    service = GoalTreeService(db_session)
    payload, error, status = service.get_session_goals_view_payload(
        test_user,
        sample_goal_hierarchy["ultimate"].id,
        sample_practice_session.id,
    )

    assert error is None
    assert status == 200
    assert payload["session_goal_ids"] == [sample_goal_hierarchy["long_term"].id]
    assert payload["activity_goal_ids_by_activity"][sample_activity_definition.id] == [
        sample_goal_hierarchy["long_term"].id
    ]
