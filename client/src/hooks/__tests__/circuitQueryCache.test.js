import { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '../queryKeys';
import { refreshCircuitSessionConsumers, updateCircuitRunCache } from '../circuitQueryCache';


describe('circuitQueryCache', () => {
    it('replaces a mutated circuit run without refetching the run collection', () => {
        const client = new QueryClient();
        const key = queryKeys.sessionCircuitRuns('root', 'session');
        client.setQueryData(key, [{ id: 'run-1', round_count: 1 }]);

        updateCircuitRunCache(client, 'root', 'session', 'addRound', {
            data: { id: 'run-1', round_count: 2 },
        });

        expect(client.getQueryData(key)).toEqual([{ id: 'run-1', round_count: 2 }]);
    });

    it('adds newly created runs and removes deleted runs', () => {
        const client = new QueryClient();
        const key = queryKeys.sessionCircuitRuns('root', 'session');
        client.setQueryData(key, [{ id: 'run-1' }]);

        updateCircuitRunCache(client, 'root', 'session', 'createRun', { data: { id: 'run-2' } });
        expect(client.getQueryData(key)).toEqual([{ id: 'run-1' }, { id: 'run-2' }]);

        updateCircuitRunCache(client, 'root', 'session', 'deleteRun', { data: { id: 'run-1' } });
        expect(client.getQueryData(key)).toEqual([{ id: 'run-2' }]);
    });

    it('invalidates the canonical run collection and dependent summaries', async () => {
        const client = new QueryClient();
        const runKey = queryKeys.sessionCircuitRuns('root', 'session');
        const circuitKey = queryKeys.circuits('root');
        const sessionsKey = queryKeys.sessions('root');
        client.setQueryData(runKey, [{ id: 'run-1' }]);
        client.setQueryData(circuitKey, [{ id: 'definition-1' }]);
        client.setQueryData(sessionsKey, [{ id: 'session' }]);

        await refreshCircuitSessionConsumers(client, 'root', 'session', 'completeRun');

        expect(client.getQueryState(runKey)?.isInvalidated).toBe(true);
        expect(client.getQueryState(circuitKey)?.isInvalidated).toBe(true);
        expect(client.getQueryState(sessionsKey)?.isInvalidated).toBe(true);
    });

    it('keeps an authoritative member-metric run response fresh while refreshing dependents', async () => {
        const client = new QueryClient();
        const runKey = queryKeys.sessionCircuitRuns('root', 'session');
        const activitiesKey = queryKeys.sessionActivities('root', 'session');
        client.setQueryData(runKey, [{ id: 'run-1' }]);
        client.setQueryData(activitiesKey, [{ id: 'instance-1' }]);

        await refreshCircuitSessionConsumers(client, 'root', 'session', 'updateMemberMetrics');

        expect(client.getQueryState(runKey)?.isInvalidated).toBe(false);
        expect(client.getQueryState(activitiesKey)?.isInvalidated).toBe(true);
    });
});
