import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import CircuitBuilderModal from '../CircuitBuilderModal';


describe('CircuitBuilderModal', () => {
    it('updates the create header from the live trimmed circuit name', () => {
        render(
            <CircuitBuilderModal
                isOpen
                onClose={vi.fn()}
                onSave={vi.fn()}
                activities={[]}
                activityGroups={[]}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Create Circuit' })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Strength Pairing  ' } });
        expect(screen.getByRole('heading', { name: 'Create Circuit: Strength Pairing' })).toBeInTheDocument();
    });

    it('uses the live draft name with edit and copy action labels', () => {
        const sharedProps = {
            isOpen: true,
            onClose: vi.fn(),
            onSave: vi.fn(),
            activities: [],
            activityGroups: [],
        };
        const { unmount } = render(
            <CircuitBuilderModal
                {...sharedProps}
                circuit={{ id: 'circuit-1', name: 'Original Circuit', slots: [] }}
            />,
        );
        expect(screen.getByRole('heading', { name: 'Edit Circuit: Original Circuit' })).toBeInTheDocument();

        unmount();
        render(
            <CircuitBuilderModal
                {...sharedProps}
                circuit={{ name: 'Original Circuit (Copy)', slots: [] }}
                isCopy
            />,
        );
        expect(screen.getByRole('heading', {
            name: 'Create Circuit: Original Circuit (Copy)',
        })).toBeInTheDocument();
    });

    it('preserves duplicate slots and their explicit order', async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <CircuitBuilderModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={onSave}
                activities={[
                    { id: 'sets', name: 'Press', has_sets: true },
                    { id: 'plain', name: 'Burpee', has_sets: false },
                ]}
                activityGroups={[]}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: '+ Add Activity' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select Press' }));
        fireEvent.click(screen.getByRole('button', { name: '+ Add Activity' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select Burpee' }));

        expect(screen.queryByText(/one activity instance per round/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/one set per round/i)).not.toBeInTheDocument();
        const firstSlot = screen.getAllByRole('listitem')[0];
        expect(firstSlot.children).toHaveLength(2);
        expect(firstSlot.children[0]).toHaveTextContent('Press');
        expect(firstSlot.children[1]).toContainElement(screen.getAllByLabelText('Move activity up')[0]);
        expect(firstSlot.children[1]).toContainElement(screen.getByLabelText('Remove Press'));

        fireEvent.click(screen.getByRole('button', { name: '+ Add Activity' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select Press' }));
        fireEvent.click(screen.getAllByLabelText('Move activity up')[2]);
        fireEvent.change(screen.getByText('Name').parentElement.querySelector('input'), { target: { value: 'Mixed Circuit' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Circuit' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave.mock.calls[0][0].slots.map((slot) => slot.activity_definition_id)).toEqual([
            'sets', 'sets', 'plain',
        ]);
    });

    it('saves the selected activity group', async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <CircuitBuilderModal
                isOpen
                onClose={vi.fn()}
                onSave={onSave}
                activities={[{ id: 'plain', name: 'Burpee', has_sets: false }]}
                activityGroups={[{ id: 'group-1', name: 'Conditioning', parent_id: null }]}
            />,
        );

        const groupField = screen.getByLabelText('Activity Group');
        expect(groupField).toBeInTheDocument();
        expect(screen.queryByLabelText('Planned rounds')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Activity Group'), { target: { value: 'group-1' } });
        fireEvent.change(screen.getByText('Name').parentElement.querySelector('input'), { target: { value: 'Finisher' } });
        fireEvent.click(screen.getByRole('button', { name: '+ Add Activity' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select Burpee' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save Circuit' }));

        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ group_id: 'group-1' })));
        expect(onSave.mock.calls[0][0]).not.toHaveProperty('planned_rounds');
    });
});
