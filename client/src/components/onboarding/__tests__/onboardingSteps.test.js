import { describe, expect, it } from 'vitest';
import { buildOnboardingSteps } from '../onboardingSteps';

describe('buildOnboardingSteps', () => {
    it('maps server completion facts and root-aware destinations', () => {
        const steps = buildOnboardingSteps({ steps: { break_it_down: true, first_session: false }, substeps: { break_it_down: { goal_detail_modal_opened: true } } }, 'root-1');
        expect(steps).toHaveLength(6);
        expect(steps[0]).toMatchObject({ id: 'break_it_down', done: true, path: '/root-1/goals' });
        expect(steps[1]).toMatchObject({ id: 'create_activity_metric', number: 2, title: 'Create an activity' });
        expect(steps[2]).toMatchObject({ id: 'make_goal_smart', number: 3 });
        expect(steps[0]).toMatchObject({ title: 'Get Acquainted with Your Goals' });
        expect(steps[0].substeps[0]).toMatchObject({ id: 'goal_detail_modal_opened', done: true, kind: 'tracked' });
        expect(steps.find((step) => step.id === 'first_session')).toMatchObject({
            done: false,
            path: '/root-1/create-session',
        });
    });

    it('interpolates the root level word into substep copy', () => {
        const steps = buildOnboardingSteps({}, 'root-1', { level: 'ultimate' });
        expect(steps[0].substeps[4].description).toContain('your ultimate goal');

        const fallback = buildOnboardingSteps({}, 'root-1');
        expect(fallback[0].substeps[4].description).toContain('your ultimate goal');
    });

    it('defines the five goal-detail acquaintance milestones', () => {
        const substeps = buildOnboardingSteps({}, 'root-1', { level: 'long term' })[0].substeps;
        expect(substeps.map(({ id }) => id)).toEqual([
            'goal_detail_modal_opened', 'goal_timeline_viewed', 'goal_activities_viewed',
            'goal_notes_viewed', 'child_goal_created',
        ]);
        expect(substeps[4].description).toContain('your long term goal');
    });

    it('uses the four tracked schedule-program milestones', () => {
        const step = buildOnboardingSteps({
            substeps: {
                schedule_program: {
                    program_created: true,
                    program_block_created: true,
                    program_day_completed: false,
                    calendar_day_modal_opened: true,
                },
            },
        }, 'root-1').find((candidate) => candidate.id === 'schedule_program');

        expect(step.substeps.map(({ id, title, done }) => ({ id, title, done }))).toEqual([
            { id: 'program_created', title: 'Create a Program', done: true },
            { id: 'program_block_created', title: 'Define Program Blocks', done: true },
            { id: 'program_day_completed', title: 'Create Program Days', done: false },
            { id: 'calendar_day_modal_opened', title: 'Review the Calendar', done: true },
        ]);
        expect(step.substeps[3].description).toContain('Click twice on a calendar day');
    });
});
