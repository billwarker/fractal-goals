import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivitiesProvider, useActivities } from '../ActivitiesContext';

const {
    createActivityGroup,
    updateActivityGroup,
    deleteActivityGroup,
    reorderActivityGroups,
    setActivityGroupGoals,
    notify,
} = vi.hoisted(() => ({
    createActivityGroup: vi.fn(),
    updateActivityGroup: vi.fn(),
    deleteActivityGroup: vi.fn(),
    reorderActivityGroups: vi.fn(),
    setActivityGroupGoals: vi.fn(),
    notify: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        createActivityGroup: (...args) => createActivityGroup(...args),
        updateActivityGroup: (...args) => updateActivityGroup(...args),
        deleteActivityGroup: (...args) => deleteActivityGroup(...args),
        reorderActivityGroups: (...args) => reorderActivityGroups(...args),
        setActivityGroupGoals: (...args) => setActivityGroupGoals(...args),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: notify,
}));

function createWrapper(queryClient) {
    return function Wrapper({ children }) {
        return (
            <QueryClientProvider client={queryClient}>
                <ActivitiesProvider>{children}</ActivitiesProvider>
            </QueryClientProvider>
        );
    };
}

describe('ActivitiesContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows activity group create/update/delete success and error toasts', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        createActivityGroup.mockResolvedValueOnce({ data: { id: 'group-1', name: 'Strength' } });
        updateActivityGroup.mockResolvedValueOnce({ data: { id: 'group-1', name: 'Strength 2' } });
        deleteActivityGroup.mockResolvedValueOnce({ data: { ok: true } });
        createActivityGroup.mockRejectedValueOnce(new Error('Create failed'));
        updateActivityGroup.mockRejectedValueOnce(new Error('Update failed'));
        deleteActivityGroup.mockRejectedValueOnce(new Error('Delete failed'));

        const { result } = renderHook(() => useActivities(), {
            wrapper: createWrapper(queryClient),
        });

        await act(async () => {
            await result.current.createActivityGroup('root-1', { name: 'Strength' });
            await result.current.updateActivityGroup('root-1', 'group-1', { name: 'Strength 2' });
            await result.current.deleteActivityGroup('root-1', 'group-1');
        });

        await expect(result.current.createActivityGroup('root-1', { name: 'Strength' })).rejects.toThrow('Create failed');
        await expect(result.current.updateActivityGroup('root-1', 'group-1', { name: 'Strength 2' })).rejects.toThrow('Update failed');
        await expect(result.current.deleteActivityGroup('root-1', 'group-1')).rejects.toThrow('Delete failed');

        expect(notify.success).toHaveBeenCalledWith('Created group "Strength"');
        expect(notify.success).toHaveBeenCalledWith('Updated group "Strength 2"');
        expect(notify.success).toHaveBeenCalledWith('Deleted group');
        expect(notify.error).toHaveBeenCalledWith('Failed to create group: Create failed');
        expect(notify.error).toHaveBeenCalledWith('Failed to update group: Update failed');
        expect(notify.error).toHaveBeenCalledWith('Failed to delete group: Delete failed');
    });

    it('keeps reorder and set-goals success silent while surfacing errors', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        reorderActivityGroups.mockResolvedValueOnce({ data: { ok: true } });
        setActivityGroupGoals.mockResolvedValueOnce({ data: { id: 'group-1', goal_ids: ['goal-1'] } });
        reorderActivityGroups.mockRejectedValueOnce(new Error('Reorder failed'));
        setActivityGroupGoals.mockRejectedValueOnce(new Error('Set goals failed'));

        const { result } = renderHook(() => useActivities(), {
            wrapper: createWrapper(queryClient),
        });

        await act(async () => {
            await result.current.reorderActivityGroups('root-1', ['group-1']);
            await result.current.setActivityGroupGoals('root-1', 'group-1', ['goal-1']);
        });

        expect(notify.success).not.toHaveBeenCalled();

        await expect(result.current.reorderActivityGroups('root-1', ['group-1'])).rejects.toThrow('Reorder failed');
        await expect(result.current.setActivityGroupGoals('root-1', 'group-1', ['goal-1'])).rejects.toThrow('Set goals failed');

        expect(notify.error).toHaveBeenCalledWith('Failed to reorder groups: Reorder failed');
        expect(notify.error).toHaveBeenCalledWith('Failed to update group goals: Set goals failed');
    });
});
