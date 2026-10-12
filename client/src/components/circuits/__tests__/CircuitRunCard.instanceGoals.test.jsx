import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CircuitRunCard from '../CircuitRunCard';
vi.mock('../../../hooks/useCircuitQueries', () => ({
    useCircuitRunActions: () => ({ mutateAsync: vi.fn(), saveMemberMetrics: vi.fn(), isPending: false }),
}));
vi.mock('../../../hooks/useRootProgressSettings', () => ({
    useRootProgressSettings: () => ({ progressSettings: {} }),
}));
vi.mock('../../../utils/api', () => ({ fractalApi: {} }));

it('offers one-off links only for the two actual member instances', () => {
    const client = new QueryClient();
    const run = { id: 'run', name: 'Circuit', status: 'completed', round_count: 1,
        slots: [
            { id: 'slot-a', activity_name: 'Press', sort_order: 0, activity_instance_id: 'one' },
            { id: 'slot-b', activity_name: 'Burpee', sort_order: 1, activity_instance_id: 'two' },
        ],
        rounds: [{ id: 'round', round_number: 1, members: [
            { id: 'member-a', circuit_run_slot_id: 'slot-a', activity_instance_id: 'one', sort_order: 0 },
            { id: 'member-b', circuit_run_slot_id: 'slot-b', activity_instance_id: 'two', sort_order: 1 },
        ] }],
    };
    render(<QueryClientProvider client={client}>
        <CircuitRunCard rootId="root" sessionId="session" run={run}
            activityInstances={[{ id: 'one', associated_goal_ids: ['goal'] }, { id: 'two', associated_goal_ids: [] }]}
            activityGoalScope={{ goal: { id: 'goal', name: 'Practice' }, activityIds: [] }} />
    </QueryClientProvider>);
    expect(screen.getAllByRole('button', { name: 'Remove instance association with Practice' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Associate with Practice' })).toHaveLength(1);
});
