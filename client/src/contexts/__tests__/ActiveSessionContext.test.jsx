import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveSessionProvider } from '../ActiveSessionContext';

const {
    draftAutosaveMock,
    sessionDetailDataMock,
} = vi.hoisted(() => ({
    draftAutosaveMock: vi.fn(),
    sessionDetailDataMock: vi.fn(),
}));

vi.mock('../../hooks/useSessionDraftAutosave', () => ({
    default: (options) => draftAutosaveMock(options),
}));

vi.mock('../../hooks/useSessionDetailData', () => ({
    default: (options) => sessionDetailDataMock(options),
}));

vi.mock('../../hooks/useSessionDetailMutations', () => ({
    default: () => ({}),
}));

vi.mock('../../hooks/useSessionAchievementNotifications', () => ({
    default: () => {},
}));

vi.mock('../GoalsContext', () => ({
    useGoals: () => ({ setActiveRootId: vi.fn() }),
}));

function renderProvider(queryClient) {
    return (
        <QueryClientProvider client={queryClient}>
            <ActiveSessionProvider rootId="root-1" sessionId="session-1">
                <div>Session</div>
            </ActiveSessionProvider>
        </QueryClientProvider>
    );
}

describe('ActiveSessionProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionDetailDataMock.mockReturnValue({
            session: { id: 'session-1', attributes: { session_data: { sections: [] } } },
            sessionLoading: false,
            sessionError: null,
            refreshSession: vi.fn(),
            activityInstances: [],
            instancesLoading: false,
            refreshInstances: vi.fn(),
            activities: [],
            activitiesLoading: false,
            activityGroups: [],
            circuitRuns: [],
            sessionGoalsView: null,
            sessionGoalsViewLoading: false,
            normalizedSessionData: { sections: [] },
            groupMap: {},
            groupedActivities: {},
            targetAchievements: new Map(),
            achievedTargetIds: new Set(),
            goalAchievements: new Map(),
            loading: false,
        });
        draftAutosaveMock.mockReturnValue({
            setSessionDataDraft: vi.fn(),
            localSessionData: { sections: [] },
            updateSessionDataDraft: vi.fn(),
        });
    });

    it('keeps the session-data save callback stable across provider rerenders', () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        const view = render(renderProvider(queryClient));
        const initialSaveCallback = draftAutosaveMock.mock.calls.at(-1)[0].saveSessionData;

        view.rerender(renderProvider(queryClient));

        expect(draftAutosaveMock.mock.calls.at(-1)[0].saveSessionData).toBe(initialSaveCallback);
    });
});
