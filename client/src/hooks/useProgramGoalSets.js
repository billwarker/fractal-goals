import { useCallback, useMemo } from 'react';
import { buildProgramGoalScope } from '../utils/programGoalWindow';

function uniqueIds(ids = []) {
    return Array.from(new Set((ids || []).filter(Boolean)));
}

export function useProgramGoalSets({ program, goals = [], getGoalDetails }) {
    const programGoalIds = useMemo(() => program?.goal_ids || [], [program?.goal_ids]);

    const goalScope = useMemo(() => buildProgramGoalScope({
        program,
        goals,
        getGoalDetails,
    }), [getGoalDetails, goals, program]);

    const expandAssociatedGoalIds = useCallback((goalIds = []) => {
        return goalScope.expandAssociatedGoalIds(goalIds);
    }, [goalScope]);

    const directAssociatedGoalIds = useMemo(() => uniqueIds(programGoalIds), [programGoalIds]);

    const programScopeGoalIds = useMemo(() => {
        return goalScope.programScopeGoalIds;
    }, [goalScope]);

    const hierarchySeedIds = useMemo(() => {
        return goalScope.hierarchySeedIds;
    }, [goalScope]);

    const attachedGoalIds = useMemo(() => {
        return new Set(uniqueIds(expandAssociatedGoalIds(programGoalIds)));
    }, [expandAssociatedGoalIds, programGoalIds]);

    const directAssociatedGoals = useMemo(() => {
        return directAssociatedGoalIds.map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [directAssociatedGoalIds, getGoalDetails]);

    const hierarchyGoalSeeds = useMemo(() => {
        return goalScope.hierarchyGoalSeeds;
    }, [goalScope]);

    const attachedGoals = useMemo(() => {
        return Array.from(attachedGoalIds).map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [attachedGoalIds, getGoalDetails]);

    return {
        attachedGoalIds,
        attachedGoals,
        directAssociatedGoalIds,
        directAssociatedGoals,
        hierarchyGoalSeeds,
        hierarchySeedIds,
        programScopeGoalIds,
        expandAssociatedGoalIds,
    };
}

export default useProgramGoalSets;
