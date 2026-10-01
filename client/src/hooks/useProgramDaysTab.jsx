import React, { useState } from 'react';

import ProgramDaysNavigator from '../components/programs/days/ProgramDaysNavigator';
import { resolveDaysSelection } from '../utils/programDaysView';
import { useProgramPlanOccurrences } from './useProgramSessionPlans';

/**
 * Programs page Days tab state: which program day, date, and template is being planned,
 * whether a second date is shown to compare against, the program's occurrence rails, and
 * the side-pane navigator that drives them.
 * `onLeavePane` closes the mobile side pane after a choice so the plans are visible.
 */
export default function useProgramDaysTab({
    rootId, programId, blocks, today, timezone, enabled, setViewMode, onLeavePane,
}) {
    const [selection, setSelection] = useState(null);
    // One program day at a time by default; the side pane toggles a second, comparison column.
    const [compare, setCompare] = useState(false);
    const occurrencesQuery = useProgramPlanOccurrences(rootId, enabled ? programId : null, timezone);
    const resolved = resolveDaysSelection({
        blocks, occurrencesByDay: occurrencesQuery.data, selection, today, compare,
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

    const navigator = (
        <ProgramDaysNavigator
            blocks={blocks}
            selectedDayId={resolved.found?.day.id || null}
            onSelectDay={(dayId) => selectDay(dayId)}
            onSelectTemplate={selectDay}
            compare={compare}
            onCompareChange={setCompare}
        />
    );

    return {
        selection,
        setSelection,
        compare,
        openDayPlan,
        navigator,
        resolved,
        occurrencesQuery,
    };
}
