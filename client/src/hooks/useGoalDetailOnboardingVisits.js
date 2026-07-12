import { useCallback, useEffect } from 'react';

import { useOptionalOnboarding } from '../contexts/OnboardingContext';

const VIEW_VISIT_KEYS = {
    'goal-timeline': 'goal_timeline',
    'goal-activities': 'goal_activities',
    'goal-notes': 'goal_notes',
};

export default function useGoalDetailOnboardingVisits({ displayMode, goalId, isOpen, mode, readOnly, rootId }) {
    const onboarding = useOptionalOnboarding();
    const markVisit = useCallback((key) => {
        if (onboarding?.enabled && onboarding.rootId === rootId && !onboarding.state?.visited?.includes(key)) {
            onboarding.markVisited(key);
        }
    }, [onboarding, rootId]);

    useEffect(() => {
        if (isOpen && (displayMode === 'modal' || displayMode === 'panel') && mode === 'view' && !readOnly && goalId) markVisit('goal_detail_modal');
    }, [displayMode, goalId, isOpen, markVisit, mode, readOnly]);

    return useCallback((viewState) => {
        const key = VIEW_VISIT_KEYS[viewState];
        if (key && mode === 'view' && !readOnly) markVisit(key);
    }, [markVisit, mode, readOnly]);
}
