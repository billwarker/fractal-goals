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
vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({ getGoalIcon: () => 'circle', getGoalColor: () => '#3a7', getGoalSecondaryColor: () => '#153' }),
}));

const run = {
    id: 'run', name: 'Superset', status: 'completed', tags: [], slots: [],
    time_start: '2026-11-05T14:28:06.000Z', time_stop: '2026-11-05T14:54:58.000Z',
    rounds: [{ id: 'round', round_number: 1, tags: [], members: [] }],
};

const renderCard = (selectedCircuitItem) => render(
    <QueryClientProvider client={new QueryClient()}>
        <CircuitRunCard
            rootId="root"
            sessionId="session"
            run={run}
            itemNumber={5}
            activityInstances={[]}
            selectedCircuitItem={selectedCircuitItem}
            disabled
        />
    </QueryClientProvider>,
);

it('lets a completed session\'s circuit keep editing its tags, like an activity instance', () => {
    renderCard({ type: 'run', id: 'run', runId: 'run' });
    expect(screen.getByRole('button', { name: 'Add circuit tags' })).toBeEnabled();
});

it('lets a completed session\'s round keep editing its tags', () => {
    renderCard({ type: 'round', id: 'round', runId: 'run' });
    expect(screen.getByRole('button', { name: 'Add round 1 tags' })).toBeEnabled();
});

it('lets a completed session\'s circuit member keep editing its results, like an activity instance', () => {
    const metric = { id: 'weight', name: 'Weight', unit: 'lbs', input_type: 'number' };
    const member = (id, value) => ({ id, circuit_run_slot_id: 'slot', sort_order: 0, activity_instance_id: 'instance', metrics: value == null ? [] : [{ metric_id: 'weight', value }] });
    render(
        <QueryClientProvider client={new QueryClient()}>
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{
                    ...run,
                    slots: [{ id: 'slot', activity_name: 'Press', activity_definition_id: 'press', activity_instance_id: 'instance', has_metrics: true }],
                    rounds: [
                        { id: 'round', round_number: 1, tags: [], members: [member('first', 100)] },
                        { id: 'round-2', round_number: 2, tags: [], members: [member('second', null)] },
                    ],
                }}
                itemNumber={5}
                activityDefinitions={[{ id: 'press', name: 'Press', has_metrics: true, metric_definitions: [metric] }]}
                activityInstances={[{ id: 'instance' }]}
                disabled
            />
        </QueryClientProvider>,
    );
    const inputs = screen.getAllByLabelText(/Weight/);
    expect(inputs).toHaveLength(2);
    inputs.forEach((input) => expect(input).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Cascade lbs' })).toBeEnabled();
});

it('still locks the circuit itself in a completed session', () => {
    renderCard(null);
    expect(screen.queryByRole('button', { name: 'Delete circuit Superset' })).not.toBeInTheDocument();
});
