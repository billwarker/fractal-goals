import { describe, expect, it } from 'vitest';
import { buildOnboardingSteps } from '../onboardingSteps';

describe('buildOnboardingSteps', () => {
    it('maps server completion facts and root-aware destinations', () => {
        const steps = buildOnboardingSteps({ steps: { break_it_down: true, first_session: false }, substeps: { break_it_down: { supporting_goal: true } } }, 'root-1');
        expect(steps).toHaveLength(6);
        expect(steps[0]).toMatchObject({ id: 'break_it_down', done: true, path: '/root-1/goals' });
        expect(steps[1]).toMatchObject({ id: 'create_activity_metric', number: 2, title: 'Create an activity' });
        expect(steps[2]).toMatchObject({ id: 'make_goal_smart', number: 3 });
        expect(steps[0].substeps[0]).toMatchObject({ id: 'supporting_goal', done: true, kind: 'tracked' });
        expect(steps.find((step) => step.id === 'first_session')).toMatchObject({
            done: false,
            path: '/root-1/create-session',
        });
    });

    it('interpolates the root level word into substep copy', () => {
        const steps = buildOnboardingSteps({}, 'root-1', { level: 'ultimate' });
        expect(steps[0].substeps[0].description).toContain('your ultimate goal');

        const fallback = buildOnboardingSteps({}, 'root-1');
        expect(fallback[0].substeps[0].description).toContain('your ultimate goal');
    });
});
