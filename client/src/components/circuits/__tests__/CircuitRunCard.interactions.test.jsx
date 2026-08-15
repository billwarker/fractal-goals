import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mutateAsync = vi.fn();
vi.mock('../../../hooks/useCircuitQueries', () => ({
    useCircuitRunActions: () => ({ mutateAsync, isPending: false }),
}));

import CircuitRunCard from '../CircuitRunCard';


const slot = {
    id: 'slot-a',
    sort_order: 0,
    activity_name: 'A long circuit activity name',
    activity_definition_id: 'activity-a',
    has_sets: false,
    has_metrics: false,
};
const makeRound = (roundNumber) => ({
    id: `round-${roundNumber}`,
    round_number: roundNumber,
    members: [{
        id: `member-${roundNumber}`,
        circuit_run_slot_id: 'slot-a',
        sort_order: 0,
        activity_instance_id: `instance-${roundNumber}`,
    }],
});
const makeRun = (roundCount = 1) => ({
    id: 'run-1',
    name: 'Conditioning',
    status: 'active',
    round_count: roundCount,
    duration_seconds: 30,
    slots: [slot],
    rounds: Array.from({ length: roundCount }, (_, index) => makeRound(index + 1)),
});

describe('CircuitRunCard selection and scale behavior', () => {
    beforeEach(() => mutateAsync.mockReset());

    it('uses singular round copy for the final hidden round', () => {
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={makeRun(11)}
                itemNumber={1}
                activityInstances={[]}
            />,
        );

        expect(screen.getByRole('button', { name: 'Show 1 more round' })).toBeInTheDocument();
        expect(screen.queryByText('Show 1 more rounds')).not.toBeInTheDocument();
    });

    it.each([
        ['Enter'],
        [' '],
    ])('selects the circuit, round, and member from the keyboard with %s', (key) => {
        const onSelectCircuitItem = vi.fn();
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={makeRun()}
                itemNumber={3}
                activityInstances={[{ id: 'instance-1' }]}
                onSelectCircuitItem={onSelectCircuitItem}
            />,
        );

        fireEvent.keyDown(screen.getByRole('group', { name: 'Activity circuit Conditioning' }), { key });
        expect(onSelectCircuitItem).toHaveBeenLastCalledWith({ type: 'run', runId: 'run-1', id: 'run-1' });
        fireEvent.keyDown(screen.getByRole('group', { name: 'Round 1' }), { key });
        expect(onSelectCircuitItem).toHaveBeenLastCalledWith({ type: 'round', runId: 'run-1', id: 'round-1' });
        fireEvent.keyDown(screen.getByRole('group', { name: '1.1 A long circuit activity name' }), { key });
        expect(onSelectCircuitItem).toHaveBeenLastCalledWith({
            type: 'member',
            runId: 'run-1',
            id: 'member-1',
            instanceId: 'instance-1',
            setIndex: null,
        });
    });

    it('bounds initial round rendering and progressively reveals more work', () => {
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={makeRun(25)}
                itemNumber={3}
                activityInstances={[]}
            />,
        );

        expect(screen.getByText('Round 10')).toBeInTheDocument();
        expect(screen.queryByText('Round 11')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show 10 more rounds' }));
        expect(screen.getByText('Round 20')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show 5 more rounds' }));
        expect(screen.getByText('Round 25')).toBeInTheDocument();
    });

    it('keeps the mobile member identity in a compact index-and-name grid', () => {
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={makeRun()}
                itemNumber={3}
                activityInstances={[]}
            />,
        );

        const member = screen.getByRole('group', { name: '1.1 A long circuit activity name' });
        expect(member.querySelector('[title="Activity 1.1 in this session"]')).toHaveTextContent('#1.1');
        expect(screen.getByText('A long circuit activity name').closest('button')).toBeNull();
    });

    it('exposes edit and duplicate actions only for the selected circuit', () => {
        const onEditDefinition = vi.fn();
        const onDuplicate = vi.fn();
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={makeRun()}
                itemNumber={3}
                activityInstances={[]}
                selectedCircuitItem={{ type: 'run', runId: 'run-1', id: 'run-1' }}
                onEditDefinition={onEditDefinition}
                onDuplicate={onDuplicate}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Edit Conditioning' }));
        expect(onEditDefinition).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole('button', { name: 'Conditioning options' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate instance' }));
        expect(onDuplicate).toHaveBeenCalledOnce();
    });

    it('allows the shared options menu to extend beyond the circuit card', () => {
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={makeRun()}
                itemNumber={3}
                activityInstances={[]}
                selectedCircuitItem={{ type: 'run', runId: 'run-1', id: 'run-1' }}
                onDuplicate={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Conditioning options' }));
        const menu = screen.getByRole('menu', { name: 'Conditioning circuit options' });
        const circuitCard = menu.closest('[data-session-circuit-card="true"]');

        expect(circuitCard).toBeInTheDocument();
        expect(getComputedStyle(circuitCard).overflow).not.toBe('hidden');
    });
});
