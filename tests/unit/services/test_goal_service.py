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


def test_move_goal_allows_flexible_hierarchy_and_rejects_non_monotonic_path(
    db_session,
    test_user,
    sample_goal_hierarchy,
):
    """Flexible hierarchy: a short-term goal can move under an ultimate goal (skipping levels).
    But moving under a same-rank sibling would create a non-monotonic path and must be rejected."""
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

    # A sibling short-term goal — moving short_term under this would create
    # a non-monotonic path: Ultimate(0) → Long(1) → Short(3) → Short(3)
    sibling_short = Goal(
        id=str(uuid.uuid4()),
        name='Sibling short-term',
        description='Same rank as short_term',
        parent_id=long_term.id,
        root_id=root.id,
        level_id=short_level.id,
        owner_id=test_user.id,
    )
    db_session.add(sibling_short)
    db_session.commit()

    service = GoalService(db_session, sync_targets=sync_goal_targets)

    # Flexible hierarchy: moving short_term directly under root (skipping long+mid) is allowed.
    moved_goal, error, status = service.move_goal(
        root.id,
        short_term.id,
        test_user.id,
        root.id,
    )

    assert error is None
    assert status == 200
    assert moved_goal.parent_id == root.id

    # Non-monotonic: short_term (rank 3) cannot move under sibling_short (rank 3).
    rejected_goal, error, status = service.move_goal(
        root.id,
        short_term.id,
        test_user.id,
        sibling_short.id,
    )

    assert rejected_goal is None
    assert status == 400


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


def _setup_convert_levels(db_session, hierarchy):
    """Helper: assign levels to a standard hierarchy and return level objects."""
    root_level = GoalLevel(id=str(uuid.uuid4()), name='Ultimate Goal', rank=0)
    long_level = GoalLevel(id=str(uuid.uuid4()), name='Long Term Goal', rank=1)
    mid_level = GoalLevel(id=str(uuid.uuid4()), name='Mid Term Goal', rank=2)
    short_level = GoalLevel(id=str(uuid.uuid4()), name='Short Term Goal', rank=3)
    imm_level = GoalLevel(id=str(uuid.uuid4()), name='Immediate Goal', rank=4)
    db_session.add_all([root_level, long_level, mid_level, short_level, imm_level])
    db_session.flush()

    hierarchy['ultimate'].level_id = root_level.id
    hierarchy['long_term'].level_id = long_level.id
    hierarchy['mid_term'].level_id = mid_level.id
    hierarchy['short_term'].level_id = short_level.id
    db_session.commit()

    return {
        'root': root_level,
        'long': long_level,
        'mid': mid_level,
        'short': short_level,
        'immediate': imm_level,
    }


def test_convert_goal_level_success(db_session, test_user, sample_goal_hierarchy):
    """A long-term goal with no children constraints can be converted to mid-term."""
    levels = _setup_convert_levels(db_session, sample_goal_hierarchy)
    service = GoalService(db_session, sync_targets=sync_goal_targets)

    root = sample_goal_hierarchy['ultimate']
    # long_term's parent is ultimate (rank 0), its child is mid_term (rank 2).
    # Converting long_term to a level with rank between 0 and 2 (exclusive) — but
    # there's no standard level at rank 0 < rank < 2. Use short_term-free scenario:
    # Use short_term itself (no children), convert it to immediate level (rank 4).
    short_term = sample_goal_hierarchy['short_term']

    result, error, status = service.convert_goal_level(
        root.id, short_term.id, test_user.id, levels['immediate'].id,
    )

    assert error is None
    assert status == 200
    assert result.level_id == levels['immediate'].id


def test_convert_goal_level_rejects_parent_rank_violation(db_session, test_user, sample_goal_hierarchy):
    """Cannot convert a goal to a level equal to or above its parent."""
    levels = _setup_convert_levels(db_session, sample_goal_hierarchy)
    service = GoalService(db_session, sync_targets=sync_goal_targets)

    root = sample_goal_hierarchy['ultimate']
    mid_term = sample_goal_hierarchy['mid_term']  # parent is long_term (rank 1)

    # Attempt to convert mid_term (rank 2) to long-term level (rank 1) — same as parent
    result, error, status = service.convert_goal_level(
        root.id, mid_term.id, test_user.id, levels['long'].id,
    )

    assert result is None
    assert status == 400
    assert "must be below parent level" in error


def test_convert_goal_level_rejects_child_rank_violation(db_session, test_user, sample_goal_hierarchy):
    """Cannot convert a goal to a level equal to or below one of its children."""
    levels = _setup_convert_levels(db_session, sample_goal_hierarchy)
    service = GoalService(db_session, sync_targets=sync_goal_targets)

    root = sample_goal_hierarchy['ultimate']
    mid_term = sample_goal_hierarchy['mid_term']  # has short_term child (rank 3)

    # Attempt to convert mid_term to short-term level (rank 3) — same as child
    result, error, status = service.convert_goal_level(
        root.id, mid_term.id, test_user.id, levels['short'].id,
    )

    # short_term IS a child of mid_term, so rank 3 >= rank 3 must be rejected
    assert result is None
    assert status == 400
    assert "must be above child level" in error


def test_convert_goal_level_rejects_execution_tier_goal(db_session, test_user, sample_goal_hierarchy):
    """Execution-tier goals cannot be converted."""
    levels = _setup_convert_levels(db_session, sample_goal_hierarchy)
    service = GoalService(db_session, sync_targets=sync_goal_targets)

    root = sample_goal_hierarchy['ultimate']
    # Temporarily assign immediate level to short_term for this test
    short_term = sample_goal_hierarchy['short_term']
    short_term.level_id = levels['immediate'].id
    db_session.commit()

    result, error, status = service.convert_goal_level(
        root.id, short_term.id, test_user.id, levels['short'].id,
    )

    assert result is None
    assert status == 400
    assert "execution-tier" in error


def test_create_fractal_goal_record_rejects_removed_goal_types(db_session, test_user, sample_goal_hierarchy):
    """Direct service calls cannot recreate removed Micro/Nano levels."""
    _setup_convert_levels(db_session, sample_goal_hierarchy)
    service = GoalService(db_session, sync_targets=sync_goal_targets)

    root = sample_goal_hierarchy['ultimate']
    for removed_type in ['MicroGoal', 'NanoGoal']:
        result, error, status = service.create_fractal_goal_record(
            root.id,
            test_user.id,
            {
                'name': removed_type,
                'type': removed_type,
                'parent_id': sample_goal_hierarchy['short_term'].id,
            },
        )
        assert result is None
        assert status == 400
        assert error == "Invalid goal type"
