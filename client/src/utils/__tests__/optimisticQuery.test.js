import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { applyOptimisticQueryUpdate, captureQueryRollback } from '../optimisticQuery';

describe('optimisticQuery', () => {
    it('captures a rollback snapshot for query data', () => {
        const queryClient = new QueryClient();
        const queryKey = ['activities', 'root-1', 'session-1'];
        queryClient.setQueryData(queryKey, [{ id: 'a-1', completed: false }]);

        const rollback = captureQueryRollback(queryClient, queryKey);
        queryClient.setQueryData(queryKey, [{ id: 'a-1', completed: true }]);

        rollback();

        expect(queryClient.getQueryData(queryKey)).toEqual([{ id: 'a-1', completed: false }]);
    });

    it('applies an optimistic update and returns a rollback closure', () => {
        const queryClient = new QueryClient();
        const queryKey = ['activities', 'root-1', 'session-1'];
        queryClient.setQueryData(queryKey, [{ id: 'a-1', completed: false }]);

        const rollback = applyOptimisticQueryUpdate({
            queryClient,
            queryKey,
            updater: (current = []) => current.map((item) => (
                item.id === 'a-1' ? { ...item, completed: true } : item
            )),
        });

        expect(queryClient.getQueryData(queryKey)).toEqual([{ id: 'a-1', completed: true }]);

        rollback();

        expect(queryClient.getQueryData(queryKey)).toEqual([{ id: 'a-1', completed: false }]);
    });
});
