import { describe, expect, it } from 'vitest';
import { buildOnboardingSteps } from '../onboardingSteps';

describe('buildOnboardingSteps', () => {
    it('maps server completion facts and root-aware destinations', () => {
        const steps = buildOnboardingSteps({ steps: { create_fractal: true, first_session: false } }, 'root-1');
        expect(steps).toHaveLength(7);
        expect(steps[0]).toMatchObject({ id: 'create_fractal', done: true, path: '/' });
        expect(steps.find((step) => step.id === 'first_session')).toMatchObject({
            done: false,
            path: '/root-1/create-session',
        });
    });
});
