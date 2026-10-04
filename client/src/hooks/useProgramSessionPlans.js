import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

/**
 * Every plannable program day's dates with plan states and the canonical day status, keyed
 * by program day id (the Days tab rails). Statuses depend on the local date, so the key
 * includes the timezone.
 */
export function useProgramPlanOccurrences(rootId, programId, timezone = 'UTC') {
    return useQuery({
        queryKey: queryKeys.programPlanOccurrences(rootId, programId, timezone),
        queryFn: async () => (await fractalApi.getProgramPlanOccurrences(rootId, programId, { timezone })).data,
        select: (data) => new Map((data?.days || []).map((entry) => [String(entry.day_id), entry.dates])),
        enabled: Boolean(rootId && programId),
        staleTime: 60 * 1000,
    });
}

/**
 * Every template's plan for one occurrence, stored or seeded, plus what was logged in the
 * sessions that completed it (which sessions count depends on the local date).
 */
export function useProgramDayPlans(rootId, programId, dayId, date, timezone = 'UTC') {
    return useQuery({
        queryKey: queryKeys.programDayPlans(rootId, programId, dayId, date, timezone),
        queryFn: async () => (await fractalApi.getProgramDayPlans(rootId, programId, dayId, date, timezone)).data,
        enabled: Boolean(rootId && programId && dayId && date),
        staleTime: 30 * 1000,
    });
}

/** Plans a new session of a template can execute on a local date (Create Session). */
export function useSessionPlanCandidates(rootId, templateId, date) {
    return useQuery({
        queryKey: queryKeys.sessionPlanCandidates(rootId, templateId, date),
        queryFn: async () => (await fractalApi.getSessionPlanCandidates(rootId, templateId, date)).data,
        enabled: Boolean(rootId && templateId && date),
        staleTime: 30 * 1000,
    });
}

/**
 * Save, reset, load, and pull-template mutations for one day's plans. Loading stores an
 * optional template's seeded plan on the date; resetting an optional plan unloads it. Each returns the
 * refreshed plan entry, which replaces the cached entry before the day's
 * occurrence strip is refreshed.
 */
export function useProgramSessionPlanMutations(rootId, programId, dayId, date, timezone = 'UTC') {
    const queryClient = useQueryClient();
    const dayPlansKey = queryKeys.programDayPlans(rootId, programId, dayId, date, timezone);

    const applyEntry = (entry) => {
        queryClient.setQueryData(dayPlansKey, (current) => (current ? {
            ...current,
            // Plan writes return the plan only; keep the logged sessions already loaded for the date.
            plans: current.plans.map((plan) => (plan.template.id === entry.template.id
                ? { ...entry, logged_sessions: entry.logged_sessions ?? plan.logged_sessions }
                : plan)),
        } : current));
        queryClient.invalidateQueries({ queryKey: queryKeys.programPlanOccurrences(rootId, programId) });
        // Later occurrences may be seeded from this one.
        queryClient.invalidateQueries({
            queryKey: queryKeys.programSessionPlansRoot(rootId, programId),
            predicate: (query) => JSON.stringify(query.queryKey) !== JSON.stringify(dayPlansKey),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.programDayOptions(rootId) });
    };

    const save = useMutation({
        mutationFn: async ({ templateId, sections, rowVersion }) => (
            await fractalApi.saveProgramSessionPlan(rootId, programId, dayId, templateId, date, {
                sections,
                ...(rowVersion ? { row_version: rowVersion } : {}),
            }, timezone)
        ).data,
        onSuccess: applyEntry,
    });
    const reset = useMutation({
        mutationFn: async ({ templateId }) => (
            await fractalApi.resetProgramSessionPlan(rootId, programId, dayId, templateId, date, timezone)
        ).data,
        onSuccess: applyEntry,
    });
    const load = useMutation({
        mutationFn: async ({ templateId }) => (
            await fractalApi.loadProgramSessionPlan(rootId, programId, dayId, templateId, date, timezone)
        ).data,
        onSuccess: applyEntry,
    });
    const pullTemplate = useMutation({
        mutationFn: async ({ templateId, rowVersion }) => (
            await fractalApi.pullProgramSessionPlanTemplate(rootId, programId, dayId, templateId, date, {
                ...(rowVersion ? { row_version: rowVersion } : {}),
            }, timezone)
        ).data,
        onSuccess: applyEntry,
    });
    const refresh = () => queryClient.invalidateQueries({ queryKey: dayPlansKey });

    return { save, reset, load, pullTemplate, refresh };
}
