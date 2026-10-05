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
export default function useProgramDaysTab({
    rootId, program, today, timezone, enabled, setViewMode, onLeavePane, onCreateDay, onEditDay,
}) {
    const [selection, setSelection] = useState(null);
    // One program day at a time by default; the side pane toggles a second, comparison column.
    const [compare, setCompare] = useState(false);
    const days = sortProgramDays(program?.days || []);
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

    const navigator = (
        <ProgramDaysNavigator
            days={days}
            occurrencesByDay={occurrencesQuery.data}
            selectedDayId={resolved.found?.day.id || null}
            onSelectDay={(dayId) => selectDay(dayId)}
            onSelectTemplate={selectDay}
            onCreateDay={onCreateDay}
            onEditDay={onEditDay}
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
