import { useMemo } from 'react';

import {
    buildBlockGoalsByBlockId,
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
    getGoalDetails,
    attachBlockId,
    attachedGoalIds,
    hierarchyGoalSeeds,
}) {
    const sortedBlocks = useMemo(() => sortProgramBlocks(program?.blocks || []), [program?.blocks]);

    const programDaysMap = useMemo(() => buildProgramDaysMap(program?.blocks || []), [program?.blocks]);

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

    const associatedGoals = useMemo(() => {
        return Array.from(attachedGoalIds || [])
            .map((goalId) => getGoalDetails(goalId))
            .filter(Boolean);
    }, [attachedGoalIds, getGoalDetails]);

    const blockGoalsByBlockId = useMemo(() => buildBlockGoalsByBlockId({
        sortedBlocks,
        associatedGoals,
    }), [associatedGoals, sortedBlocks]);

    const attachBlock = useMemo(() => {
        return sortedBlocks.find((block) => block.id === attachBlockId) || null;
    }, [attachBlockId, sortedBlocks]);

    return {
        sortedBlocks,
        calendarEvents,
        blockLabels,
        activeBlock,
        attachBlock,
        programDaysMap,
        blockGoalsByBlockId,
        hierarchyGoalSeeds,
    };
}

export default useProgramDetailViewModel;
