import { buildSubsteps } from './onboardingSubsteps';

// In the order people meet them: understand the tree, define the practice, do the work, then
// sharpen a goal and plan ahead. The server derives every step's completion; ids are stable.
export const ONBOARDING_STEPS = [
    { id: 'break_it_down', title: 'Explore your goal tree', blurb: 'Open a goal to see its timeline, activities and notes, then add a goal beneath it.', path: (rootId) => `/${rootId}/goals` },
    { id: 'create_activity_metric', title: 'Create an activity', blurb: 'Name something you practise and how you’ll measure it.', path: (rootId) => `/${rootId}/manage-activities` },
    { id: 'first_session', title: 'Run your first session', blurb: 'Do the work and record it; the evidence lights up your tree.', path: (rootId) => `/${rootId}/create-session` },
    { id: 'make_goal_smart', title: 'Make one goal SMART', blurb: 'Give a goal a clear result, a measure and a deadline.', path: (rootId) => `/${rootId}/goals` },
    { id: 'schedule_program', title: 'Plan a program', blurb: 'Turn your practice into a repeatable schedule.', path: (rootId) => `/${rootId}/programs` },
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
