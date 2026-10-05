import { useMemo } from 'react';

import {
    buildProgramBlockLabels,
    buildProgramCalendarEvents,
    buildProgramDaysMap,
    sortProgramBlocks,
} from '../utils/programViewModel';
import { isBlockActive } from '../utils/programUtils.jsx';

export function useProgramDetailViewModel({
    program,
    goals = [],
    sessions = [],
    timezone,
    getGoalColor,
    getGoalTextColor,
    attachedGoalIds,
    hierarchyGoalSeeds,
}) {
    const sortedBlocks = useMemo(() => sortProgramBlocks(program?.blocks || []), [program?.blocks]);

    const programDaysMap = useMemo(() => buildProgramDaysMap(program), [program]);

    const calendarEvents = useMemo(() => buildProgramCalendarEvents({
        program,
        goals,
        sessions,
        timezone,
        getGoalColor,
        getGoalTextColor,
        attachedGoalIds,
    }), [
        attachedGoalIds,
        getGoalColor,
        getGoalTextColor,
        goals,
        program,
        sessions,
        timezone,
    ]);

    const blockLabels = useMemo(() => buildProgramBlockLabels({
        program,
    }), [program]);

    const activeBlock = useMemo(() => {
        return program?.blocks?.find((block) => isBlockActive(block)) || null;
    }, [program?.blocks]);

    return {
        sortedBlocks,
        calendarEvents,
        blockLabels,
        activeBlock,
        programDaysMap,
        hierarchyGoalSeeds,
    };
}

export default useProgramDetailViewModel;
