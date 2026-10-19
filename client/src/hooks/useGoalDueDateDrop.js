import { useCallback, useEffect, useMemo, useState } from 'react';

import { showActionToast } from '../components/atoms/ActionToast';
import { deadlineWarnings, describeDeadlineWarning, toIsoDate } from '../utils/goalDeadlineRules';
import { formatDueDate } from '../utils/goalDueFormat';
import { buildProgramsCalendarEvents } from '../utils/programViewModel';

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

function useFinePointer() {
    const [matches, setMatches] = useState(() => Boolean(window.matchMedia?.(FINE_POINTER).matches));
    useEffect(() => {
        const query = window.matchMedia?.(FINE_POINTER);
        if (!query) return undefined;
        const update = () => setMatches(query.matches);
        query.addEventListener?.('change', update);
        return () => query.removeEventListener?.('change', update);
    }, []);
    return matches;
}

/**
 * The calendar's "Due:" badges: one per goal with a due date (completed goals sit on their
 * completion date as "Done:").
 */
export function useGoalDueCalendarEvents(goals, timezone, { getGoalColor, getGoalTextColor, getGoalSecondaryColor, getGoalIcon }) {
    return useMemo(() => buildProgramsCalendarEvents(
        [], goals, getGoalColor, getGoalTextColor, timezone, { getGoalSecondaryColor, getGoalIcon },
    ), [getGoalColor, getGoalIcon, getGoalSecondaryColor, getGoalTextColor, goals, timezone]);
}

/**
 * Setting a goal's due date by dropping it on a Program calendar day, on desktop only (mobile
 * edits due dates in the goal modal). Rules are soft: the date is saved, the toast lists any
 * warnings (the server's, plus the program's dates, which only the calendar knows), and Undo
 * restores the previous due date.
 */
export default function useGoalDueDateDrop({ goals = [], program = null, today, updateGoal, isMobile = false }) {
    const finePointer = useFinePointer();
    const onGoalDueDrop = useCallback(async (goalId, date) => {
        const goal = goals.find((candidate) => String(candidate.id) === String(goalId));
        const nextDate = toIsoDate(date);
        if (!goal || !nextDate) return;
        const previous = toIsoDate(goal.deadline ?? goal.attributes?.deadline);
        if (previous === nextDate) return;

        let saved;
        try {
            saved = await updateGoal(goal.id, { deadline: nextDate });
        } catch {
            return; // updateGoal reports the failure.
        }
        const warnings = [
            ...deadlineWarnings(nextDate, { program_start: program?.start_date, program_end: program?.end_date }),
            ...(saved?.deadline_warnings || []),
        ];
        const format = (iso) => formatDueDate(iso, today);
        showActionToast({
            message: `${goal.name}: due ${format(nextDate)}`,
            details: warnings.map((warning) => describeDeadlineWarning(warning, format)),
            tone: warnings.length > 0 ? 'warning' : 'info',
            actionLabel: 'Undo',
            onAction: () => updateGoal(goal.id, { deadline: previous }).catch(() => {}),
        });
    }, [goals, program?.end_date, program?.start_date, today, updateGoal]);
    const dueDragEnabled = Boolean(program) && !isMobile && finePointer;
    return { dueDragEnabled, onGoalDueDrop: dueDragEnabled ? onGoalDueDrop : null };
}
