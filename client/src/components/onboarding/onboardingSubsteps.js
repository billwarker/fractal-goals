const tracked = (id, title, description) => ({ id, title, description, kind: 'tracked' });
const optional = (id, title, description) => ({ id, title, description, kind: 'optional' });
const info = (id, title, description) => ({ id, title, description, kind: 'info' });

export const ONBOARDING_SUBSTEPS = {
    break_it_down: [
        tracked('goal_detail_modal_opened', 'Open the Goal Detail Modal', 'The Goal Detail Modal is the home for all information about your goals. You can edit their attributes using the Edit or Options buttons in the footer.'),
        tracked('goal_timeline_viewed', 'Visit your Goal Timeline', 'The timelines pane will show all work you put towards your goals: completing activities, associating activities, creating targets and achieving targets, and more'),
        tracked('goal_activities_viewed', "Visit your Goal's Activities", "Once you create activities to define how you'll progress towards your goals, you can associate them to your goals. You can then create targets against those activities, giving your goal real conditions for success. You can create and associate activities from this modal, or by visiting Sessions > Manage Activities."),
        tracked('goal_notes_viewed', "Visit your Goal's Notes", 'You can keep track of any thoughts or notes about your goal here. Notes made on activities associated to your goals will also show up here too. Great for collecting links and online videos.'),
        tracked('child_goal_created', 'Create a Child Goal', 'Break your goal down into smaller pieces, giving you a path towards completing your {level} goal.'),
    ],
    create_activity_metric: [
        info('go_to_manage_activities', 'Go to Sessions › Manage Activities', 'Open the activity manager to define the practice you want to record.'),
        tracked('create_activity', 'Create an activity', 'Name the repeatable practice action.'),
        tracked('associate_goal', 'Associate it to a goal', 'Activities can be directly associated to goals, and parents will inherit the activities of their children.'),
        info('create_activity_group', 'Create an activity group and add your activity to it', 'Activity groups help you organize activities of the same type (e.g. warm ups).'),
        optional('add_metric', 'Define metrics', 'Create up to 3 metrics that help you measure your performance on this activity.'),
        info('refine_metrics', 'Refine your metrics', 'Go to Manage Metrics, where you can refine how these metrics are tracked.'),
    ],
    make_goal_smart: [
        tracked('specific', 'Specific', 'Add a clear description of the result.'),
        tracked('measurable', 'Measurable', 'Open the goal detail modal and go to Activities › Add Target, then select an activity to create a target against. Alternatively, set the goal to complete once its children are complete.'),
        tracked('achievable', 'Achievable', 'Associate an activity or activity group, or use child completion.'),
        tracked('relevant', 'Relevant', 'Explain how the goal supports its parent or why the ultimate goal matters.'),
        tracked('time_bound', 'Time-bound', 'Set a deadline.'),
        info('review_badge', 'Review the badge', 'Each highlighted letter in the goal header represents a SMART criterion you have met.'),
    ],
    first_session: [
        optional('create_template', 'Create a session template', 'Go to Sessions › Manage Session Templates › Create Template. Session templates let you customize your sessions, breaking them into sections and pre-populating those sections with activities.'),
        tracked('create_session', 'Create your first session', 'Click + Add Session, select a session template, then press Create Session to get started.'),
        tracked('add_activity', 'Add activity instances', 'Click + Add Activities on your session to create an activity instance from your bank of activities. Once you’ve added an activity, click Start to begin running a timer as you do the activity.'),
        optional('record_values', 'Track your sets and metric values', 'If your activity has sets or metrics, you can track them here.'),
        tracked('complete_instance', 'Complete your activity instance', 'Hit the Complete button to stop the timer and track your work evidence on the activity. This evidence is automatically tracked on all associated goals.'),
        tracked('complete_session', 'Complete the session', 'Once you’ve completed all your work, click the Complete button on the sidepane to finish the session.'),
    ],
    schedule_program: [
        tracked('program_created', 'Create a Program', "Give your program a name, choose which goals you're planning to achieve, and give it start/end dates"),
        tracked('program_block_created', 'Define Program Blocks', 'Split your program into smaller block periods, where you can target specific goals or have a phased approach'),
        tracked('program_day_completed', 'Create Program Days', 'Within a block, you can define program days, with specific session templates or conditions for a successful day'),
        tracked('calendar_day_modal_opened', 'Review the Calendar', 'Click twice on a calendar day to open the Calendar Day modal: from here you can schedule specific program days or goal deadlines.'),
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

export function buildSubsteps(stepId, facts = {}, { level } = {}) {
    const levelText = level || 'ultimate';
    return (ONBOARDING_SUBSTEPS[stepId] || []).map((substep, index) => ({
        ...substep,
        label: `${index + 1}`,
        description: substep.description.replace('{level}', levelText),
        done: facts[substep.id] === true,
    }));
}
