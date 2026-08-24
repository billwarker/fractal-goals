import { getDatePart, getISOYMDInTimezone } from './dateUtils';
import { getGoalDeadline } from './programGoalAssociations';

function buildGoalPresentation(goal, completed, helpers) {
    const iconColorSource = completed ? 'Completed' : goal;
    return {
        backgroundColor: helpers.getGoalColor(goal),
        textColor: helpers.getGoalTextColor(goal),
        goalIcon: {
            shape: helpers.getGoalIcon?.(goal) || 'circle',
            color: helpers.getGoalColor(iconColorSource),
            secondaryColor: helpers.getGoalSecondaryColor?.(iconColorSource) || 'var(--color-bg-card)',
            isSmart: Boolean(goal.is_smart ?? goal.attributes?.is_smart),
        },
    };
}

export function buildGoalDeadlineCalendarEvent({
    goal,
    timezone,
    idPrefix = 'calendar-goal',
    useCompletionDate = true,
    extendedProps = {},
    ...helpers
}) {
    if (!goal) return null;
    const deadline = getGoalDeadline(goal);
    if (!deadline) return null;

    const completed = Boolean(goal.completed || goal.attributes?.completed);
    const completionDate = goal.completed_at || goal.attributes?.completed_at;
    const presentation = buildGoalPresentation(goal, completed, helpers);

    return {
        id: `${idPrefix}-${goal.id}`,
        title: goal.name,
        start: useCompletionDate && completed && completionDate
            ? getISOYMDInTimezone(completionDate, timezone)
            : getDatePart(deadline),
        allDay: true,
        backgroundColor: presentation.backgroundColor,
        borderColor: presentation.backgroundColor,
        textColor: presentation.textColor,
        extendedProps: {
            ...goal,
            type: 'goal',
            id: goal.id,
            goalId: goal.id,
            goalIcon: presentation.goalIcon,
            ...extendedProps,
            sortOrder: 3,
        },
        classNames: completed
            ? ['completed-goal-event', 'clickable-goal-event']
            : ['clickable-goal-event'],
    };
}
