/**
 * useActivityHistory - Hook for fetching previous instances of an activity
 * 
 * Shows metrics and data from past sessions for a given activity definition.
 * Useful for viewing progress and informing current session decisions.
 */

import { useState, useEffect } from 'react';
import { fractalApi } from '../utils/api';

/**
 * @param {string} rootId - ID of the fractal
 * @param {string|null} activityDefinitionId - ID of the activity definition to get history for
 * @param {string|null} excludeSessionId - Session ID to exclude from results (typically current session)
 * @param {Object} options - {limit: number}
 */
export function useActivityHistory(rootId, activityDefinitionId, excludeSessionId = null, options = {}) {
    const { limit = 10 } = options;

    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Reset state when no activity is selected
        if (!rootId || !activityDefinitionId) {
            setHistory([]);
            setLoading(false);
            return;
        }

        const fetchHistory = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fractalApi.getActivityHistory(
                    rootId,
                    activityDefinitionId,
                    { limit, excludeSession: excludeSessionId }
                );
                setHistory(response.data || []);
            } catch (err) {
                console.error('Failed to fetch activity history:', err);
                setError(err.message || 'Failed to fetch history');
                setHistory([]);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [rootId, activityDefinitionId, excludeSessionId, limit]);

    return {
        history,
        loading,
        error
    };
}

export default useActivityHistory;
