import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCreateSessionPageData } from '../useCreateSessionPageData';
import { queryKeys } from '../queryKeys';

const getSessionTemplates = vi.fn();
const getGoals = vi.fn();
const getActiveProgramDays = vi.fn();
const getPrograms = vi.fn();
const getActivities = vi.fn();
const getActivityGroups = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessionTemplates: (...args) => getSessionTemplates(...args),
        getGoals: (...args) => getGoals(...args),
        getActiveProgramDays: (...args) => getActiveProgramDays(...args),
        getPrograms: (...args) => getPrograms(...args),
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
                    program_color: '#22c55e',
                    day_id: 'day-1',
                    block_id: 'block-1',
                    day_name: 'Day 1',
                    sessions: [{ template_id: 'template-1' }],
                },
                {
                    program_id: 'program-2',
                    program_name: 'Program A',
                    day_id: 'day-2',
                    block_id: 'block-1',
                    day_name: 'Day 1',
                    sessions: [{ template_id: 'template-1' }],
                },
                {
                    program_id: 'program-1',
                    program_name: 'Program A',
                    day_id: 'day-3',
                    block_id: 'block-1',
                    day_name: 'Day 1',
                    sessions: [{ template_id: 'template-1' }],
                },
            ],
        });
        getPrograms.mockResolvedValueOnce({
            data: [{
                id: 'program-1',
                name: 'Program A',
                start_date: '2026-08-01',
                end_date: '2026-08-31',
            }],
        });
        getActivities.mockResolvedValueOnce({ data: [{ id: 'activity-1', name: 'Scales' }] });
        getActivityGroups.mockResolvedValueOnce({ data: [{ id: 'group-1', name: 'Technique' }] });

        const { result } = renderHook(
            () => useCreateSessionPageData('root-1', '2026-08-23'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(queryClient.getQueryData(queryKeys.sessionTemplates('root-1'))).toEqual([
            { id: 'template-1', name: 'Warmup' },
        ]);
        expect(queryClient.getQueryData(queryKeys.goalsTree('root-1'))).toEqual({
            id: 'root-1',
            name: 'Root Goal',
            children: [{ id: 'goal-1', name: 'Child Goal', children: [] }],
        });
        expect(queryClient.getQueryData(queryKeys.activeProgramDays('root-1', '2026-08-23'))).toHaveLength(3);
        expect(queryClient.getQueryData(queryKeys.programs('root-1'))).toHaveLength(1);
        expect(queryClient.getQueryData(queryKeys.activities('root-1'))).toEqual([
            { id: 'activity-1', name: 'Scales' },
        ]);
        expect(queryClient.getQueryData(queryKeys.activityGroups('root-1'))).toEqual([
            { id: 'group-1', name: 'Technique' },
        ]);

        expect(result.current.programDays).toHaveLength(3);
        expect(Object.keys(result.current.programsById)).toEqual(['program-1', 'program-2']);
        expect(result.current.programsById['program-1'].days).toHaveLength(2);
        expect(result.current.programsById['program-1'].program_color).toBe('#22c55e');
        expect(result.current.activeProgram?.id).toBe('program-1');
        expect(result.current.goalTree.id).toBe('root-1');
        expect(result.current.allGoals.map((goal) => goal.id)).toEqual(['root-1', 'goal-1']);
        expect(getActiveProgramDays).toHaveBeenCalledWith('root-1', '2026-08-23');
    });

    it('retains the underway program when no program day is scheduled today', async () => {
        const queryClient = createQueryClient();
        getSessionTemplates.mockResolvedValueOnce({ data: [] });
        getGoals.mockResolvedValueOnce({ data: null });
        getActiveProgramDays.mockResolvedValueOnce({ data: [] });
        getPrograms.mockResolvedValueOnce({ data: [{
            id: 'program-1', name: 'Q4 2026', color: '#ef4444',
            start_date: '2026-08-01', end_date: '2026-08-31',
        }] });
        getActivities.mockResolvedValueOnce({ data: [] });
        getActivityGroups.mockResolvedValueOnce({ data: [] });

        const { result } = renderHook(
            () => useCreateSessionPageData('root-1', '2026-08-23'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.programDays).toEqual([]);
        expect(result.current.activeProgram).toEqual(expect.objectContaining({
            id: 'program-1', name: 'Q4 2026', color: '#ef4444',
        }));
    });
});
