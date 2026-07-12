import { describe, expect, it, vi } from 'vitest';

import { queryKeys } from '../queryKeys';
import { invalidateActivityGoalAssociationQueries } from '../useActivityGoalAssociations';

describe('invalidateActivityGoalAssociationQueries', () => {
    it('invalidates onboarding for activity-centric goal association changes', async () => {
        const invalidateQueries = vi.fn(() => Promise.resolve());
        const queryClient = { invalidateQueries };

        await invalidateActivityGoalAssociationQueries(queryClient, {
            rootId: 'root-1',
            sessionId: 'session-1',
            goalId: 'goal-1',
        });

        expect(invalidateQueries).toHaveBeenCalledWith({
            queryKey: queryKeys.onboardingRoot(),
        });
    });

    it('does not invalidate anything without a query client or root', async () => {
        const invalidateQueries = vi.fn();

        await invalidateActivityGoalAssociationQueries({ invalidateQueries }, { rootId: null });
        await invalidateActivityGoalAssociationQueries(null, { rootId: 'root-1' });

        expect(invalidateQueries).not.toHaveBeenCalled();
    });
});
