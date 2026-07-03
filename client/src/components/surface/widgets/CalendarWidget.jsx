import React, { useMemo } from 'react';

import { useGoalLevels } from '../../../contexts/GoalLevelsContext';
import ProgramCalendarView from '../../programs/ProgramCalendarView';
import {
    buildProgramBlockLabels,
    buildProgramsCalendarEvents,
} from '../../../utils/programViewModel';

/**
 * Surface adapter for the canonical programs calendar. It intentionally keeps
 * rendering delegated to ProgramCalendarView so goals-page calendar behavior
 * stays visually aligned with the Programs page instead of drifting.
 */
export default function CalendarWidget({ sharedData }) {
    const programs = Array.isArray(sharedData?.programs) ? sharedData.programs : [];
    const goals = Array.isArray(sharedData?.goals) ? sharedData.goals : [];
    const timezone = sharedData?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const { getGoalColor, getGoalTextColor } = useGoalLevels();

    const calendarEvents = useMemo(() => buildProgramsCalendarEvents(
        programs,
        goals,
        getGoalColor,
        getGoalTextColor,
        timezone,
    ), [getGoalColor, getGoalTextColor, goals, programs, timezone]);

    const blockLabels = useMemo(() => (
        programs.flatMap((program, programIndex) => buildProgramBlockLabels({
            program,
            includeProgramId: true,
            programIndex,
        }))
    ), [programs]);

    const initialDate = useMemo(() => new Date(), []);

    return (
        <div className="surface-calendar surface-calendar-program-view" data-no-panel-drag="true">
            <ProgramCalendarView
                calendarEvents={calendarEvents}
                blockLabels={blockLabels}
                blockCreationMode={false}
                setBlockCreationMode={() => {}}
                showBlockControls={false}
                showAddBlockButton={false}
                initialDate={initialDate}
                onDateSelect={() => {}}
                onDateClick={() => {}}
                onEventClick={() => {}}
                onBlockLabelClick={() => {}}
                compact
                readOnly
            />
        </div>
    );
}
