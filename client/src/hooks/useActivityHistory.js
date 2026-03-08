/**
 * useActivityHistory - Hook for fetching previous instances of an activity
 *
 * Shows metrics and data from past sessions for a given activity definition.
 * Useful for viewing progress and informing current session decisions.
 */

import { useQuery } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from './queryKeys';

/**
 * @param {string} rootId - ID of the fractal
 * @param {string|null} activityDefinitionId - ID of the activity definition to get history for
 * @param {string|null} excludeSessionId - Session ID to exclude from results (typically current session)
 * @param {Object} options - {limit: number}
 */
export function useActivityHistory(rootId, activityDefinitionId, excludeSessionId = null, options = {}) {
    const { limit = 10 } = options;
    const enabled = Boolean(rootId && activityDefinitionId);
    const query = useQuery({
        queryKey: queryKeys.activityHistory(rootId, activityDefinitionId, excludeSessionId, limit),
        enabled,
        retry: false,
        queryFn: async () => {
            const response = await fractalApi.getActivityHistory(
                rootId,
                activityDefinitionId,
                { limit, excludeSession: excludeSessionId }
            );
            return response.data || [];
        },
    });

    return {
        history: enabled ? (query.data || []) : [],
        loading: enabled ? query.isLoading : false,
        error: query.error ? (query.error.message || 'Failed to fetch history') : null,
    };
}

export default useActivityHistory;
