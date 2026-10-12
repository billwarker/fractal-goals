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

it('offers one-off links only for the selected member instance while goal-scoped', () => {
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
    const view = (selection, scoped = true) => <QueryClientProvider client={client}>
        <CircuitRunCard rootId="root" sessionId="session" run={run}
            selectedCircuitItem={selection}
            activityInstances={[{ id: 'one', associated_goal_ids: ['goal'] }, { id: 'two', associated_goal_ids: [] }]}
            activityGoalScope={scoped ? { goal: { id: 'goal', name: 'Practice' }, activityIds: [] } : null} />
    </QueryClientProvider>;
    const { rerender } = render(view(null));
    expect(screen.queryByRole('button', { name: /instance association|Associate with/ })).not.toBeInTheDocument();
    rerender(view({ type: 'run', runId: 'run' }));
    expect(screen.queryByRole('button', { name: /instance association|Associate with/ })).not.toBeInTheDocument();
    rerender(view({ type: 'member', runId: 'run', id: 'member-a' }));
    expect(screen.getByRole('button', { name: 'Remove instance association with Practice' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Associate with Practice' })).not.toBeInTheDocument();
    rerender(view({ type: 'member', runId: 'run', id: 'member-b' }));
    expect(screen.queryByRole('button', { name: 'Remove instance association with Practice' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Associate with Practice' })).toBeInTheDocument();
    rerender(view({ type: 'member', runId: 'run', id: 'member-b' }, false));
    expect(screen.queryByRole('button', { name: /instance association|Associate with/ })).not.toBeInTheDocument();
});
