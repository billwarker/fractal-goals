const tracked = (id, title, description) => ({ id, title, description, kind: 'tracked' });
const optional = (id, title, description) => ({ id, title, description, kind: 'optional' });
const info = (id, title, description) => ({ id, title, description, kind: 'info' });

export const ONBOARDING_SUBSTEPS = {
    create_fractal: [
        tracked('name_outcome', 'Name the outcome', 'Write the long-term result this fractal serves.'),
        tracked('explain_relevance', 'Explain why it matters', 'Describe why this outcome deserves sustained practice.'),
        optional('initial_horizon', 'Set an initial horizon', 'Add a deadline when the outcome has a meaningful time boundary.'),
        info('review_starting_point', 'Review the starting point', 'Prefer an outcome such as “Become a tournament-level chess player” over an activity such as “Practice chess.”'),
    ],
    break_it_down: [
        tracked('supporting_goal', 'Add a major supporting goal', 'Create the first smaller result beneath your ultimate goal.'),
        tracked('describe_result', 'Describe the result', 'Explain what success for the supporting goal looks like.'),
        tracked('connect_to_parent', 'Connect it to the parent', 'State how the smaller goal contributes to the higher outcome.'),
        optional('visible_next_action', 'Make the next action visible', 'Continue one branch until it can guide near-term practice.'),
        info('keep_tree_focused', 'Keep the tree focused', 'Use a few meaningful children instead of exhaustively planning everything.'),
    ],
    make_goal_smart: [
        tracked('specific', 'Specific', 'Add a clear description of the result.'),
        tracked('measurable', 'Measurable', 'Add a target or configure completion through child goals.'),
        tracked('achievable', 'Achievable', 'Associate an activity or activity group, or use child completion.'),
        tracked('relevant', 'Relevant', 'Explain how the goal supports its parent or why the ultimate goal matters.'),
        tracked('time_bound', 'Time-bound', 'Set a deadline.'),
        info('review_badge', 'Review the badge', 'Each highlighted letter in the goal header represents a SMART criterion you have met.'),
    ],
    create_activity_metric: [
        tracked('create_activity', 'Create the activity', 'Name the repeatable practice action.'),
        tracked('choose_structure', 'Choose its structure', 'Decide whether it uses normal metrics, sets, or splits.'),
        tracked('add_metric', 'Add a metric', 'Define a value such as repetitions, accuracy, duration, rating, or weight.'),
        optional('interpret_progress', 'Choose how progress is interpreted', 'Configure progress tracking, best-set behavior, or delta display when useful.'),
        tracked('associate_goal', 'Associate it with a goal', 'Connect the activity to the goal it provides evidence for.'),
        info('check_unit', 'Check the recording unit', 'Use a metric name and unit that will be clear during a session.'),
    ],
    first_session: [
        tracked('choose_template', 'Choose a template', 'Use the Simple Empty Template or another session template.'),
        tracked('add_activity', 'Add the activity', 'Include an activity that carries the metric you want to record.'),
        tracked('record_values', 'Record real values', 'Enter at least one metric value, set, or split result.'),
        optional('add_context', 'Add context if useful', 'Capture a note about what changed, worked, or needs adjustment.'),
        tracked('complete_session', 'Complete the session', 'Finish the session so its data becomes durable evidence.'),
        tracked('see_evidence', 'See the evidence light up', 'Return to the goal tree to see which goals received evidence.'),
    ],
    schedule_program: [
        tracked('choose_goal', 'Choose the program’s goal', 'Select what the program is intended to advance.'),
        tracked('date_range', 'Define the date range', 'Set the program’s start and end dates.'),
        tracked('practice_rhythm', 'Add the practice rhythm', 'Create scheduled days or blocks for practice.'),
        tracked('connect_templates', 'Connect session templates', 'Attach the templates needed for scheduled practice.'),
        optional('review_calendar', 'Review the calendar', 'Verify that the intended rhythm appears on the calendar.'),
        info('adjust_before_committing', 'Adjust before committing', 'Check workload and spacing; the first schedule does not need to be permanent.'),
    ],
    see_progress: [
        tracked('open_analytics', 'Open Analytics', 'Identify a useful effort or progress view.'),
        info('inspect_evidence', 'Inspect goal evidence', 'Notice which goals are receiving evidence in the tree.'),
        tracked('review_notes', 'Review Notes', 'See how qualitative context complements metrics.'),
        info('compare_evidence', 'Compare intention with evidence', 'Check whether recorded activity is supporting the intended goal.'),
        info('make_adjustment', 'Make one adjustment', 'Refine a goal, activity, metric, template, or program based on what you learned.'),
        info('continue_without_guide', 'Continue without the guide', 'Dismiss onboarding when you are ready; it can be restored from Settings.'),
    ],
};

export function buildSubsteps(stepId, facts = {}) {
    return (ONBOARDING_SUBSTEPS[stepId] || []).map((substep, index) => ({
        ...substep,
        label: `${index + 1}`,
        done: facts[substep.id] === true,
    }));
}
