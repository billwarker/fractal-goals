import React, { useState } from 'react';

import ProgramDaysNavigator from '../components/programs/days/ProgramDaysNavigator';
import { resolveDaysSelection } from '../utils/programDaysView';
import { sortProgramDays } from '../utils/programViewModel';
import { useProgramPlanOccurrences } from './useProgramSessionPlans';

/**
 * Programs page Days tab state: which program day, date, and template is being planned,
 * whether a second date is shown to compare against, the program's occurrence rails, and
 * the side-pane navigator that drives them. Program days belong to the program, so the
 * navigator lists each once and creates new ones.
 * `onLeavePane` closes the mobile side pane after a choice so the plans are visible.
 */
/** ``days`` in ``order`` (day ids); days the order doesn't name keep their place at the end. */
function applyDayOrder(days, order) {
    if (!order) return days;
    const position = new Map(order.map((id, index) => [id, index]));
    return [...days].sort((left, right) => (
        (position.get(String(left.id)) ?? order.length) - (position.get(String(right.id)) ?? order.length)
    ));
}

export default function useProgramDaysTab({
    rootId, program, today, timezone, enabled, setViewMode, onLeavePane, onCreateDay, onEditDay,
    onReorderDays = null,
}) {
    const [selection, setSelection] = useState(null);
    // One program day at a time by default; the side pane toggles a second, comparison column.
    const [compare, setCompare] = useState(false);
    // A move shows at once; the saved order replaces it once the program refreshes.
    const [pendingOrder, setPendingOrder] = useState(null);
    const days = applyDayOrder(sortProgramDays(program?.days || []), pendingOrder);
    const occurrencesQuery = useProgramPlanOccurrences(rootId, enabled ? program?.id : null, timezone);
    const resolved = resolveDaysSelection({
        days, occurrencesByDay: occurrencesQuery.data, selection, today, compare,
    });

    // Keeps the chosen dates when staying on the same day; a template brings its plan into view.
    const selectDay = (dayId, templateId = null) => {
        setSelection((current) => {
            const sameDay = String(current?.dayId) === String(dayId);
            return {
                dayId,
                date: sameDay ? current?.date || null : null,
                compareDate: sameDay ? current?.compareDate || null : null,
                templateId,
            };
        });
        onLeavePane();
    };

    const openDayPlan = (dayId, date) => {
        setSelection({ dayId, date });
        setViewMode('days');
        onLeavePane();
    };

    // A day just created or duplicated becomes the selection, so it never gets lost in the list.
    const showDay = (dayId) => {
        if (dayId) setSelection({ dayId });
    };

    const moveDay = async (dayId, offset) => {
        const ids = days.map((day) => String(day.id));
        const from = ids.indexOf(String(dayId));
        const to = from + offset;
        if (!onReorderDays || from < 0 || to < 0 || to >= ids.length) return;
        [ids[from], ids[to]] = [ids[to], ids[from]];
        setPendingOrder(ids);
        try {
            await onReorderDays(ids);
        } catch {
            // The mutation reports the failure; the saved order shows again.
        } finally {
            setPendingOrder((current) => (current === ids ? null : current));
        }
    };

    const navigator = (
        <ProgramDaysNavigator
            days={days}
            occurrencesByDay={occurrencesQuery.data}
            selectedDayId={resolved.found?.day.id || null}
            onSelectDay={(dayId) => selectDay(dayId)}
            onSelectTemplate={selectDay}
            onCreateDay={onCreateDay}
            onEditDay={onEditDay}
            onMoveDay={onReorderDays ? moveDay : null}
            today={today}
            compare={compare}
            onCompareChange={setCompare}
        />
    );

    return {
        days,
        selection,
        setSelection,
        compare,
        openDayPlan,
        showDay,
        navigator,
        resolved,
        occurrencesQuery,
    };
}
