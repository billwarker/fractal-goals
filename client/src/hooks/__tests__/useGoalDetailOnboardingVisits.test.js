import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import useGoalDetailOnboardingVisits from '../useGoalDetailOnboardingVisits';

const markVisited = vi.fn();
let onboarding;

vi.mock('../../contexts/OnboardingContext', () => ({
    useOptionalOnboarding: () => onboarding,
}));

describe('useGoalDetailOnboardingVisits', () => {
    beforeEach(() => {
        markVisited.mockReset();
        onboarding = { enabled: true, rootId: 'root-1', state: { visited: [] }, markVisited };
    });

    it('records opening the modal and visiting each guided view', () => {
        const { result } = renderHook(() => useGoalDetailOnboardingVisits({
            displayMode: 'modal', goalId: 'goal-1', isOpen: true, mode: 'view', readOnly: false, rootId: 'root-1',
        }));
        expect(markVisited).toHaveBeenCalledWith('goal_detail_modal');

        act(() => result.current('goal-timeline'));
        act(() => result.current('goal-activities'));
        act(() => result.current('goal-notes'));
        expect(markVisited.mock.calls.slice(1).map(([key]) => key)).toEqual([
            'goal_timeline', 'goal_activities', 'goal_notes',
        ]);
    });

    it('records opening the goal detail side panel', () => {
        renderHook(() => useGoalDetailOnboardingVisits({
            displayMode: 'panel', goalId: 'goal-1', isOpen: true, mode: 'view', readOnly: false, rootId: 'root-1',
        }));
        expect(markVisited).toHaveBeenCalledWith('goal_detail_modal');
    });

    it('does not record create or read-only modal activity', () => {
        const { result } = renderHook(() => useGoalDetailOnboardingVisits({
            displayMode: 'modal', goalId: null, isOpen: true, mode: 'create', readOnly: true, rootId: 'root-1',
        }));
        act(() => result.current('goal-timeline'));
        expect(markVisited).not.toHaveBeenCalled();
    });
});
