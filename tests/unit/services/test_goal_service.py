import uuid

from models import Goal, GoalLevel
from services.goal_service import GoalService, sync_goal_targets


def test_update_goal_completion_sets_and_clears_completed_session_id(
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_practice_session,
):
    service = GoalService(db_session, sync_targets=sync_goal_targets)

    completed_goal, error, status = service.update_goal_completion(
        sample_ultimate_goal.id,
        test_user.id,
        {
            'completed': True,
            'session_id': sample_practice_session.id,
        },
        root_id=sample_ultimate_goal.id,
    )

    assert error is None
    assert status == 200
    assert completed_goal.completed is True
    assert completed_goal.completed_session_id == sample_practice_session.id

    uncompleted_goal, error, status = service.update_goal_completion(
        sample_ultimate_goal.id,
        test_user.id,
        {
            'completed': False,
            'session_id': sample_practice_session.id,
        },
        root_id=sample_ultimate_goal.id,
    )

    assert error is None
    assert status == 200
    assert uncompleted_goal.completed is False
    assert uncompleted_goal.completed_session_id is None


def test_update_goal_completion_rejects_frozen_goal(
    db_session,
    test_user,
    sample_ultimate_goal,
):
    sample_ultimate_goal.frozen = True
    db_session.commit()

    service = GoalService(db_session, sync_targets=sync_goal_targets)

    goal, error, status = service.update_goal_completion(
        sample_ultimate_goal.id,
        test_user.id,
        {'completed': True},
        root_id=sample_ultimate_goal.id,
    )

    assert goal is None
    assert status == 400
    assert error == "Cannot complete a frozen goal. Unfreeze it first."


def test_move_goal_requires_new_parent_on_same_parent_tier(
    db_session,
    test_user,
    sample_goal_hierarchy,
):
    root = sample_goal_hierarchy['ultimate']
    long_term = sample_goal_hierarchy['long_term']
    mid_term = sample_goal_hierarchy['mid_term']
    short_term = sample_goal_hierarchy['short_term']

    root_level = GoalLevel(id=str(uuid.uuid4()), name='Ultimate Goal', rank=0)
    long_level = GoalLevel(id=str(uuid.uuid4()), name='Long Term Goal', rank=1)
    mid_level = GoalLevel(id=str(uuid.uuid4()), name='Mid Term Goal', rank=2)
    short_level = GoalLevel(id=str(uuid.uuid4()), name='Short Term Goal', rank=3)
    db_session.add_all([root_level, long_level, mid_level, short_level])
    db_session.flush()

    root.level_id = root_level.id
    long_term.level_id = long_level.id
    mid_term.level_id = mid_level.id
    short_term.level_id = short_level.id

    alternate_long = Goal(
        id=str(uuid.uuid4()),
        name='Alternate long-term',
        description='Sibling of the current parent',
        parent_id=root.id,
        root_id=root.id,
        level_id=long_level.id,
        owner_id=test_user.id,
    )
    alternate_mid = Goal(
        id=str(uuid.uuid4()),
        name='Alternate mid-term',
        description='Valid new parent',
        parent_id=long_term.id,
        root_id=root.id,
        level_id=mid_level.id,
        owner_id=test_user.id,
    )
    db_session.add_all([alternate_long, alternate_mid])
    db_session.commit()

    service = GoalService(db_session, sync_targets=sync_goal_targets)

    moved_goal, error, status = service.move_goal(
        root.id,
        short_term.id,
        test_user.id,
        alternate_mid.id,
    )

    assert error is None
    assert status == 200
    assert moved_goal.parent_id == alternate_mid.id

    rejected_goal, error, status = service.move_goal(
        root.id,
        short_term.id,
        test_user.id,
        alternate_long.id,
    )

    assert rejected_goal is None
    assert status == 400
    assert error == "Can only move a goal under a parent on the same tier as its current parent"


def test_convert_goal_level_rejects_root_tier(
    db_session,
    test_user,
    sample_goal_hierarchy,
):
    root = sample_goal_hierarchy['ultimate']
    long_term = sample_goal_hierarchy['long_term']
    mid_term = sample_goal_hierarchy['mid_term']
    short_term = sample_goal_hierarchy['short_term']

    root_level = GoalLevel(id=str(uuid.uuid4()), name='Ultimate Goal', rank=0)
    long_level = GoalLevel(id=str(uuid.uuid4()), name='Long Term Goal', rank=1)
    mid_level = GoalLevel(id=str(uuid.uuid4()), name='Mid Term Goal', rank=2)
    short_level = GoalLevel(id=str(uuid.uuid4()), name='Short Term Goal', rank=3)
    db_session.add_all([root_level, long_level, mid_level, short_level])
    db_session.flush()

    root.level_id = root_level.id
    long_term.level_id = long_level.id
    mid_term.level_id = mid_level.id
    short_term.level_id = short_level.id
    db_session.commit()

    service = GoalService(db_session, sync_targets=sync_goal_targets)

    goal, error, status = service.convert_goal_level(
        root.id,
        short_term.id,
        test_user.id,
        root_level.id,
    )

    assert goal is None
    assert status == 400
    assert error == "Cannot convert a goal to the fractal root level"
