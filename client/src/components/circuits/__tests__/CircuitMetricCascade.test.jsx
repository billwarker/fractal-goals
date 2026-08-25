import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mutateAsync = vi.fn();
vi.mock('../../../hooks/useCircuitQueries', () => ({
    useCircuitRunActions: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('../../../hooks/useRootProgressSettings', () => ({
    useRootProgressSettings: () => ({ progressSettings: { delta_display_mode: 'percent' } }),
}));

import CircuitRunCard from '../CircuitRunCard';


it('cascades a zero metric into later empty rounds of the same slot', async () => {
    mutateAsync.mockReset().mockResolvedValue({ data: {} });
    const run = {
        id: 'run-1',
        name: 'Conditioning',
        status: 'active',
        round_count: 2,
        slots: [{
            id: 'slot-a',
            sort_order: 0,
            activity_name: 'Press',
            activity_definition_id: 'activity-a',
            activity_instance_id: 'instance-a',
            has_sets: true,
            has_metrics: true,
        }],
        rounds: [
            {
                id: 'round-1',
                round_number: 1,
                members: [{
                    id: 'member-a',
                    circuit_run_slot_id: 'slot-a',
                    sort_order: 0,
                    activity_set_id: 'set-a',
                    metrics: [{ metric_id: 'metric-weight', value: 0 }],
                }],
            },
            {
                id: 'round-2',
                round_number: 2,
                members: [{
                    id: 'member-a-2',
                    circuit_run_slot_id: 'slot-a',
                    sort_order: 0,
                    activity_set_id: 'set-a-2',
                    metrics: [],
                }],
            },
        ],
    };
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
        <QueryClientProvider client={queryClient}>
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={run}
                itemNumber={3}
                activityInstances={[{
                    id: 'instance-a',
                    sets: [{ id: 'set-a' }, { id: 'set-a-2' }],
                }]}
                activityDefinitions={[{
                    id: 'activity-a',
                    name: 'Press',
                    has_metrics: true,
                    has_splits: false,
                    metric_definitions: [{
                        id: 'metric-weight',
                        name: 'Weight',
                        unit: 'lbs',
                        input_type: 'number',
                    }],
                    split_definitions: [],
                }]}
            />
        </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cascade lbs' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
        action: 'cascadeMemberMetric',
        runId: 'run-1',
        memberId: 'member-a',
        value: { metricId: 'metric-weight', splitId: null },
    }));
});
