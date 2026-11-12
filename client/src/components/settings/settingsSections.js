import { useQuery } from '@tanstack/react-query';

import { useOptionalOnboarding } from '../../contexts/OnboardingContext';
import { queryKeys } from '../../hooks/queryKeys';
import { FEATURE_FLAGS, isFeatureEnabled, useFeatureFlags } from '../../hooks/useFeatureFlags';
import { agentApi } from '../../utils/api';

export const SETTINGS_SECTIONS = [
    { id: 'general', label: 'General', summary: 'Timezone, theme and this fractal' },
    { id: 'styling', label: 'Goal Characteristics', summary: 'Levels, colours and icons' },
    { id: 'account', label: 'Account', summary: 'Membership, sign-in and your data' },
    { id: 'ai-connections', label: 'AI Connections', summary: 'Assistants that can use Fractal' },
    { id: 'storage', label: 'Cloud Storage', summary: 'Where your media is kept' },
    { id: 'getting-started', label: 'Getting Started', summary: 'Your onboarding checklist' },
];

/**
 * The sections this user can open. AI Connections shows while either AI flag is on, or while the
 * user still has a connection (so it can be revoked after the feature is switched off).
 */
export function useVisibleSettingsSections() {
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
    const hasConnections = (connections.data?.length ?? 0) > 0;

    return SETTINGS_SECTIONS.filter(({ id }) => {
        if (id === 'ai-connections') return aiEnabled || hasConnections;
        if (id === 'getting-started') return Boolean(onboarding?.enabled);
        return true;
    });
}
