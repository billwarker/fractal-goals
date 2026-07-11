import { describe, expect, it } from 'vitest';
import { buildOnboardingSteps } from '../onboardingSteps';

describe('buildOnboardingSteps', () => {
    it('maps server completion facts and root-aware destinations', () => {
        const steps = buildOnboardingSteps({ steps: { break_it_down: true, first_session: false }, substeps: { break_it_down: { supporting_goal: true } } }, 'root-1');
        expect(steps).toHaveLength(6);
        expect(steps[0]).toMatchObject({ id: 'break_it_down', done: true, path: '/root-1/goals' });
        expect(steps[0].substeps[0]).toMatchObject({ id: 'supporting_goal', done: true, kind: 'tracked' });
        expect(steps.find((step) => step.id === 'first_session')).toMatchObject({
            done: false,
            path: '/root-1/create-session',
        });
    });
});
