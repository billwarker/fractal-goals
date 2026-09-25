import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agentApi } from '../../utils/api';
import { queryKeys } from '../../hooks/queryKeys';
import { FEATURE_FLAGS, isFeatureEnabled, useFeatureFlags } from '../../hooks/useFeatureFlags';

const changedRootQueryKeys = (rootId) => [
    queryKeys.goalsTree(rootId),
    queryKeys.goals(rootId),
    queryKeys.activities(rootId),
    queryKeys.programs(rootId),
    queryKeys.programCalendarRoot(rootId),
    ['program', rootId],
    queryKeys.programDayReadModelRoot(rootId),
    queryKeys.sessions(rootId),
    queryKeys.sessionRoot(rootId),
    queryKeys.sessionTemplates(rootId),
    queryKeys.fractalTree(rootId),
    queryKeys.allNotesRoot(rootId),
    queryKeys.goalNotesRoot(rootId),
    queryKeys.sessionNotesRoot(rootId),
];

export function AgentChangeSubscription({ rootId, authenticated }) {
    const queryClient = useQueryClient();
    const { flags } = useFeatureFlags({ enabled: authenticated });
    const enabled = Boolean(
        authenticated
        && rootId
        && (
            isFeatureEnabled(flags, FEATURE_FLAGS.aiAgentConnectors)
            || isFeatureEnabled(flags, FEATURE_FLAGS.aiAgentEmbedded)
        ),
    );
    const cursorQuery = useQuery({
        queryKey: queryKeys.aiChangeCursor(rootId),
        queryFn: async () => (await agentApi.getChangeCursor(rootId)).data.cursor,
        enabled,
        gcTime: Infinity,
        refetchInterval: 10_000,
        refetchOnWindowFocus: true,
    });

    useEffect(() => {
        if (!enabled || typeof cursorQuery.data !== 'number') return;
        const baselineKey = [...queryKeys.aiChangeCursor(rootId), 'observed'];
        queryClient.setQueryDefaults(baselineKey, { gcTime: Infinity });
        const previousCursor = queryClient.getQueryData(baselineKey);
        if (typeof previousCursor === 'number' && cursorQuery.data > previousCursor) {
            changedRootQueryKeys(rootId).forEach((queryKey) => {
                queryClient.invalidateQueries({ queryKey });
            });
        }
        queryClient.setQueryData(baselineKey, cursorQuery.data);
    }, [cursorQuery.data, enabled, queryClient, rootId]);

    return null;
}

export default AgentChangeSubscription;
