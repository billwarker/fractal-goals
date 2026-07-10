import { useQuery } from '@tanstack/react-query';

import { globalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

export const FEATURE_FLAGS = {
    goalSurfaceConfiguration: 'goal_surface_configuration',
    analyticsSqlExplorer: 'analytics_sql_explorer',
    onboarding: 'onboarding_v1',
};

const DEFAULT_FLAGS = {
    [FEATURE_FLAGS.goalSurfaceConfiguration]: false,
    [FEATURE_FLAGS.analyticsSqlExplorer]: false,
    [FEATURE_FLAGS.onboarding]: false,
};

export function normalizeFeatureFlags(flags) {
    return {
        ...DEFAULT_FLAGS,
        ...(flags || {}),
    };
}

export function useFeatureFlags({ enabled = true } = {}) {
    const query = useQuery({
        queryKey: queryKeys.featureFlags(),
        queryFn: async () => {
            const response = await globalApi.getFeatureFlags();
            return normalizeFeatureFlags(response.data?.flags);
        },
        staleTime: 60 * 1000,
        enabled,
    });

    return {
        flags: normalizeFeatureFlags(query.data),
        isLoading: query.isLoading,
        error: query.error,
    };
}

export function isFeatureEnabled(flags, key) {
    return normalizeFeatureFlags(flags)[key] === true;
}
