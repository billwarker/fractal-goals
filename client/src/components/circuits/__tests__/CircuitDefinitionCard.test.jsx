import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import CircuitDefinitionCard from '../CircuitDefinitionCard';


const { archiveMutation, createMutation, updateMutation } = vi.hoisted(() => ({
    archiveMutation: { isPending: false, mutateAsync: vi.fn() },
    createMutation: { isPending: false, mutateAsync: vi.fn() },
    updateMutation: { isPending: false, mutateAsync: vi.fn() },
}));

vi.mock('../../../hooks/useCircuitQueries', () => ({
    useCircuitDefinitionMutations: () => ({ archiveMutation, createMutation, updateMutation }),
}));

vi.mock('../../../utils/logger', () => ({ logError: vi.fn() }));

const circuit = {
    id: 'circuit-1',
    name: 'Morning circuit',
    description: 'Start the day',
    planned_rounds: 3,
    version: 2,
    group_id: 'group-1',
    instantiation_summary: {
        instance_count: 4,
        last_used_at: '2026-07-20T12:00:00Z',
        average_duration_seconds: 780,
    },
    slots: [{
        id: 'slot-1',
        activity_definition_id: 'activity-1',
        activity: { id: 'activity-1', name: 'Press', has_sets: true },
    }],
};

describe('CircuitDefinitionCard', () => {
    beforeEach(() => {
        archiveMutation.mutateAsync.mockReset().mockResolvedValue({});
        createMutation.mutateAsync.mockReset().mockResolvedValue({});
        updateMutation.mutateAsync.mockReset().mockResolvedValue({});
    });

    it('shows circuit usage metadata using the shared catalogue format', () => {
        render(
            <CircuitDefinitionCard
                circuit={circuit}
                rootId="root-1"
                activities={[circuit.slots[0].activity]}
                activityGroups={[]}
            />,
        );

        expect(screen.getByText('4 instances')).toBeInTheDocument();
        expect(screen.getByText(/Last used: Jul 20, 2026/)).toBeInTheDocument();
        expect(screen.getByText('Avg: 13m')).toBeInTheDocument();
    });

    it('duplicates through a prefilled create flow without changing the source', async () => {
        render(
            <CircuitDefinitionCard
                circuit={circuit}
                rootId="root-1"
                activities={[circuit.slots[0].activity]}
                activityGroups={[{ id: 'group-1', name: 'Strength', parent_id: null }]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
        expect(screen.getByRole('dialog')).toHaveTextContent('Create Circuit');
        expect(screen.getByText('Name').parentElement.querySelector('input')).toHaveValue('Morning circuit (Copy)');
        fireEvent.click(screen.getByRole('button', { name: 'Save Circuit' }));

        await waitFor(() => expect(createMutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Morning circuit (Copy)',
            group_id: 'group-1',
            slots: [{ activity_definition_id: 'activity-1' }],
        })));
        expect(updateMutation.mutateAsync).not.toHaveBeenCalled();
    });

    it('opens the circuit builder from the shared catalogue card', () => {
        render(
            <CircuitDefinitionCard
                circuit={circuit}
                rootId="root-1"
                activities={[circuit.slots[0].activity]}
                activityGroups={[{ id: 'group-1', name: 'Strength', parent_id: null }]}
            />,
        );

        fireEvent.click(screen.getByText('Morning circuit'));
        expect(screen.getByRole('dialog')).toHaveTextContent('Edit Circuit');
        expect(screen.getByLabelText('Activity Group')).toHaveValue('group-1');
    });

    it('shows every circuit activity in its explicit vertical order', () => {
        const orderedCircuit = {
            ...circuit,
            slots: [
                { id: 'slot-1', activity: { name: 'Press' } },
                { id: 'slot-2', activity: { name: 'Burpee' } },
                { id: 'slot-3', activity: { name: 'Press' } },
                { id: 'slot-4', activity: { name: 'Row' } },
            ],
        };
        render(
            <CircuitDefinitionCard
                circuit={orderedCircuit}
                rootId="root-1"
                activities={[]}
                activityGroups={[]}
            />,
        );

        const list = screen.getByRole('list', { name: 'Circuit activities' });
        expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
            'Press', 'Burpee', 'Press', 'Row',
        ]);
        expect(screen.queryByText('+1 more')).not.toBeInTheDocument();
    });

    it('deletes a circuit without opening the editor', async () => {
        render(
            <CircuitDefinitionCard
                circuit={circuit}
                rootId="root-1"
                activities={[circuit.slots[0].activity]}
                activityGroups={[]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete Circuit' }));
        await waitFor(() => expect(archiveMutation.mutateAsync).toHaveBeenCalledWith('circuit-1'));
        expect(screen.queryByText('Delete Activity Circuit')).not.toBeInTheDocument();
    });
});
