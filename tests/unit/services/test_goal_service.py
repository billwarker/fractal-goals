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
