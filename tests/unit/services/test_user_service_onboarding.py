from services.user_service import UserService


def test_merge_persisted_onboarding_achievements_is_monotonic():
    state = UserService._normalize_onboarding_state({
        'status': 'active',
        'completed_steps': ['create_activity_metric'],
        'completed_substeps': {'create_activity_metric': ['create_activity']},
    })
    live_progress = {'create_activity_metric': False, 'first_session': True}
    live_substeps = {
        'create_activity_metric': {
            'create_activity': False,
            'associate_goal': True,
            'go_to_manage_activities': None,
        },
    }

    merge = UserService._merge_persisted_onboarding_achievements
    persisted, progress, substeps = merge(state, live_progress, live_substeps)

    assert progress == {'create_activity_metric': True, 'first_session': True}
    assert substeps['create_activity_metric'] == {
        'create_activity': True,
        'associate_goal': True,
        'go_to_manage_activities': None,
    }
    assert persisted['completed_steps'] == [
        'create_activity_metric',
        'first_session',
    ]
    assert persisted['completed_substeps']['create_activity_metric'] == [
        'associate_goal',
        'create_activity',
    ]
