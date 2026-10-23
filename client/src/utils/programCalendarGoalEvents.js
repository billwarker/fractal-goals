import { getDatePart, getISOYMDInTimezone } from './dateUtils';
import { describeGoalDue } from './goalDueFormat';
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
    // Open goals colour their "Due:" like the Goals pane's due text (normal, soon or overdue).
    const dueTone = completed
        ? null
        : describeGoalDue(deadline, getISOYMDInTimezone(new Date(), timezone || 'UTC'))?.tone ?? null;

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
            goalCompleted: completed,
            dueTone,
            ...extendedProps,
            sortOrder: 3,
        },
        classNames: completed
            ? ['completed-goal-event', 'clickable-goal-event']
            : ['clickable-goal-event'],
    };
}

const readGoal = (goal, key) => goal?.[key] ?? goal?.attributes?.[key];

/**
 * A program's goal lineage: its scoped goals and every ancestor (where reviewed levels sit).
 * @param {Array<object>} goals every goal, each with parent_id
 * @param {Iterable<string>} scopeGoalIds
 */
export function programLineageGoalIds(goals, scopeGoalIds) {
    const parentById = new Map(goals.map((goal) => [String(goal.id), readGoal(goal, 'parent_id')]));
    const lineage = new Set();
    [...scopeGoalIds].forEach((id) => {
        let current = id == null ? null : String(id);
        while (current && !lineage.has(current)) {
            lineage.add(current);
            const parent = parentById.get(current);
            current = parent == null ? null : String(parent);
        }
    });
    return lineage;
}

/** "Review:" badges on the day each lineage goal's next review falls. */
export function buildGoalReviewCalendarEvents({ goals = [], lineageGoalIds, ...helpers }) {
    return goals.flatMap((goal) => {
        const review = readGoal(goal, 'review');
        const nextOn = review?.next_review_on;
        if (!nextOn || !lineageGoalIds.has(String(goal.id)) || !['due', 'upcoming'].includes(review.status)) return [];
        const presentation = buildGoalPresentation(goal, false, helpers);
        return [{
            id: `calendar-goal-review-${goal.id}`,
            title: goal.name,
            start: nextOn.slice(0, 10),
            allDay: true,
            backgroundColor: presentation.backgroundColor,
            borderColor: presentation.backgroundColor,
            textColor: presentation.textColor,
            extendedProps: {
                type: 'goal',
                id: goal.id,
                goalId: goal.id,
                goalIcon: presentation.goalIcon,
                goalCompleted: false,
                badgeLabel: 'Review:',
                sortOrder: 4,
            },
            classNames: ['clickable-goal-event', 'goal-review-event'],
        }];
    });
}
