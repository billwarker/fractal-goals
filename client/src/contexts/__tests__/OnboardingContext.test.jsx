import { describe, expect, it } from 'vitest';

import { getOnboardingRootId } from '../OnboardingContext';

describe('getOnboardingRootId', () => {
    it('scopes onboarding to fractal routes only', () => {
        expect(getOnboardingRootId('/root-1/goals')).toBe('root-1');
        expect(getOnboardingRootId('/root-2/manage-activities')).toBe('root-2');
        expect(getOnboardingRootId('/admin')).toBeNull();
        expect(getOnboardingRootId('/landing-preview')).toBeNull();
        expect(getOnboardingRootId('/')).toBeNull();
    });
});
