import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFlowTreeEvidence, useFlowtreeSessionMetrics, useSessionNotes, useSessionsHeatmap, useSessionsSearch } from '../useSessionQueries';

const getSessionNotes = vi.fn();
const getSessions = vi.fn();
const getSessionsHeatmap = vi.fn();
const getSessionEvidenceGoals = vi.fn();
const getFlowtreeSessionMetrics = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessions: (...args) => getSessions(...args),
        getSessionsHeatmap: (...args) => getSessionsHeatmap(...args),
        getSessionNotes: (...args) => getSessionNotes(...args),
        getSessionEvidenceGoals: (...args) => getSessionEvidenceGoals(...args),
        getFlowtreeSessionMetrics: (...args) => getFlowtreeSessionMetrics(...args),
    }
}));

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    };
}

describe('useSessionNotes', () => {
    it('stores fetched notes under the shared session-notes query key', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                }
            }
        });

        getSessionNotes.mockResolvedValueOnce({
            data: [{ id: 'note-1', content: 'Session note' }]
        });

        const { result } = renderHook(
            () => useSessionNotes('root-1', 'session-1'),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.notes).toEqual([{ id: 'note-1', content: 'Session note' }]);
        });

        expect(queryClient.getQueryData(['session-notes', 'root-1', 'session-1'])).toEqual([
            { id: 'note-1', content: 'Session note' }
        ]);
    });
});

describe('useSessionsSearch', () => {
    it('stores paginated results under the normalized shared sessions-search key', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                }
            }
        });

        getSessions.mockResolvedValueOnce({
            data: {
                sessions: [{ id: 'session-1', name: 'Session 1' }],
                pagination: { offset: 0, limit: 10, total: 1, has_more: false },
            }
        });

        const filters = {
            completed: 'completed',
            sort_by: 'updated_at',
            sort_order: 'asc',
            timezone: 'UTC',
            activity_ids: ['activity-2', 'activity-1'],
            goal_ids: ['goal-2', 'goal-1'],
            range_start: '2026-01-01',
            range_end: '2026-01-31',
        };

        const { result } = renderHook(
            () => useSessionsSearch('root-1', filters),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.data?.pages?.[0]?.sessions).toEqual([{ id: 'session-1', name: 'Session 1' }]);
        });

        expect(getSessions).toHaveBeenCalledWith('root-1', {
            completed: 'completed',
            sort_by: 'updated_at',
            sort_order: 'asc',
            timezone: 'UTC',
            activity_ids: ['activity-1', 'activity-2'],
            goal_ids: ['goal-1', 'goal-2'],
            range_start: '2026-01-01',
            range_end: '2026-01-31',
            limit: 10,
            offset: 0,
        });

        expect(queryClient.getQueryData([
            'sessions',
            'root-1',
            'search',
            {
                completed: 'completed',
                sort_by: 'updated_at',
                sort_order: 'asc',
                timezone: 'UTC',
                activity_ids: ['activity-1', 'activity-2'],
                goal_ids: ['goal-1', 'goal-2'],
                range_start: '2026-01-01',
                range_end: '2026-01-31',
            }
        ])).toBeDefined();
    });
});

describe('useSessionsHeatmap', () => {
    it('stores heatmap results under the normalized shared sessions-heatmap key', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                }
            }
        });

        getSessionsHeatmap.mockResolvedValueOnce({
            data: {
                total_sessions: 2,
                max_count: 1,
                days: [
                    { date: '2026-01-10', count: 1 },
                    { date: '2026-01-09', count: 1 },
                ],
            }
        });

        const filters = {
            timezone: 'UTC',
            activity_ids: ['activity-2', 'activity-1'],
        };

        const { result } = renderHook(
            () => useSessionsHeatmap('root-1', filters),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(result.current.data?.total_sessions).toBe(2);
        });

        expect(getSessionsHeatmap).toHaveBeenCalledWith('root-1', {
            completed: 'all',
            sort_by: 'session_start',
            sort_order: 'desc',
            timezone: 'UTC',
            activity_ids: ['activity-1', 'activity-2'],
        });
    });
});

describe('FlowTree session evidence hooks', () => {
    it('uses the configured active window in evidence and metrics queries', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                }
            }
        });

        getSessionEvidenceGoals.mockResolvedValueOnce({
            data: { goal_ids: ['goal-1'], window_days: 14 },
        });
        getFlowtreeSessionMetrics.mockResolvedValueOnce({
            data: { window_days: 14, completed_instances_count: 1 },
        });

        const { result: evidenceResult } = renderHook(
            () => useFlowTreeEvidence('root-1', 14),
            { wrapper: createWrapper(queryClient) }
        );
        const { result: metricsResult } = renderHook(
            () => useFlowtreeSessionMetrics('root-1', ['goal-1'], { enabled: true, days: 14 }),
            { wrapper: createWrapper(queryClient) }
        );

        await waitFor(() => {
            expect(evidenceResult.current.data?.window_days).toBe(14);
            expect(metricsResult.current.data?.window_days).toBe(14);
        });

        expect(getSessionEvidenceGoals).toHaveBeenCalledWith('root-1', { days: 14 });
        expect(getFlowtreeSessionMetrics).toHaveBeenCalledWith('root-1', {
            goal_ids: ['goal-1'],
            days: 14,
        });
        expect(queryClient.getQueryData(['sessions', 'root-1', 'evidence-goals', 14])).toEqual({
            goal_ids: ['goal-1'],
            window_days: 14,
        });
        expect(queryClient.getQueryData(['sessions', 'root-1', 'flowtree-metrics', ['goal-1'], 14])).toEqual({
            window_days: 14,
            completed_instances_count: 1,
        });
    });
});
