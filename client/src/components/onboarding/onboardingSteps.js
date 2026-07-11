import { buildSubsteps } from './onboardingSubsteps';

export const ONBOARDING_STEPS = [
    { id: 'break_it_down', title: 'Break it down', blurb: 'Add a smaller goal beneath your ultimate goal.', path: (rootId) => `/${rootId}/goals` },
    { id: 'create_activity_metric', title: 'Create an activity', blurb: 'Define the practice and evidence you want to record.', path: (rootId) => `/${rootId}/manage-activities` },
    { id: 'make_goal_smart', title: 'Make one goal SMART', blurb: 'Give one goal a clear result, measure, and timeframe.', path: (rootId) => `/${rootId}/goals` },
    { id: 'first_session', title: 'Run your first session', blurb: 'Complete a session to light up evidence in your tree.', path: (rootId) => `/${rootId}/create-session` },
    { id: 'schedule_program', title: 'Schedule a program', blurb: 'Turn your practice into a repeatable rhythm.', path: (rootId) => `/${rootId}/programs` },
    { id: 'see_progress', title: 'See your progress', blurb: 'Visit Analytics and Notes to review evidence and context.', path: (rootId) => `/${rootId}/analytics` },
];

export function buildOnboardingSteps(state, rootId, { level } = {}) {
    return ONBOARDING_STEPS.map((step, index) => ({
        ...step,
        number: index + 1,
        done: Boolean(state?.steps?.[step.id]),
        path: step.path(rootId),
        substeps: buildSubsteps(step.id, state?.substeps?.[step.id], { level }),
    }));
}
