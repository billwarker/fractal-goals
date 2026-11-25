import { useQuery } from '@tanstack/react-query';

import { useOptionalOnboarding } from '../../contexts/OnboardingContext';
import { queryKeys } from '../../hooks/queryKeys';
import { FEATURE_FLAGS, isFeatureEnabled, useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useSyncConflicts } from '../../hooks/useSyncConflicts';
import { agentApi } from '../../utils/api';

export const SETTINGS_SECTIONS = [
    { id: 'general', label: 'General', summary: 'Timezone, theme and this fractal' },
    { id: 'styling', label: 'Goal Characteristics', summary: 'Levels, colours and icons' },
    { id: 'account', label: 'Account', summary: 'Membership, sign-in and your data' },
    { id: 'sync', label: 'Sync', summary: 'Edits made in two places' },
    { id: 'ai-connections', label: 'AI Connections', summary: 'Assistants that can use Fractal' },
    { id: 'storage', label: 'Cloud Storage', summary: 'Where your media is kept' },
    { id: 'getting-started', label: 'Getting Started', summary: 'Your onboarding checklist' },
];

/**
 * The sections this user can open. AI Connections shows while either AI flag is on, or while the
 * user still has a connection (so it can be revoked after the feature is switched off). Sync shows
 * while an edit waits to be reviewed. Goal
 * Characteristics styles a fractal's levels, so it shows only inside a fractal (`inFractal`).
 */
export function useVisibleSettingsSections({ inFractal = true } = {}) {
    const { flags } = useFeatureFlags();
    const onboarding = useOptionalOnboarding();
    const aiEnabled = isFeatureEnabled(flags, FEATURE_FLAGS.aiAgentConnectors)
        || isFeatureEnabled(flags, FEATURE_FLAGS.aiAgentEmbedded);
    const connections = useQuery({
        queryKey: queryKeys.aiConnections(),
        queryFn: async () => (await agentApi.listConnections()).data.items || [],
        enabled: !aiEnabled,
        retry: false,
        staleTime: 60 * 1000,
    });
    const { conflicts } = useSyncConflicts();
    const hasConnections = (connections.data?.length ?? 0) > 0;

    return SETTINGS_SECTIONS.filter(({ id }) => {
        if (id === 'styling') return inFractal;
        if (id === 'sync') return conflicts.length > 0;
        if (id === 'ai-connections') return aiEnabled || hasConnections;
        if (id === 'getting-started') return Boolean(onboarding?.enabled);
        return true;
    });
}
