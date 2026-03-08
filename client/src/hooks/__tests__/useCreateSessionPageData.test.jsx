import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCreateSessionPageData } from '../useCreateSessionPageData';
import { queryKeys } from '../queryKeys';

const getSessionTemplates = vi.fn();
const getGoalsForSelection = vi.fn();
const getGoals = vi.fn();
const getActiveProgramDays = vi.fn();
const getActivities = vi.fn();
const getActivityGroups = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessionTemplates: (...args) => getSessionTemplates(...args),
        getGoalsForSelection: (...args) => getGoalsForSelection(...args),
        getGoals: (...args) => getGoals(...args),
        getActiveProgramDays: (...args) => getActiveProgramDays(...args),
        getActivities: (...args) => getActivities(...args),
        getActivityGroups: (...args) => getActivityGroups(...args),
    },
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
}

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('useCreateSessionPageData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores create-session datasets under shared query keys and derives grouped program days', async () => {
        const queryClient = createQueryClient();

        getSessionTemplates.mockResolvedValueOnce({ data: [{ id: 'template-1', name: 'Warmup' }] });
        getGoalsForSelection.mockResolvedValueOnce({ data: [{ id: 'goal-selection-1', name: 'Selection Goal' }] });
        getGoals.mockResolvedValueOnce({
            data: {
                id: 'root-1',
                name: 'Root Goal',
                children: [
                    { id: 'goal-1', name: 'Child Goal', children: [] },
                ],
            },
        });
        getActiveProgramDays.mockResolvedValueOnce({
            data: [
                {
                    program_id: 'program-1',
                    program_name: 'Program A',
                    block_id: 'block-1',
                    day_name: 'Day 1',
                    sessions: [{ template_id: 'template-1' }],
                },
                {
                    program_id: 'program-1',
                    program_name: 'Program A',
                    block_id: 'block-1',
                    day_name: 'Day 1',
                    sessions: [{ template_id: 'template-1' }],
                },
            ],
        });
        getActivities.mockResolvedValueOnce({ data: [{ id: 'activity-1', name: 'Scales' }] });
        getActivityGroups.mockResolvedValueOnce({ data: [{ id: 'group-1', name: 'Technique' }] });

        const { result } = renderHook(
            () => useCreateSessionPageData('root-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(queryClient.getQueryData(queryKeys.sessionTemplates('root-1'))).toEqual([
            { id: 'template-1', name: 'Warmup' },
        ]);
        expect(queryClient.getQueryData(queryKeys.goalsForSelection('root-1'))).toEqual([
            { id: 'goal-selection-1', name: 'Selection Goal' },
        ]);
        expect(queryClient.getQueryData(queryKeys.goalsTree('root-1'))).toEqual({
            id: 'root-1',
            name: 'Root Goal',
            children: [{ id: 'goal-1', name: 'Child Goal', children: [] }],
        });
        expect(queryClient.getQueryData(queryKeys.activeProgramDays('root-1'))).toHaveLength(2);
        expect(queryClient.getQueryData(queryKeys.activities('root-1'))).toEqual([
            { id: 'activity-1', name: 'Scales' },
        ]);
        expect(queryClient.getQueryData(queryKeys.activityGroups('root-1'))).toEqual([
            { id: 'group-1', name: 'Technique' },
        ]);

        expect(result.current.programDays).toHaveLength(1);
        expect(result.current.programsByName['Program A'].days).toHaveLength(1);
        expect(result.current.allGoals.map((goal) => goal.id)).toEqual(['root-1', 'goal-1']);
    });
});
