import { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '../queryKeys';
import { updateCircuitRunCache } from '../circuitQueryCache';


describe('circuitQueryCache', () => {
    it('replaces a mutated circuit run without refetching the run collection', () => {
        const client = new QueryClient();
        const key = queryKeys.sessionCircuitRuns('root', 'session');
        client.setQueryData(key, [{ id: 'run-1', planned_rounds: 1 }]);

        updateCircuitRunCache(client, 'root', 'session', 'addRound', {
            data: { id: 'run-1', planned_rounds: 2 },
        });

        expect(client.getQueryData(key)).toEqual([{ id: 'run-1', planned_rounds: 2 }]);
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
});
