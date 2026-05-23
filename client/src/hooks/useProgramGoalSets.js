import { useCallback, useMemo } from 'react';
import { buildProgramGoalScope } from '../utils/programGoalWindow';

function uniqueIds(ids = []) {
    return Array.from(new Set((ids || []).filter(Boolean)));
}

export function useProgramGoalSets({ program, goals = [], getGoalDetails }) {
    const blocks = useMemo(() => program?.blocks || [], [program?.blocks]);
    const programGoalIds = useMemo(() => program?.goal_ids || [], [program?.goal_ids]);
    const blockGoalIds = useMemo(() => uniqueIds(blocks.flatMap((block) => block.goal_ids || [])), [blocks]);

    const goalScope = useMemo(() => buildProgramGoalScope({
        program,
        goals,
        getGoalDetails,
    }), [getGoalDetails, goals, program]);

    const expandAssociatedGoalIds = useCallback((goalIds = []) => {
        return goalScope.expandAssociatedGoalIds(goalIds);
    }, [goalScope]);

    const directAssociatedGoalIds = useMemo(() => uniqueIds([
        ...programGoalIds,
        ...blockGoalIds,
    ]), [blockGoalIds, programGoalIds]);

    const programScopeGoalIds = useMemo(() => {
        return goalScope.programScopeGoalIds;
    }, [goalScope]);

    const hierarchySeedIds = useMemo(() => {
        return goalScope.hierarchySeedIds;
    }, [goalScope]);

    const attachedGoalIds = useMemo(() => {
        return new Set(uniqueIds([
            ...expandAssociatedGoalIds(programGoalIds),
            ...blockGoalIds,
        ]));
    }, [blockGoalIds, expandAssociatedGoalIds, programGoalIds]);

    const directAssociatedGoals = useMemo(() => {
        return directAssociatedGoalIds.map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [directAssociatedGoalIds, getGoalDetails]);

    const attachableBlockGoalIds = useMemo(() => {
        const scopedGoalIds = expandAssociatedGoalIds(programScopeGoalIds);

        return uniqueIds([
            ...scopedGoalIds,
            ...blockGoalIds,
        ]);
    }, [blockGoalIds, expandAssociatedGoalIds, programScopeGoalIds]);

    const attachableBlockGoals = useMemo(() => {
        return attachableBlockGoalIds.map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [attachableBlockGoalIds, getGoalDetails]);

    const hierarchyGoalSeeds = useMemo(() => {
        return goalScope.hierarchyGoalSeeds;
    }, [goalScope]);

    const attachedGoals = useMemo(() => {
        return Array.from(attachedGoalIds).map((goalId) => getGoalDetails(goalId)).filter(Boolean);
    }, [attachedGoalIds, getGoalDetails]);

    return {
        attachedGoalIds,
        attachedGoals,
        attachableBlockGoalIds,
        attachableBlockGoals,
        blockGoalIds,
        directAssociatedGoalIds,
        directAssociatedGoals,
        hierarchyGoalSeeds,
        hierarchySeedIds,
        programScopeGoalIds,
        expandAssociatedGoalIds,
    };
}

export default useProgramGoalSets;
