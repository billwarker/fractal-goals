import { useEffect, useMemo, useRef, useState } from 'react';

import { buildTodayProgramDayView, programSessionToTemplate } from '../utils/createSessionProgramDay';
import { getActiveProgramBlock } from '../utils/programGoalWindow';
import { getProgramMetricScopeGoalIds } from '../utils/programScope';
import { useCreateSessionPreferences } from './useCreateSessionPreferences';

export function useCreateSessionProgramContext({
    rootId, userId, todayISO, programDays, selectedProgramDay, activeProgram,
    goalTree, allGoals, manualGoalIds, quickTemplateSelected,
}) {
    const { isProgramScopeEnabled, setProgramScopeEnabled, isHydrated } = useCreateSessionPreferences({ rootId, userId });
    const todayProgramView = useMemo(() => buildTodayProgramDayView(programDays), [programDays]);
    const activeBlock = useMemo(
        () => getActiveProgramBlock(activeProgram, todayISO),
        [activeProgram, todayISO],
    );
    const programContext = useMemo(() => {
        if (selectedProgramDay) return selectedProgramDay;
        if (!activeProgram) return null;
        return {
            program_id: activeProgram.id,
            program_name: activeProgram.name,
            program_color: activeProgram.color,
            program_goal_ids: activeProgram.goal_ids || activeProgram.selected_goals || [],
            ...(Array.isArray(activeProgram.scope_seed_goal_ids) ? {
                scope_seed_goal_ids: activeProgram.scope_seed_goal_ids,
            } : {}),
            ...(Array.isArray(activeProgram.scope_goal_ids) ? {
                scope_goal_ids: activeProgram.scope_goal_ids,
            } : {}),
            ...(activeBlock ? {
                block_id: activeBlock.id,
                block_name: activeBlock.name,
                block_color: activeBlock.color || activeProgram.color,
            } : {}),
        };
    }, [activeBlock, activeProgram, selectedProgramDay]);
    const programScopeAvailable = Boolean(programContext) && !quickTemplateSelected;
    const programScopeEnabled = Boolean(
        isHydrated && programScopeAvailable && isProgramScopeEnabled(programContext?.program_id),
    );
    const scopeGoalIds = useMemo(
        () => programScopeEnabled && goalTree
            ? getProgramMetricScopeGoalIds(programContext, goalTree)
            : null,
        [goalTree, programContext, programScopeEnabled],
    );
    const scopedGoals = useMemo(
        () => scopeGoalIds
            ? allGoals.filter((goal) => scopeGoalIds.has(String(goal.id ?? goal.attributes?.id)))
            : allGoals,
        [allGoals, scopeGoalIds],
    );
    const offScopeManualGoalIds = useMemo(
        () => scopeGoalIds
            ? manualGoalIds.filter((goalId) => !scopeGoalIds.has(String(goalId)))
            : [],
        [manualGoalIds, scopeGoalIds],
    );
    const setScopeEnabled = (enabled) => setProgramScopeEnabled(programContext?.program_id, enabled);

    return {
        todayProgramView, primaryTodayProgramDay: todayProgramView.days[0] || null,
        programContext, programScopeAvailable, programScopeEnabled,
        scopedGoals, offScopeManualGoalIds, setScopeEnabled,
    };
}

export function useCreateSessionAutoSelection({
    loading, programDays, searchParams, setSearchParams, sessionSource,
    setSelectedProgramId, setSessionSource, setSelectedProgramDay,
    setSelectedProgramSession, setSelectedTemplate,
}) {
    const [deepLinkNotice, setDeepLinkNotice] = useState(null);
    const hasAutoSelectedRef = useRef(false);

    /* eslint-disable react-hooks/set-state-in-effect -- Resolved query data initializes one-shot route selection state. */
    useEffect(() => {
        if (loading || hasAutoSelectedRef.current) return;
        const deepLinkedDayId = searchParams.get('program_day_id');
        const matchedDay = deepLinkedDayId
            ? programDays.find((day) => String(day.day_id) === deepLinkedDayId)
            : null;
        const onlyDay = programDays.length === 1 ? programDays[0] : null;
        const requiredSessions = (onlyDay?.sessions || []).filter((session) => session.is_required !== false);
        const autoDay = deepLinkedDayId ? matchedDay : (!sessionSource && requiredSessions.length === 1 ? onlyDay : null);
        if (!deepLinkedDayId && !autoDay) return;

        hasAutoSelectedRef.current = true;
        if (deepLinkedDayId) {
            if (!matchedDay) setDeepLinkNotice('That program day isn’t scheduled for today.');
            setSearchParams({}, { replace: true });
        }
        if (!autoDay) return;
        const autoSession = deepLinkedDayId
            ? (autoDay.sessions?.length === 1 ? autoDay.sessions[0] : null)
            : requiredSessions[0];
        setSelectedProgramId(String(autoDay.program_id));
        setSessionSource('program');
        setSelectedProgramDay(autoDay);
        if (autoSession) {
            setSelectedProgramSession(autoSession);
            setSelectedTemplate(programSessionToTemplate(autoSession));
        }
    }, [
        loading, programDays, searchParams, sessionSource, setSearchParams,
        setSelectedProgramDay, setSelectedProgramId, setSelectedProgramSession,
        setSelectedTemplate, setSessionSource,
    ]);
    /* eslint-enable react-hooks/set-state-in-effect */

    return { deepLinkNotice, setDeepLinkNotice };
}
