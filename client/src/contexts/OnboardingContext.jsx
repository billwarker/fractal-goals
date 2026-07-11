import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

import { buildOnboardingSteps } from '../components/onboarding/onboardingSteps';
import { FEATURE_FLAGS, isFeatureEnabled, useFeatureFlags } from '../hooks/useFeatureFlags';
import { queryKeys } from '../hooks/queryKeys';
import { authApi } from '../utils/api';
import { getLevelWord } from '../utils/goalHelpers';
import { trackEvent } from '../utils/telemetry';
import { useAuth } from './AuthContext';

const OnboardingContext = createContext(null);
const FRACTAL_ROUTE_SECTIONS = new Set([
    'analytics', 'create-session', 'goals', 'logs', 'manage-activities',
    'notes', 'programs', 'sessions', 'templates',
]);

export function getOnboardingRootId(pathname) {
    const parts = pathname.split('/').filter(Boolean);
    return parts.length >= 2 && FRACTAL_ROUTE_SECTIONS.has(parts[1]) ? parts[0] : null;
}

export function OnboardingProvider({ children }) {
    const { user, isAuthenticated } = useAuth();
    const { flags } = useFeatureFlags({ enabled: isAuthenticated });
    const enabled = isAuthenticated && isFeatureEnabled(flags, FEATURE_FLAGS.onboarding);
    const queryClient = useQueryClient();
    const location = useLocation();
    const rootId = getOnboardingRootId(location.pathname);
    const queryKey = queryKeys.onboarding(user?.id, rootId);
    const query = useQuery({
        queryKey,
        queryFn: async () => (await authApi.getOnboarding(rootId)).data,
        enabled: Boolean(enabled && user?.id),
        staleTime: 15_000,
    });
    // Observe the user's fractal summaries cache (owned by Selection/app header)
    // reactively so the root's level word is available once loaded, without
    // triggering a fetch of our own.
    const fractalsQuery = useQuery({
        queryKey: queryKeys.fractals(user?.id),
        enabled: false,
    });
    const state = query.data || null;
    const previousStepsRef = useRef(null);

    const mutation = useMutation({
        mutationFn: async (changes) => (await authApi.updateOnboarding({
            revision: state?.revision || 0,
            root_id: rootId,
            ...changes,
        })).data,
        onSuccess: (nextState) => queryClient.setQueryData(queryKey, nextState),
        onError: (error) => {
            const current = error?.response?.data?.current;
            if (current) queryClient.setQueryData(queryKey, current);
        },
    });
    const mutateOnboarding = mutation.mutateAsync;

    const update = useCallback((changes) => mutateOnboarding(changes), [mutateOnboarding]);
    const dismiss = useCallback(async () => {
        await update({ status: 'dismissed' });
        trackEvent('onboarding_dismissed');
    }, [update]);
    const resume = useCallback(async () => {
        await update({ status: 'active' });
        trackEvent('onboarding_started');
    }, [update]);
    const restart = useCallback(() => update({ restart: true }), [update]);
    const markVisited = useCallback((key) => update({
        visited: [...new Set([...(state?.visited || []), key])],
    }), [state?.visited, update]);

    useEffect(() => {
        if (enabled && state && !state.persisted && state.status === 'active' && !mutation.isPending) {
            resume();
        }
    }, [enabled, mutation.isPending, resume, state]);

    useEffect(() => {
        if (!enabled || state?.status !== 'active') return;
        const section = location.pathname.split('/').filter(Boolean)[1];
        if (section === 'analytics' || section === 'notes' || section === 'programs') {
            if (!state.visited?.includes(section)) markVisited(section);
        }
    }, [enabled, location.pathname, markVisited, state?.status, state?.visited]);

    useEffect(() => {
        if (!enabled || !state?.steps) return;
        const previous = previousStepsRef.current;
        if (previous) {
            for (const [stepId, done] of Object.entries(state.steps)) {
                if (done && !previous[stepId]) {
                    trackEvent('onboarding_step_completed', { props: { step_id: stepId } });
                }
            }
            if (state.status === 'completed' && Object.values(previous).some((done) => !done)) {
                trackEvent('onboarding_completed');
            }
        }
        previousStepsRef.current = state.steps;
    }, [enabled, state?.status, state?.steps]);

    const rootLevelWord = useMemo(() => {
        if (!rootId) return undefined;
        const fractals = fractalsQuery.data;
        const root = Array.isArray(fractals) ? fractals.find((f) => f.id === rootId) : null;
        return root?.type ? getLevelWord(root.type).toLowerCase() : undefined;
    }, [fractalsQuery.data, rootId]);
    const steps = useMemo(
        () => buildOnboardingSteps(state, rootId, { level: rootLevelWord }),
        [rootId, state, rootLevelWord],
    );
    const completedCount = steps.filter((step) => step.done).length;
    const value = useMemo(() => ({
        enabled, state, steps, completedCount, rootId,
        isLoading: query.isLoading, isSaving: mutation.isPending,
        dismiss, resume, restart, markVisited,
        update,
        refresh: query.refetch,
    }), [completedCount, dismiss, enabled, markVisited, mutation.isPending, query.isLoading, query.refetch, restart, resume, rootId, state, steps, update]);

    return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
    const context = useContext(OnboardingContext);
    if (!context) throw new Error('useOnboarding must be used within OnboardingProvider');
    return context;
}

export function useOptionalOnboarding() {
    return useContext(OnboardingContext);
}
