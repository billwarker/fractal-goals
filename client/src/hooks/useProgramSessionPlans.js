import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

/** A day's occurrence dates with each template's plan state (the Days tab date strip). */
export function useProgramPlanOccurrences(rootId, programId, dayId) {
    return useQuery({
        queryKey: queryKeys.programPlanOccurrences(rootId, programId, dayId),
        queryFn: async () => (await fractalApi.getProgramDayPlanOccurrences(rootId, programId, dayId)).data,
        enabled: Boolean(rootId && programId && dayId),
        staleTime: 60 * 1000,
    });
}

/** Every template's plan for one occurrence, stored or seeded. */
export function useProgramDayPlans(rootId, programId, dayId, date) {
    return useQuery({
        queryKey: queryKeys.programDayPlans(rootId, programId, dayId, date),
        queryFn: async () => (await fractalApi.getProgramDayPlans(rootId, programId, dayId, date)).data,
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
 * Save, reset, and pull-template mutations for one day's plans. Each returns the
 * refreshed plan entry, which replaces the cached entry before the day's
 * occurrence strip is refreshed.
 */
export function useProgramSessionPlanMutations(rootId, programId, dayId, date) {
    const queryClient = useQueryClient();
    const dayPlansKey = queryKeys.programDayPlans(rootId, programId, dayId, date);

    const applyEntry = (entry) => {
        queryClient.setQueryData(dayPlansKey, (current) => (current ? {
            ...current,
            plans: current.plans.map((plan) => (plan.template.id === entry.template.id ? entry : plan)),
        } : current));
        queryClient.invalidateQueries({ queryKey: queryKeys.programPlanOccurrences(rootId, programId, dayId) });
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
            })
        ).data,
        onSuccess: applyEntry,
    });
    const reset = useMutation({
        mutationFn: async ({ templateId }) => (
            await fractalApi.resetProgramSessionPlan(rootId, programId, dayId, templateId, date)
        ).data,
        onSuccess: applyEntry,
    });
    const pullTemplate = useMutation({
        mutationFn: async ({ templateId, rowVersion }) => (
            await fractalApi.pullProgramSessionPlanTemplate(rootId, programId, dayId, templateId, date, {
                ...(rowVersion ? { row_version: rowVersion } : {}),
            })
        ).data,
        onSuccess: applyEntry,
    });
    const refresh = () => queryClient.invalidateQueries({ queryKey: dayPlansKey });

    return { save, reset, pullTemplate, refresh };
}
