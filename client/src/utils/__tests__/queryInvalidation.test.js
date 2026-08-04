import { describe, expect, it, vi } from 'vitest';

import { queryKeys } from '../../hooks/queryKeys';
import { invalidateOnboardingProgress } from '../queryInvalidation';

describe('invalidateOnboardingProgress', () => {
    it('refetches active onboarding but leaves terminal caches untouched', () => {
        const invalidateQueries = vi.fn(() => Promise.resolve());

        invalidateOnboardingProgress({ invalidateQueries }, queryKeys);

        expect(invalidateQueries).toHaveBeenCalledTimes(1);
        const options = invalidateQueries.mock.calls[0][0];
        expect(options.queryKey).toEqual(queryKeys.onboardingRoot());
        expect(options.predicate({ state: { data: { status: 'active' } } })).toBe(true);
        expect(options.predicate({ state: { data: { status: 'dismissed' } } })).toBe(false);
        expect(options.predicate({ state: { data: { status: 'completed' } } })).toBe(false);
        expect(options.predicate({ state: { data: undefined } })).toBe(true);
    });
});
