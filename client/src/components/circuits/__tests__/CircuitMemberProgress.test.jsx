import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('../../../hooks/useCircuitQueries', () => ({
    useCircuitRunActions: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../../../hooks/useRootProgressSettings', () => ({
    useRootProgressSettings: () => ({ progressSettings: { delta_display_mode: 'percent' } }),
}));
vi.mock('../CircuitTagControls', () => ({
    CircuitMemberTagEditor: () => null,
    CircuitRoundTagControl: () => null,
    CircuitRunTagControl: () => null,
    collectCircuitAvailableTags: () => [],
}));

import CircuitRunCard from '../CircuitRunCard';

it('shows the dynamic progress update for each circuit round result', () => {
    const metric = { id: 'metric-weight', name: 'Weight', unit: 'lbs', input_type: 'number' };
    const member = (id, setId, value) => ({
        id,
        circuit_run_slot_id: 'slot-a',
        sort_order: 0,
        activity_set_id: setId,
        metrics: [{ metric_id: metric.id, value }],
    });
    render(
        <CircuitRunCard
            rootId="root"
            sessionId="session"
            run={{
                id: 'run-1',
                name: 'Progress circuit',
                status: 'completed',
                round_count: 2,
                slots: [{
                    id: 'slot-a',
                    activity_name: 'Press',
                    activity_definition_id: 'activity-a',
                    activity_instance_id: 'instance-a',
                    has_sets: true,
                    has_metrics: true,
                }],
                rounds: [
                    { id: 'round-1', round_number: 1, members: [member('member-1', 'set-a', 125)] },
                    { id: 'round-2', round_number: 2, members: [member('member-2', 'set-b', 80)] },
                ],
            }}
            itemNumber={1}
            activityDefinitions={[{
                id: 'activity-a',
                name: 'Press',
                has_metrics: true,
                metric_definitions: [metric],
            }]}
            activityInstances={[{
                id: 'instance-a',
                sets: [{ id: 'set-a' }, { id: 'set-b' }],
                progress_comparison: {
                    included: true,
                    metric_comparisons: [{
                        metric_id: metric.id,
                        set_comparisons: [
                            { set_index: 0, previous_value: 100, pct_change: 25, improved: true },
                            { set_index: 1, previous_value: 100, pct_change: -20, regressed: true },
                        ],
                    }],
                },
            }]}
            disabled
        />,
    );

    expect(screen.getByText('(▲25%)')).toBeInTheDocument();
    expect(screen.getByText('(▼20%)')).toBeInTheDocument();
});
